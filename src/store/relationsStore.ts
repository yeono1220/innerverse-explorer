// 일기에 등장한 사람들(장기기억 relations) — 행성 위 '주민' 렌더링용 캐시.
// 원본은 Supabase relations 테이블(services/memory.ts). reflect/삭제 후 load() 로 갱신.
import { create } from "zustand";
import { getMemory, type RelationRow } from "@/services/memory";

interface RelationsState {
  people: RelationRow[];
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

let inflight: Promise<void> | null = null;

export const useRelationsStore = create<RelationsState>((set) => ({
  people: [],
  loaded: false,
  load: () => {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const m = await getMemory();
        set({ people: m?.relations ?? [], loaded: true });
      } catch {
        set({ loaded: true });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
  reset: () => set({ people: [], loaded: false }),
}));
