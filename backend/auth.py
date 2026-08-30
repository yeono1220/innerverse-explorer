"""
INNERVERSE — 인증 게이트 (Supabase Auth 기반)

이 파일이 담당하는 것
  1) Supabase 가 발급한 access_token(JWT) 검증  → CurrentUser 로 변환
  2) FastAPI 의존성 제공: require_user / optional_user / user_rate_limit
  3) 사용자 단위 레이트리밋 (LLM 호출 비용 방어)

설계 원칙
  - 사용자 계정의 단일 소스는 Supabase(auth.users). 백엔드는 '검증만' 한다.
    (비밀번호 해시·세션 저장을 백엔드가 따로 하지 않음 → 이중 관리 사고 방지)
  - 토큰이 없거나 위조면 401. 프로덕션에서는 우회 경로가 존재할 수 없다.

┌─ AUTH_MODE ── 인증을 '어떻게' 검사하는가 ────────────────────────────┐
│  supabase : (기본) 실제 Supabase JWT 검증. 배포에서 쓰는 값           │
│  dev      : 로컬 전용. "dev:<email>" 형태의 가짜 토큰 허용            │
│  off      : 인증 없음(레거시 동작). 로컬 데모용. 경고 로그를 남김          │
│                                                                │
│  ※ APP_ENV=production 이면 supabase 외의 값은 부팅 시 거부한다.       │
└────────────────────────────────────────────────────────────────┘
"""
from __future__ import annotations

import os
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# ─────────────────────────────────────────────────────────────────────────────
# 설정
# ─────────────────────────────────────────────────────────────────────────────
try:  # config.py 가 이미 .env 를 로드하지만, auth 단독 임포트도 지원
    from dotenv import load_dotenv
    from pathlib import Path

    _base = Path(__file__).resolve().parent
    for _p in (_base / ".env.local", _base / ".env", _base.parent / ".env.local", _base.parent / ".env"):
        load_dotenv(_p, override=False)
except ImportError:
    pass


def _env_bool(key: str, default: bool) -> bool:
    return os.getenv(key, str(default)).strip().lower() in ("1", "true", "yes", "on")

def _clean(raw: str) -> str:
        """.env 값에서 흘러들어온 주석·따옴표를 제거한다.

        python-dotenv 는 값이 '있을 때만' 뒤따르는 # 주석을 떼어낸다.
        값이 비어 있으면 주석 전체가 값이 되어버린다:
            APP_ENV=development   # 설명   →  'development'   (정상)
            SUPABASE_JWKS_URL=    # 설명   →  '# 설명'        (주석이 값으로!)
        이 상태를 두면 'https://# 설명' 같은 주소가 만들어져 JWT 검증이 실패한다.
        값이 # 로 시작하면 주석으로 보고 빈 값으로 처리한다.
        """
        v = (raw or "").strip()
        if v.startswith("#"):
            return ""
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):  # 따옴표로 감싼 값
            v = v[1:-1].strip()
        return v
def _normalize_url(raw: str) -> str:
        """URL 앞뒤 공백·끝 슬래시를 정리하고, 스킴이 없으면 https 를 붙인다.
        .env 에 https:// 없이 도메인만 적는 실수를 부팅 시점에 흡수한다."""
        u = _clean(raw).rstrip("/")
        if not u:
            return ""
        if not u.startswith(("http://", "https://")):
            print(f"⚠️  [auth] URL 에 스킴이 없어 https:// 를 붙였습니다: {u}")
            u = f"https://{u}"
        return u

class AuthSettings:
    
    APP_ENV: str = _clean(os.getenv("APP_ENV", "development")).lower()
    AUTH_MODE: str = _clean(os.getenv("AUTH_MODE", "supabase")).lower()
    '''
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")
    SUPABASE_JWKS_URL: str = os.getenv("SUPABASE_JWKS_URL", "")
    '''
    SUPABASE_URL: str = _normalize_url(os.getenv("SUPABASE_URL", ""))          # 스킴 자동 보정
    SUPABASE_ANON_KEY: str = _clean(os.getenv("SUPABASE_ANON_KEY", ""))
    SUPABASE_JWT_SECRET: str = _clean(os.getenv("SUPABASE_JWT_SECRET", ""))      # ES256 프로젝트면 빈 값
    SUPABASE_JWKS_URL: str = _normalize_url(os.getenv("SUPABASE_JWKS_URL", ""))  # 보통 비워둠
    
    AUTH_REQUIRE_VERIFIED_EMAIL: bool = _env_bool("AUTH_REQUIRE_VERIFIED_EMAIL", True)

    # 레이트리밋 기본값 (사용자 1명 기준)
    RL_LLM_PER_MIN: int = int(os.getenv("RL_LLM_PER_MIN", "20"))
    RL_LOGIN_PER_5MIN: int = int(os.getenv("RL_LOGIN_PER_5MIN", "5"))
    RL_SIGNUP_PER_HOUR: int = int(os.getenv("RL_SIGNUP_PER_HOUR", "5"))

    @property
    def jwks_url(self) -> str:
        if self.SUPABASE_JWKS_URL:
            return self.SUPABASE_JWKS_URL
        if self.SUPABASE_URL:
            return f"{self.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        return ""

    @property
    def is_production(self) -> bool:
        return self.APP_ENV in ("production", "prod")


auth_settings = AuthSettings()


# ── 부팅 시 즉시 실패(fail-fast) — 배포에서 인증이 꺼진 채 뜨는 사고 방지 ──
def _validate_on_boot() -> None:
    s = auth_settings
    if s.AUTH_MODE not in ("supabase", "dev", "off"):
        raise RuntimeError(f"AUTH_MODE 값이 잘못됨: {s.AUTH_MODE!r} (supabase|dev|off)")

    if s.is_production and s.AUTH_MODE != "supabase":
        raise RuntimeError(
            f"APP_ENV=production 에서는 AUTH_MODE={s.AUTH_MODE!r} 를 쓸 수 없습니다. "
            "AUTH_MODE=supabase 로 두세요."
        )

    if s.AUTH_MODE == "supabase":
        if not s.SUPABASE_URL:
            raise RuntimeError("AUTH_MODE=supabase 인데 SUPABASE_URL 이 비어 있습니다.")
        if not s.SUPABASE_JWT_SECRET and not s.jwks_url:
            raise RuntimeError(
                "JWT 검증 재료가 없습니다. SUPABASE_JWT_SECRET(HS256) 또는 "
                "SUPABASE_JWKS_URL(비대칭 서명) 중 하나는 있어야 합니다."
            )
    else:
        print(
            f"⚠️  [auth] AUTH_MODE={s.AUTH_MODE} — 로컬 전용 모드입니다. "
            "배포에서는 반드시 AUTH_MODE=supabase 로 두세요."
        )


_validate_on_boot()


# ─────────────────────────────────────────────────────────────────────────────
# 사용자 모델
# ─────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class CurrentUser:
    id: str                      # Supabase auth.users.id (uuid) — DB user_id 와 동일
    email: str = ""
    role: str = "authenticated"
    email_verified: bool = True
    is_dev: bool = False         # dev/off 모드로 만들어진 가짜 사용자인지

    @property
    def short(self) -> str:
        return f"{self.email or self.id[:8]}{'(dev)' if self.is_dev else ''}"


# ─────────────────────────────────────────────────────────────────────────────
# JWT 검증
# ─────────────────────────────────────────────────────────────────────────────
_jwks_client = None
_jwks_lock = threading.Lock()


def _get_jwks_client():
    """PyJWKClient 를 1회만 생성해 재사용(내부에 키 캐시가 있다)."""
    global _jwks_client
    if _jwks_client is not None:
        return _jwks_client
    with _jwks_lock:
        if _jwks_client is None:
            from jwt import PyJWKClient

            _jwks_client = PyJWKClient(auth_settings.jwks_url, cache_keys=True, lifespan=3600)
    return _jwks_client


def _credentials_error(detail: str, code: str = "invalid_token") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": code, "message": detail},
        headers={"WWW-Authenticate": "Bearer"},
    )


def decode_supabase_jwt(token: str) -> dict:
    """
    Supabase access_token 을 검증하고 claims(dict)를 반환. 실패하면 401.

    - alg 가 HS256 이면 SUPABASE_JWT_SECRET 으로 검증(레거시 프로젝트)
    - 그 외(ES256/RS256)면 JWKS 공개키로 검증(새 서명 키)
    - aud 는 "authenticated" 고정, exp 는 30초 여유(leeway)
    """
    import jwt  # PyJWT

    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        raise _credentials_error("토큰 형식이 올바르지 않습니다.")

    alg = (header.get("alg") or "").upper()

    try:
        if alg == "HS256":
            if not auth_settings.SUPABASE_JWT_SECRET:
                raise _credentials_error(
                    "서버에 SUPABASE_JWT_SECRET 이 설정되지 않았습니다.", "server_misconfigured"
                )
            key = auth_settings.SUPABASE_JWT_SECRET
            algorithms = ["HS256"]
        else:
            if not auth_settings.jwks_url:
                raise _credentials_error(
                    "서버에 SUPABASE_JWKS_URL 이 설정되지 않았습니다.", "server_misconfigured"
                )
            key = _get_jwks_client().get_signing_key_from_jwt(token).key
            algorithms = ["ES256", "RS256", "EdDSA"]

        claims = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience="authenticated",
            leeway=30,
            options={"require": ["exp", "sub"]},
        )
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise _credentials_error("세션이 만료되었습니다. 다시 로그인해 주세요.", "token_expired")
    except jwt.InvalidAudienceError:
        raise _credentials_error("토큰 대상(aud)이 올바르지 않습니다.")
    except Exception as e:
        print(f"[auth] JWT 검증 실패: {type(e).__name__}: {e}")
        raise _credentials_error("유효하지 않은 토큰입니다.")

    return claims


def user_from_claims(claims: dict) -> CurrentUser:
    """검증된 claims → CurrentUser. 이메일 인증 필수 설정이면 여기서 403."""
    uid = str(claims.get("sub") or "")
    if not uid:
        raise _credentials_error("토큰에 사용자 식별자(sub)가 없습니다.")

    meta = claims.get("user_metadata") or {}
    email = str(claims.get("email") or meta.get("email") or "")

    # GoTrue 는 확인 완료 시 user_metadata.email_verified=true 를 넣는다.
    # 키 자체가 없는 옛 토큰은 '확인됨'으로 관대하게 처리(로그인 자체가 막히면 안 되므로).
    verified = bool(meta.get("email_verified", True))

    if auth_settings.AUTH_REQUIRE_VERIFIED_EMAIL and email and not verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "email_not_verified",
                "message": "이메일 인증이 필요합니다. 메일함에서 인증 링크를 눌러 주세요.",
            },
        )

    return CurrentUser(
        id=uid,
        email=email,
        role=str(claims.get("role") or "authenticated"),
        email_verified=verified,
    )


def _dev_user(token: str) -> CurrentUser:
    """
    dev 모드 전용 가짜 사용자.
      Authorization: Bearer dev:tester@innerverse.app
    이메일에서 uuid5 로 항상 같은 id 를 만들기 때문에, 재시작해도 같은 사용자로 붙는다.
    """
    raw = token[4:].strip() if token.lower().startswith("dev:") else ""
    email = raw or "tester@innerverse.app"
    uid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"innerverse-dev:{email}"))
    return CurrentUser(id=uid, email=email, email_verified=True, is_dev=True)


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI 의존성
# ─────────────────────────────────────────────────────────────────────────────
_bearer = HTTPBearer(auto_error=False)

# off 모드에서 모든 요청이 공유하는 익명 사용자
_ANON = CurrentUser(
    id=str(uuid.uuid5(uuid.NAMESPACE_URL, "innerverse-anonymous")),
    email="anonymous@local",
    is_dev=True,
)


def _resolve(creds: Optional[HTTPAuthorizationCredentials]) -> Optional[CurrentUser]:
    """토큰 → CurrentUser. 토큰이 아예 없으면 None."""
    mode = auth_settings.AUTH_MODE

    if mode == "off":
        return _ANON

    if creds is None or not creds.credentials:
        return None

    token = creds.credentials.strip()

    if mode == "dev":
        if token.lower().startswith("dev:"):
            return _dev_user(token)
        # dev 모드라도 진짜 JWT 가 오면 검증을 시도한다(프론트 연동 확인용)
        if auth_settings.SUPABASE_JWT_SECRET or auth_settings.jwks_url:
            return user_from_claims(decode_supabase_jwt(token))
        raise _credentials_error("dev 모드에서는 'dev:<email>' 형식의 토큰을 쓰세요.")

    return user_from_claims(decode_supabase_jwt(token))


def require_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> CurrentUser:
    """로그인 필수 엔드포인트에 붙인다. 토큰 없으면 401."""
    user = _resolve(creds)
    if user is None:
        raise _credentials_error("로그인이 필요합니다.", "missing_token")
    return user


def optional_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[CurrentUser]:
    """있으면 쓰고 없으면 None. 공개/부분공개 엔드포인트용."""
    try:
        return _resolve(creds)
    except HTTPException:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# 레이트리밋 (인메모리 슬라이딩 윈도우)
#   ※ 프로세스 로컬이라 워커가 여러 개면 워커 수만큼 곱해진다.
#     인스턴스를 늘릴 계획이면 Redis 로 교체할 것 (아래 hit() 만 바꾸면 됨).
# ─────────────────────────────────────────────────────────────────────────────
class _SlidingWindow:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()
        self._last_gc = 0.0

    def hit(self, key: str, limit: int, window: float) -> tuple[bool, int]:
        """(허용여부, 재시도까지 남은 초)"""
        now = time.time()
        with self._lock:
            if now - self._last_gc > 300:  # 5분마다 죽은 키 청소
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] > 3600]:
                    self._hits.pop(k, None)
                self._last_gc = now

            times = [t for t in self._hits.get(key, []) if now - t < window]
            if len(times) >= limit:
                self._hits[key] = times
                return False, max(1, int(window - (now - times[0])) + 1)
            times.append(now)
            self._hits[key] = times
            return True, 0


_limiter = _SlidingWindow()


def client_ip(request: Request) -> str:
    """프록시(Render/Vercel) 뒤라 X-Forwarded-For 우선."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(key: str, limit: int, window: float, message: str) -> None:
    ok, retry = _limiter.hit(key, limit, window)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "rate_limited", "message": message, "retry_after": retry},
            headers={"Retry-After": str(retry)},
        )


def user_rate_limit(bucket: str, limit: int, window: float = 60.0):
    """
    '로그인 확인 + 사용자별 호출 제한'을 한 번에 처리하는 의존성 팩토리.

        @app.post("/api/momo/reply")
        async def momo_reply(req: Req, user: CurrentUser = Depends(user_rate_limit("llm", 20))):
            ...
    """

    def _dep(user: CurrentUser = Depends(require_user)) -> CurrentUser:
        enforce_rate_limit(
            f"{bucket}:{user.id}",
            limit,
            window,
            "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.",
        )
        return user

    return _dep


def ip_rate_limit(request: Request, bucket: str, limit: int, window: float, message: str) -> None:
    """토큰 없는 엔드포인트(로그인/회원가입)용 — IP 기준."""
    enforce_rate_limit(f"{bucket}:{client_ip(request)}", limit, window, message)


def auth_status() -> dict:
    """/health 에서 노출할 인증 설정 요약 (비밀값은 존재 여부만)."""
    s = auth_settings
    return {
        "mode": s.AUTH_MODE,
        "app_env": s.APP_ENV,
        "supabase_url_set": bool(s.SUPABASE_URL),
        "jwt_secret_set": bool(s.SUPABASE_JWT_SECRET),
        "jwks_url_set": bool(s.jwks_url),
        "require_verified_email": s.AUTH_REQUIRE_VERIFIED_EMAIL,
        "providers": {"email": "enabled", "kakao": "coming_soon"},
    }
