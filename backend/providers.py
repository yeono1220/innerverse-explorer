"""
Provider 계층 — 축 2: vLLM 서버가 '어디에' 있는지 해결한다.

이 레이어의 유일한 책임:
    VLLM_PROVIDER 설정을 보고 → (base_url, api_key) 한 쌍을 만들어 준다.

왜 분리하는가?
    - VllmAnalyzer 는 "OpenAI 호환 서버를 호출"만 한다. 그 서버가 Modal 이든
      RunPod 이든 로컬이든 관심 없다.
    - 따라서 축 2(서빙 위치)를 축 1(분석기)에서 완전히 떼어낸다.

주의:
    이 레이어는 ANALYZER_BACKEND=vllm 일 때만 호출된다.
    gemini/dummy 를 쓰면 provider 는 아예 접근되지 않는다
"""
from __future__ import annotations

import abc
from dataclasses import dataclass

from config import settings


@dataclass
class VllmEndpoint:
    """vLLM 서버 접속 정보. VllmAnalyzer 는 이것만 받으면 된다."""
    base_url: str
    api_key: str


class VllmProvider(abc.ABC):
    name: str = "base"

    @abc.abstractmethod
    def endpoint(self) -> VllmEndpoint:
        """(base_url, api_key) 를 만들어 반환. 설정 누락 시 예외를 던진다."""
        raise NotImplementedError


# ─────────────────────────────────────────────────────────────
# Modal — 서버리스에 띄운 vLLM
# 배포 후 나온 웹 URL 뒤에 /v1 을 붙여 OpenAI 호환 경로를 만든다.
# ─────────────────────────────────────────────────────────────
class ModalProvider(VllmProvider):
    name = "modal"

    def endpoint(self) -> VllmEndpoint:
        if not settings.MODAL_VLLM_URL:
            raise RuntimeError(
                "MODAL_VLLM_URL 이 비어 있습니다. "
                "modal deploy 후 나온 엔드포인트 URL을 넣으세요."
            )
        base = settings.MODAL_VLLM_URL.rstrip("/")
        if not base.endswith("/v1"):
            base = base + "/v1"
        return VllmEndpoint(base_url=base, api_key=settings.MODAL_VLLM_TOKEN)


# ─────────────────────────────────────────────────────────────
# RunPod — Pod 직접 노출 또는 Serverless
# 두 방식 모두 URL 형태만 다르고 OpenAI 호환이라 동일하게 처리된다.
#   Pod:        http://<pod-id>-8000.proxy.runpod.net/v1
#   Serverless: https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1
# ─────────────────────────────────────────────────────────────
class RunpodProvider(VllmProvider):
    name = "runpod"

    def endpoint(self) -> VllmEndpoint:
        if not settings.RUNPOD_VLLM_URL:
            raise RuntimeError(
                "RUNPOD_VLLM_URL 이 비어 있습니다. "
                "RunPod Pod/Serverless 의 엔드포인트 URL을 넣으세요."
            )
        base = settings.RUNPOD_VLLM_URL.rstrip("/")
        if not base.endswith("/v1"):
            base = base + "/v1"
        # Serverless 는 RunPod API 키가 필요. Pod 직접 노출은 보통 불필요(not-needed).
        key = settings.RUNPOD_API_KEY or "not-needed"
        return VllmEndpoint(base_url=base, api_key=key)


# ─────────────────────────────────────────────────────────────
# Custom — 직접 URL 지정 (로컬 vLLM, Colab+ngrok, 기타)
# ─────────────────────────────────────────────────────────────
class CustomProvider(VllmProvider):
    name = "custom"

    def endpoint(self) -> VllmEndpoint:
        base = settings.VLLM_BASE_URL.rstrip("/")
        if not base.endswith("/v1"):
            base = base + "/v1"
        return VllmEndpoint(base_url=base, api_key=settings.VLLM_API_KEY)


_PROVIDER_REGISTRY: dict[str, type[VllmProvider]] = {
    "modal": ModalProvider,
    "runpod": RunpodProvider,
    "custom": CustomProvider,
}


def build_provider(provider: str | None = None) -> VllmProvider:
    """
    provider 지정이 없으면 settings.VLLM_PROVIDER 사용.
    알 수 없는 값이면 custom 으로 안전하게 떨어진다.
    """
    key = (provider or settings.VLLM_PROVIDER).lower()
    cls = _PROVIDER_REGISTRY.get(key)
    if cls is None:
        print(f"[providers] 알 수 없는 VLLM_PROVIDER='{key}', custom 으로 대체")
        cls = CustomProvider
    return cls()
