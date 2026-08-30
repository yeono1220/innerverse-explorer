// 클라이언트 E2E 암호화 유틸 (Web Crypto, AES-256-GCM)
// 설계: 당일 데이터는 평문 처리(모델 접근 가능). 저장/봉인 시 이 모듈로 암호화해
//       body_enc / content_enc(jsonb {iv,ct})에 넣는다. 과거는 이 암호문만 접근.
//
// ⚠️ 키 관리 모델 = 정책 결정 지점.
//   기본 구현 = '사용자 기기 키': 기기에서 생성해 IndexedDB에 보관, 서버로 전송 안 함(= 진짜 E2E).
//   단점: 브라우저 데이터 삭제/기기 변경 시 복구 불가(= 과거 일기 영구 손실).
//   포터블/복구가 필요하면 getUserKey()만 교체: 비밀번호 파생(PBKDF2) 또는 Vault-wrap 방식.

export interface EncBlob {
  v: 1;
  iv: number[];
  ct: number[];
}

const DB_NAME = "innerverse-keys";
const STORE = "keys";
const KEY_ID = "diary-aes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(k: string): Promise<CryptoKey | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(k);
        tx.onsuccess = () => resolve(tx.result as CryptoKey | undefined);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbSet(k: string, v: CryptoKey): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite").objectStore(STORE).put(v, k);
        tx.onsuccess = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

/** 브라우저에서 암호화 사용 가능 여부(Web Crypto + IndexedDB). */
export function cryptoAvailable(): boolean {
  return (
    typeof crypto !== "undefined" &&
    !!crypto.subtle &&
    typeof indexedDB !== "undefined"
  );
}

/**
 * 사용자 기기 키(AES-256-GCM). 없으면 생성해 IndexedDB에 보관.
 * non-extractable → JS로 원시 키 추출 불가(유출 내성 ↑).
 * ⚠️ 여기가 키 관리 결정 지점: 기기 키(기본) / 비밀번호 파생 / Vault-wrap 중 택1.
 */
export async function getUserKey(): Promise<CryptoKey> {
  const existing = await idbGet(KEY_ID).catch(() => undefined);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
  await idbSet(KEY_ID, key);
  return key;
}

/** 평문 → {iv, ct}. 저장 시 body_enc/content_enc(jsonb)에 넣는다. */
export async function encryptText(plain: string): Promise<EncBlob> {
  const key = await getUserKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  return { v: 1, iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
}

/** {iv, ct} → 평문. 사용자 기기 키로만 복호. */
export async function decryptText(blob: EncBlob): Promise<string> {
  const key = await getUserKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(blob.iv) },
    key,
    new Uint8Array(blob.ct),
  );
  return new TextDecoder().decode(pt);
}
