"""
INNERVERSE — 인증 라우터 (/api/auth/*)

역할
  Supabase GoTrue(REST)를 백엔드가 감싸서, 프론트가 하나의 API 규격만 보게 한다.
  프론트가 supabase-js 로 직접 호출해도 되지만, 백엔드를 통과시키면:
    · 로그인 시도 레이트리밋(무차별 대입 방어)을 서버에서 강제할 수 있고
    · 비밀번호 정책·에러 메시지(한국어)를 한곳에서 관리하고
    · 계정 존재 여부 노출(user enumeration)을 막을 수 있다.

제공 엔드포인트 (이메일 전용)
    POST /api/auth/signup            회원가입 + 인증메일 발송
    POST /api/auth/login             이메일/비밀번호 로그인 → access/refresh 토큰
    POST /api/auth/refresh           refresh_token 으로 access_token 재발급
    POST /api/auth/logout            현재 세션 종료
    POST /api/auth/password/forgot   비밀번호 재설정 메일 발송
    POST /api/auth/password/update   (로그인 상태) 비밀번호 변경
    POST /api/auth/verify/resend     인증메일 재발송
    GET  /api/auth/me                내 정보(토큰 claims 기반, 네트워크 호출 없음)
    GET  /api/auth/providers         지원 로그인 수단 목록
    POST /api/auth/oauth/kakao       ▶ 501 "준비 중" 안내 (추후 오픈)

소셜 로그인
    카카오는 아직 열지 않았다. 프론트가 호출하면 501 과 함께 안내 문구를 돌려주므로,
    화면에서는 그 message 를 그대로 토스트로 띄우면 된다.
"""
from __future__ import annotations

import re
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field

from auth import (
    CurrentUser,
    auth_settings,
    ip_rate_limit,
    require_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ─────────────────────────────────────────────────────────────────────────────
# 카카오 — 추후 오픈 예정
# ─────────────────────────────────────────────────────────────────────────────
KAKAO_NOTICE = "카카오 로그인은 아직 준비 중이에요. 지금은 이메일로 가입/로그인해 주세요. (추후 업데이트에서 제공될 예정입니다)"

SUPPORTED_PROVIDERS: dict[str, dict[str, Any]] = {
    "email": {"enabled": True, "status": "available", "label": "이메일로 계속하기"},
    "kakao": {"enabled": False, "status": "coming_soon", "label": "카카오로 계속하기", "message": KAKAO_NOTICE},
}


# ─────────────────────────────────────────────────────────────────────────────
# 요청/응답 모델
# ─────────────────────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)  # bcrypt 상한 72바이트
    nickname: Optional[str] = Field(default=None, max_length=20)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class RefreshRequest(BaseModel):
    refresh_token: str


class EmailOnlyRequest(BaseModel):
    email: EmailStr


class PasswordUpdateRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=72)


class SessionResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 3600
    user: dict = Field(default_factory=dict)


class MessageResponse(BaseModel):
    ok: bool = True
    message: str
    needs_email_verification: bool = False


# ─────────────────────────────────────────────────────────────────────────────
# 비밀번호 정책
# ─────────────────────────────────────────────────────────────────────────────
def validate_password(pw: str) -> None:
    """
    최소선만 강제한다(사용자를 지치게 하지 않으면서 사전 공격을 막는 수준):
      · 8자 이상
      · 영문/숫자/기호 중 2종류 이상
      · 흔한 비밀번호 블랙리스트 제외
    """
    problems: list[str] = []
    if len(pw) < 8:
        problems.append("8자 이상")

    kinds = sum(
        [
            bool(re.search(r"[a-zA-Z]", pw)),
            bool(re.search(r"[0-9]", pw)),
            bool(re.search(r"[^a-zA-Z0-9]", pw)),
        ]
    )
    if kinds < 2:
        problems.append("영문·숫자·기호 중 2종류 이상 조합")

    common = {"password", "12345678", "qwerty123", "innerverse", "11111111", "abcd1234"}
    if pw.lower() in common:
        problems.append("추측하기 쉬운 비밀번호는 사용할 수 없어요")

    if problems:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "weak_password", "message": "비밀번호는 " + ", ".join(problems) + " 이어야 해요."},
        )


# ─────────────────────────────────────────────────────────────────────────────
# GoTrue 호출 헬퍼
# ─────────────────────────────────────────────────────────────────────────────
def _gotrue_base() -> str:
    if not auth_settings.SUPABASE_URL or not auth_settings.SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "auth_not_configured",
                "message": "서버에 SUPABASE_URL / SUPABASE_ANON_KEY 가 설정되지 않았습니다.",
            },
        )
    return f"{auth_settings.SUPABASE_URL}/auth/v1"


def _headers(access_token: Optional[str] = None) -> dict[str, str]:
    key = auth_settings.SUPABASE_ANON_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {access_token or key}",
        "Content-Type": "application/json",
    }


# GoTrue 원문 에러 → 사용자에게 보여줄 한국어 문구
_ERROR_MAP: list[tuple[str, str]] = [
    ("invalid login credentials", "이메일 또는 비밀번호가 올바르지 않습니다."),
    ("email not confirmed", "이메일 인증이 완료되지 않았어요. 메일함의 인증 링크를 눌러 주세요."),
    ("user already registered", "이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해 주세요."),
    ("password should be at least", "비밀번호가 너무 짧습니다."),
    ("for security purposes", "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요."),
    ("email rate limit exceeded", "메일 발송 한도를 넘었어요. 잠시 후 다시 시도해 주세요."),
    ("invalid refresh token", "세션이 만료되었어요. 다시 로그인해 주세요."),
    ("refresh_token_not_found", "세션이 만료되었어요. 다시 로그인해 주세요."),
    ("unsupported provider", "지원하지 않는 로그인 방식이에요."),
]


def _friendly(raw: str, fallback: str) -> str:
    low = (raw or "").lower()
    for needle, msg in _ERROR_MAP:
        if needle in low:
            return msg
    return fallback


async def _post(path: str, *, json: dict, token: Optional[str] = None, params: Optional[dict] = None) -> httpx.Response:
    url = f"{_gotrue_base()}{path}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            return await client.post(url, json=json, headers=_headers(token), params=params)
    except httpx.HTTPError as e:
        print(f"[auth] GoTrue 통신 실패 {path}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "auth_upstream_error", "message": "인증 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."},
        )


def _raise_from(resp: httpx.Response, fallback: str, *, force_status: Optional[int] = None) -> None:
    try:
        body = resp.json()
    except Exception:
        body = {}
    raw = str(body.get("msg") or body.get("error_description") or body.get("message") or body.get("error") or "")
    raise HTTPException(
        status_code=force_status or (resp.status_code if resp.status_code in (400, 401, 403, 422, 429) else 400),
        detail={"code": "auth_failed", "message": _friendly(raw, fallback)},
    )


# ─────────────────────────────────────────────────────────────────────────────
# 엔드포인트
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/providers")
def providers() -> dict:
    """프론트 로그인 화면이 버튼 상태(활성/준비중)를 그릴 때 쓴다."""
    return {"providers": SUPPORTED_PROVIDERS, "default": "email"}


@router.post("/oauth/kakao", status_code=status.HTTP_501_NOT_IMPLEMENTED)
@router.get("/oauth/kakao", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def kakao_not_ready() -> dict:
    """카카오 로그인 — 아직 열지 않았다. 프론트는 message 를 그대로 안내하면 된다."""
    return {
        "ok": False,
        "provider": "kakao",
        "status": "coming_soon",
        "message": KAKAO_NOTICE,
        "fallback": "email",
    }


@router.post("/signup", response_model=MessageResponse)
async def signup(req: SignupRequest, request: Request) -> MessageResponse:
    """
    회원가입. Supabase 설정에서 '이메일 확인'이 켜져 있으면 세션 대신 인증메일이 나간다.

    보안 메모: 이미 가입된 이메일인지 여부를 응답으로 구분하지 않는다.
    (가입 여부를 긁어가는 계정 열거 공격 방지 — 성공/중복 모두 같은 문구)
    """
    ip_rate_limit(request, "signup", auth_settings.RL_SIGNUP_PER_HOUR, 3600,
                  "가입 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.")
    validate_password(req.password)

    resp = await _post(
        "/signup",
        json={
            "email": str(req.email),
            "password": req.password,
            "data": {"nickname": (req.nickname or str(req.email).split("@")[0])[:20]},
        },
    )

    if resp.status_code >= 400:
        body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        raw = str(body.get("msg") or body.get("message") or "").lower()
        if "already registered" in raw:
            # 중복도 성공과 같은 문구로 응답 (열거 방지)
            return MessageResponse(
                message="인증 메일을 보냈어요. 메일함에서 링크를 눌러 가입을 완료해 주세요.",
                needs_email_verification=True,
            )
        _raise_from(resp, "회원가입에 실패했어요. 잠시 후 다시 시도해 주세요.")

    data = resp.json()
    # 이메일 확인이 꺼진 프로젝트면 여기서 바로 세션이 온다.
    if data.get("access_token"):
        return MessageResponse(message="가입이 완료됐어요. 바로 로그인해 주세요.", needs_email_verification=False)

    return MessageResponse(
        message="인증 메일을 보냈어요. 메일함에서 링크를 눌러 가입을 완료해 주세요.",
        needs_email_verification=True,
    )


@router.post("/login", response_model=SessionResponse)
async def login(req: LoginRequest, request: Request) -> SessionResponse:
    """이메일/비밀번호 로그인 → access_token(1시간) + refresh_token."""
    # IP + 이메일 두 축으로 제한 (한 IP 로 여러 계정 / 한 계정에 여러 IP 모두 방어)
    ip_rate_limit(request, "login-ip", auth_settings.RL_LOGIN_PER_5MIN * 4, 300,
                  "로그인 시도가 너무 많아요. 5분 후 다시 시도해 주세요.")
    ip_rate_limit(request, f"login-email:{str(req.email).lower()}", auth_settings.RL_LOGIN_PER_5MIN, 300,
                  "로그인 시도가 너무 많아요. 5분 후 다시 시도해 주세요.")

    resp = await _post(
        "/token",
        json={"email": str(req.email), "password": req.password},
        params={"grant_type": "password"},
    )
    if resp.status_code >= 400:
        _raise_from(resp, "이메일 또는 비밀번호가 올바르지 않습니다.", force_status=401)

    d = resp.json()
    return SessionResponse(
        access_token=d.get("access_token", ""),
        refresh_token=d.get("refresh_token", ""),
        expires_in=int(d.get("expires_in") or 3600),
        user=_public_user(d.get("user") or {}),
    )


@router.post("/refresh", response_model=SessionResponse)
async def refresh(req: RefreshRequest) -> SessionResponse:
    """access_token 이 만료되면 refresh_token 으로 새 세션을 받는다."""
    resp = await _post("/token", json={"refresh_token": req.refresh_token}, params={"grant_type": "refresh_token"})
    if resp.status_code >= 400:
        _raise_from(resp, "세션이 만료되었어요. 다시 로그인해 주세요.", force_status=401)

    d = resp.json()
    return SessionResponse(
        access_token=d.get("access_token", ""),
        refresh_token=d.get("refresh_token", ""),
        expires_in=int(d.get("expires_in") or 3600),
        user=_public_user(d.get("user") or {}),
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(request: Request, user: CurrentUser = Depends(require_user)) -> MessageResponse:
    """현재 access_token 의 세션을 무효화. 토큰이 이미 죽어 있어도 성공으로 응답."""
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    if token and not user.is_dev:
        try:
            await _post("/logout", json={}, token=token)
        except HTTPException:
            pass  # 로그아웃은 클라이언트가 토큰을 버리는 게 본질 — 실패해도 성공 처리
    return MessageResponse(message="로그아웃 됐어요.")


@router.post("/password/forgot", response_model=MessageResponse)
async def password_forgot(req: EmailOnlyRequest, request: Request) -> MessageResponse:
    """비밀번호 재설정 메일 발송. 가입 여부와 무관하게 항상 같은 문구를 돌려준다(열거 방지)."""
    ip_rate_limit(request, "recover", 3, 900, "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.")
    try:
        await _post("/recover", json={"email": str(req.email)})
    except HTTPException:
        pass
    return MessageResponse(message="가입된 이메일이라면 재설정 링크를 보냈어요. 메일함을 확인해 주세요.")


@router.post("/password/update", response_model=MessageResponse)
async def password_update(
    req: PasswordUpdateRequest, request: Request, user: CurrentUser = Depends(require_user)
) -> MessageResponse:
    """로그인 상태에서 비밀번호 변경 (재설정 링크로 들어온 세션도 동일 경로)."""
    validate_password(req.new_password)
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""

    url = f"{_gotrue_base()}/user"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.put(url, json={"password": req.new_password}, headers=_headers(token))
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "auth_upstream_error", "message": "인증 서버에 연결하지 못했어요."},
        )
    if resp.status_code >= 400:
        _raise_from(resp, "비밀번호 변경에 실패했어요.")
    return MessageResponse(message="비밀번호가 변경됐어요. 다음 로그인부터 새 비밀번호를 사용해 주세요.")


@router.post("/verify/resend", response_model=MessageResponse)
async def resend_verification(req: EmailOnlyRequest, request: Request) -> MessageResponse:
    """인증 메일 재발송."""
    ip_rate_limit(request, "resend", 3, 900, "메일 재발송은 잠시 후 다시 시도해 주세요.")
    try:
        await _post("/resend", json={"type": "signup", "email": str(req.email)})
    except HTTPException:
        pass
    return MessageResponse(message="인증 메일을 다시 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.",
                           needs_email_verification=True)


@router.get("/me")
def me(user: CurrentUser = Depends(require_user)) -> dict:
    """토큰이 유효한지 확인하는 가장 싼 방법. 프론트 부팅 시 세션 검사에 쓴다."""
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "email_verified": user.email_verified,
        "auth_mode": auth_settings.AUTH_MODE,
        "is_dev_user": user.is_dev,
    }


def _public_user(u: dict) -> dict:
    """GoTrue user 객체에서 프론트가 쓸 필드만 추린다(토큰·내부 메타 노출 방지)."""
    meta = u.get("user_metadata") or {}
    return {
        "id": u.get("id", ""),
        "email": u.get("email", ""),
        "nickname": meta.get("nickname") or (u.get("email") or "").split("@")[0],
        "email_verified": bool(meta.get("email_verified", bool(u.get("email_confirmed_at")))),
        "created_at": u.get("created_at", ""),
    }
