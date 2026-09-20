"""
입장 관리(Admission Control) — LLM 으로 내보내는 요청을 선착순 N개로 묶고,
나머지는 줄을 세웠다가 자리가 나는 순간 '자동으로' 내보낸다.

왜 필요한가?
    동시 접속이 몰리면 LLM 공급자가 429(rate limit)를 뱉는다. 그러면 사용자는
    '실패'를 보고 다시 버튼을 눌러야 하고, 그 재시도가 다시 429 를 만든다.
    앞단에서 줄을 세우면 공급자에 나가는 동시 요청 수가 고정되고,
    사용자는 실패 대신 '잠깐 기다림'을 겪는다.

핵심 성질:
    · FIFO — 먼저 온 사람이 먼저 나간다. deque 로 순서를 보장한다.
    · 자동 승급 — 앞사람이 끝나면 다음 사람의 future 가 풀린다.
      사용자가 버튼을 다시 누를 필요가 없다('예약 서비스').
    · 한도 — 줄이 max_waiting 을 넘으면 즉시 거절(QueueFull),
      wait_timeout 을 넘으면 포기(QueueTimeout). 무한 대기로 방치하지 않는다.
    · 누수 방지 — 클라이언트가 중간에 창을 닫으면(CancelledError) 자리를
      반납하고 줄에서 빠진다. 이게 빠지면 한 명이 슬롯을 영영 물고 있게 된다.

범위(중요):
    이 게이트는 '프로세스 1개' 기준이다. uvicorn 을 --workers N 으로 띄우면
    게이트도 N 벌이 생겨 실제 동시 호출은 capacity × workers 가 된다.
    워커를 늘릴 거면 Redis 등 공유 저장소 기반으로 바꿔야 한다.

사용법:
    ticket = gate.reserve()          # 동기. 줄이 꽉 찼으면 QueueFull
    if ticket.position > 0: ...      # 대기 안내를 먼저 내보낼 수 있다
    try:
        await ticket.wait()          # 내 차례까지 대기. 늦으면 QueueTimeout
        ...LLM 호출...
    finally:
        ticket.release()             # 예외/취소 어느 경로로 나가든 반드시
"""
from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Optional


class QueueFull(Exception):
    """줄이 이미 꽉 차서 표를 못 준다."""

    def __init__(self, waiting: int, max_waiting: int):
        self.waiting = waiting
        self.max_waiting = max_waiting
        super().__init__(f"대기열 가득 참 ({waiting}/{max_waiting})")


class QueueTimeout(Exception):
    """줄은 섰지만 제한 시간 안에 차례가 오지 않았다."""

    def __init__(self, waited: float, timeout: float):
        self.waited = waited
        self.timeout = timeout
        super().__init__(f"대기 시간 초과 ({waited:.1f}s / {timeout:.0f}s)")


class Ticket:
    """줄에서의 내 자리. reserve() 가 만들고, release() 로 반드시 닫는다."""

    __slots__ = ("_gate", "_future", "position", "enqueued_at",
                 "_holds_slot", "_released")

    def __init__(self, gate: "AdmissionGate", position: int, granted: bool):
        self._gate = gate
        self.position = position          # 0 이면 기다리지 않고 바로 통과
        self.enqueued_at = time.monotonic()
        self._holds_slot = granted        # 지금 슬롯을 점유 중인가
        self._released = False
        self._future: Optional[asyncio.Future] = (
            None if granted else asyncio.get_running_loop().create_future()
        )

    @property
    def queued(self) -> bool:
        return self.position > 0

    async def wait(self) -> float:
        """내 차례까지 기다린다. 반환값은 실제로 기다린 초."""
        if self._holds_slot:
            return 0.0
        assert self._future is not None
        try:
            await asyncio.wait_for(self._future, self._gate.wait_timeout)
        except (asyncio.TimeoutError, asyncio.CancelledError) as exc:
            waited = time.monotonic() - self.enqueued_at
            # 타임아웃/취소가 울리기 '직전'에 자리를 받았을 수 있다.
            # 그 경우 슬롯은 이미 내 것이므로 버리지 않고 그대로 진행한다.
            if self._future.done() and not self._future.cancelled():
                self._holds_slot = True
                self._gate._note_wait(waited)
                return waited
            self._gate._forget(self)
            if isinstance(exc, asyncio.CancelledError):
                raise  # 클라이언트가 창을 닫음 — 조용히 정리만 하고 전파
            self._gate.timed_out += 1
            raise QueueTimeout(waited, self._gate.wait_timeout) from None
        self._holds_slot = True
        waited = time.monotonic() - self.enqueued_at
        self._gate._note_wait(waited)
        return waited

    def release(self) -> None:
        """슬롯을 반납하고 다음 사람을 들여보낸다. 여러 번 불러도 안전."""
        if self._released:
            return
        self._released = True
        if self._holds_slot:
            self._gate._release_slot()
        else:
            self._gate._forget(self)


class AdmissionGate:
    def __init__(self, *, capacity: int, max_waiting: int,
                 wait_timeout: float, name: str = "llm"):
        self.name = name
        self.capacity = max(1, int(capacity))
        self.max_waiting = max(0, int(max_waiting))
        self.wait_timeout = float(wait_timeout)

        self._active = 0
        self._waiters: deque[Ticket] = deque()
        self._pool_checked = False

        # 관측용 누적 지표 (/health 에 노출)
        self.served = 0        # 슬롯을 받아 실제로 나간 요청
        self.queued = 0        # 한 번이라도 줄을 선 요청
        self.rejected = 0      # 줄이 꽉 차서 거절
        self.timed_out = 0     # 기다리다 포기
        self.peak_waiting = 0  # 동시에 줄 선 최대 인원
        self.max_wait_s = 0.0  # 가장 오래 기다린 시간

    # ── 상태 ──
    @property
    def active(self) -> int:
        return self._active

    @property
    def waiting(self) -> int:
        return len(self._waiters)

    def stats(self) -> dict:
        return {
            "capacity": self.capacity,
            "max_waiting": self.max_waiting,
            "wait_timeout_s": self.wait_timeout,
            "active": self._active,
            "waiting": self.waiting,
            "served": self.served,
            "queued": self.queued,
            "rejected": self.rejected,
            "timed_out": self.timed_out,
            "peak_waiting": self.peak_waiting,
            "max_wait_s": round(self.max_wait_s, 2),
        }

    # ── 표 발급 ──
    def reserve(self) -> Ticket:
        """동기이고 중간에 await 가 없다 → 이벤트 루프에서 원자적으로 동작한다.
        그래서 '두 요청이 동시에 마지막 슬롯을 가져가는' 경합이 생기지 않는다."""
        self._ensure_threadpool()

        if self._active < self.capacity:
            self._active += 1
            return Ticket(self, position=0, granted=True)

        if self.waiting >= self.max_waiting:
            self.rejected += 1
            raise QueueFull(self.waiting, self.max_waiting)

        ticket = Ticket(self, position=self.waiting + 1, granted=False)
        self._waiters.append(ticket)
        self.queued += 1
        self.peak_waiting = max(self.peak_waiting, self.waiting)
        return ticket

    # ── 내부 ──
    def _release_slot(self) -> None:
        self._active = max(0, self._active - 1)
        self.served += 1
        self._promote()

    def _promote(self) -> None:
        """자리가 남는 만큼 줄 앞에서부터 들여보낸다."""
        while self._waiters and self._active < self.capacity:
            ticket = self._waiters.popleft()
            fut = ticket._future
            if fut is None or fut.done():
                continue  # 이미 취소됨(창을 닫았거나 타임아웃) → 건너뛴다
            self._active += 1
            fut.set_result(True)

    def _forget(self, ticket: Ticket) -> None:
        try:
            self._waiters.remove(ticket)
        except ValueError:
            pass

    def _note_wait(self, waited: float) -> None:
        self.max_wait_s = max(self.max_wait_s, waited)

    def _ensure_threadpool(self) -> None:
        """capacity 를 올려도 스레드풀이 작으면 거기가 진짜 병목이 된다.
        (동기 LLM 호출을 asyncio.to_thread 로 돌리기 때문. anyio 기본값은 40.)
        게이트가 유일한 병목이 되도록 첫 호출 때 한 번 올려둔다."""
        if self._pool_checked:
            return
        self._pool_checked = True
        try:
            import anyio.to_thread

            limiter = anyio.to_thread.current_default_thread_limiter()
            need = self.capacity + 8
            if limiter.total_tokens < need:
                print(f"[admission] 스레드풀 {limiter.total_tokens} → {need} 로 확장")
                limiter.total_tokens = need
        except Exception as e:  # anyio 버전 차이 등 — 치명적이지 않다
            print(f"[admission] 스레드풀 확장 실패(무시): {e}")


# ── 사용자에게 보여줄 안내문구 ────────────────────────────────
# 일상적이고 포근한 말투. 장애처럼 읽히면 안 된다 — 실제로 장애가 아니라
# '차례를 기다리는 중'이고, 기다리면 반드시 답이 온다.
QUEUE_NOTICE = "지금 모모에게 이야기가 조금 몰렸어요. 자리 맡아뒀으니 잠깐만요, 차례가 되면 바로 이어서 들려줄게요."
BUSY_NOTICE = "오늘따라 모모를 찾는 마음이 많네요. 잠시 뒤에 다시 말 걸어줄래요? 쓴 이야기는 그대로 남겨둘게요."
