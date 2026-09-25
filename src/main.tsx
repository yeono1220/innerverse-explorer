import * as Sentry from "@sentry/react";
// 에러 모니터링 — VITE_SENTRY_DSN 이 있을 때만 켠다 (없으면 no-op).
const SENTRY_DSN = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1, environment: import.meta.env.MODE });
}
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/innerverse.css";

createRoot(document.getElementById("root")!).render(<App />);
