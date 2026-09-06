// 계정 경계(session boundary) 관리.
//
// 이 앱의 스토어는 대부분 localStorage 에 "기기 단위"로 저장된다. 계정 단위가
// 아니므로, 로그아웃/계정 전환/탈퇴 때 지워주지 않으면 다음 사람이 앞 사람의
// 일기·레벨·행성 이름을 그대로 보게 된다. 그 정리를 여기서 한곳에 모은다.
import { useDiaryStore } from "./diaryStore";
import { useUserStore } from "./userStore";

/** 앱이 localStorage 에 쓰는 키는 전부 이 접두사를 쓴다. */
const LOCAL_PREFIX = "innerverse.";

/**
 * 마지막으로 로그인했던 사용자 id. "계정이 바뀌었는지" 판별에만 쓴다.
 * 위 접두사 밖에 둬서 clearLocalUserData() 에 함께 지워지지 않게 한다.
 */
const LAST_UID_KEY = "iv:last-uid";

export function getLastUid(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_UID_KEY);
  } catch {
    return null;
  }
}

export function setLastUid(uid: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (uid) window.localStorage.setItem(LAST_UID_KEY, uid);
    else window.localStorage.removeItem(LAST_UID_KEY);
  } catch {
    /* ignore */
  }
}

/** 이 기기에 남은 사용자 데이터(로컬 저장 + 메모리 스토어)를 지운다. */
export function clearLocalUserData() {
  if (typeof window !== "undefined") {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(LOCAL_PREFIX)) doomed.push(k);
      }
      doomed.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }
  // 화면이 이미 들고 있는 메모리 상태도 즉시 비운다.
  useDiaryStore.getState().reset();
  useUserStore.getState().reset();
}

/**
 * 로그아웃/탈퇴 마무리. 로컬 데이터를 지우고 전체 새로고침으로 이동한다.
 * (퀘스트·배경·디오라마 등 리셋 액션이 없는 스토어까지 확실히 초기화하려면
 *  SPA 라우팅이 아니라 문서 재로딩이 가장 안전하다.)
 */
export function clearAndLeave(path = "/login") {
  clearLocalUserData();
  setLastUid(null);
  if (typeof window !== "undefined") window.location.replace(path);
}
