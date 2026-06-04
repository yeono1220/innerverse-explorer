import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  Sparkles,
  ArrowRight,
  AlertTriangle,
  BookOpenText,
  Stethoscope,
  Users,
  ShieldCheck,
  Globe2,
  HeartHandshake,
  Coins,
  Repeat,
  TrendingUp,
  Rocket,
  Brain,
  Map as MapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MomoOrb } from "@/glass-momo/MomoOrb";
import { STAGE_LIST, useCurrentStage, useGrowthPreview } from "@/glass-momo/growthStages";
import { GalaxyExplorer } from "@/glass-momo/GalaxyExplorer";

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StarField() {
  // deterministic pseudo-random stars (no layout shift)
  const stars = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 53.7) % 100;
    const y = (i * 29.3) % 100;
    const size = (i % 3) + 1;
    const delay = (i % 7) * 0.4;
    return { x, y, size, delay };
  });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s, i) => (
        <span
          key={i}
          className="animate-twinkle absolute rounded-full bg-foreground/70"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-cosmic-cyan/30 bg-cosmic-cyan/5 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-cosmic-cyan">
      {children}
    </span>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-cosmic-purple">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const PROBLEMS = [
  {
    icon: Stethoscope,
    tone: "text-stellar-gold",
    ring: "border-stellar-gold/25 bg-stellar-gold/5",
    title: "정신과의 높은 장벽",
    head: "비용 · 낙인 · 시간",
    body: "전문 치료는 효과적이지만 ‘병원에 간다’는 심리적·비용적 문턱이 진입 자체를 막습니다.",
  },
  {
    icon: BookOpenText,
    tone: "text-warm-rose",
    ring: "border-warm-rose/25 bg-warm-rose/5",
    title: "감정 일기 앱의 낮은 리텐션",
    head: "30일 뒤, 대부분 이탈",
    body: "혼자 쓰는 일기는 금방 질립니다. 출시 한 달이면 떠나는 전형적인 ‘데스밸리’ 구간이죠.",
  },
  {
    icon: AlertTriangle,
    tone: "text-warm-rose",
    ring: "border-warm-rose/25 bg-warm-rose/5",
    title: "자아성찰의 역설",
    head: "부정적 반추(Rumination)",
    body: "중증 우울군에게 단순한 자아성찰은 부정적 생각에 갇히게 만들어 오히려 위험할 수 있습니다.",
  },
];

const PILLARS = [
  {
    badge: "기존 · BASE",
    icon: Brain,
    color: "text-cosmic-purple",
    ring: "border-cosmic-purple/30",
    glow: "shadow-[0_0_40px_-12px_hsl(var(--nebula-purple)/0.5)]",
    title: "AI 일기장",
    sub: "감정을 3D 행성으로 외화",
    body: "나만의 행성에 감정을 기록·시각화합니다. 단, 혼자라서 고립되고 금방 이탈하는 한계가 있었습니다.",
  },
  {
    badge: "+ 추가 · B2B2C",
    icon: ShieldCheck,
    color: "text-cosmic-cyan",
    ring: "border-cosmic-cyan/40",
    glow: "shadow-[0_0_50px_-10px_hsl(var(--cosmic-cyan)/0.55)]",
    title: "닥터 컨텍",
    sub: "AI 위기 감지 → 진료 연계",
    body: "위험 신호를 감지해 전문가에게 안전하게 토스하는 임상 안전망(Safety-net)을 구축합니다.",
  },
  {
    badge: "+ 추가 · C2C",
    icon: Users,
    color: "text-warm-rose",
    ring: "border-warm-rose/30",
    glow: "shadow-[0_0_40px_-12px_hsl(var(--warm-rose)/0.5)]",
    title: "소셜 탐사",
    sub: "타인 행성 방문 · 감정 교류",
    body: "남의 감정 지형을 구경하며 ‘나만 힘든 게 아니구나’를 느낍니다. 리텐션과 재미를 책임집니다.",
  },
];

const BUSINESS = [
  {
    no: "BM 1",
    icon: Repeat,
    color: "text-cosmic-purple",
    model: "B2C",
    title: "프리미엄 구독",
    body: "감정 분석 리포트·프리미엄 행성 테마 등 월 구독. 안정적인 기본 캐시플로우.",
    metric: "월 구독료",
  },
  {
    no: "BM 2",
    icon: Stethoscope,
    color: "text-cosmic-cyan",
    model: "B2B2C",
    title: "비대면 진료 중개 수수료",
    body: "위기 유저를 제휴 상담사·정신과 전문의와 앱 내 화상으로 연결. 진료·상담비의 일부를 중개 수수료로 수취.",
    metric: "객단가 ↑↑ · 캐시카우",
  },
  {
    no: "BM 3",
    icon: Coins,
    color: "text-stellar-gold",
    model: "C2C",
    title: "소셜 아이템 · 입장료",
    body: "‘우주 티켓’으로 타인 행성 방문, ‘위로의 별가루’ 같은 아이템을 인앱 결제. 유저 간 거래 수수료까지.",
    metric: "인앱 결제 · 거래 수수료",
  },
];

const ADVANTAGES = [
  {
    icon: ShieldCheck,
    title: "임상 안전망",
    body: "단순 챗봇이 아니라 위기를 감지해 전문가로 잇는 ‘디지털 바이오마커’ 역할.",
  },
  {
    icon: Globe2,
    title: "메타버스 소셜",
    body: "3D 행성을 매개로 한 감정 교류 — 제페토식 재미와 멘탈케어의 결합.",
  },
  {
    icon: HeartHandshake,
    title: "검증된 수익 구조",
    body: "막연한 데이터 판매가 아닌, 구독·중개·아이템의 ‘거래 기반’ 3중 수익 모델.",
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Landing() {
  return (
    <div className="min-h-screen bg-cosmic-gradient font-body text-foreground">
      {/* ---------------- NAV ---------------- */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <nav className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-cosmic-cyan" />
            <span className="font-display text-2xl font-semibold tracking-wide text-glow-cyan">
              INNERVERSE
            </span>
            <span className="rounded bg-cosmic-cyan/10 px-1.5 py-0.5 text-[10px] font-bold text-cosmic-cyan">
              2.0
            </span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#problem" className="transition-colors hover:text-foreground">문제</a>
            <a href="#solution" className="transition-colors hover:text-foreground">솔루션</a>
            <a href="#products" className="transition-colors hover:text-foreground">제품</a>
            <a href="#business" className="transition-colors hover:text-foreground">수익 모델</a>
          </div>
          <Button asChild size="sm" className="bg-cosmic-cyan text-primary-foreground hover:bg-cosmic-cyan/90">
            <Link to="/experience">
              체험하기 <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </nav>
      </header>

      {/* ---------------- HERO ---------------- */}
      <section className="relative flex min-h-screen items-center overflow-hidden pt-16">
        <StarField />
        {/* floating planet glow */}
        <div className="animate-float pointer-events-none absolute -right-32 top-24 h-[36rem] w-[36rem] rounded-full bg-gradient-to-br from-cosmic-purple/40 via-cosmic-cyan/20 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute -left-40 bottom-0 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-warm-rose/20 to-transparent blur-3xl" />

        <div className="container relative z-10 grid items-center gap-10 lg:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-7"
          >
            <SectionLabel>
              <Sparkles className="h-3.5 w-3.5" /> Mental Healthcare × 3D Metaverse
            </SectionLabel>

            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.1] sm:text-6xl lg:text-7xl">
              감정을 <span className="text-glow-cyan text-cosmic-cyan">외화(外化)</span>하는
              <br />
              3D 메타버스 멘탈 헬스케어
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
              혼자 쓰는 일기장을 넘어 —{" "}
              <span className="text-foreground">닥터 컨텍(B2B2C)</span>과{" "}
              <span className="text-foreground">행성 방문(C2C)</span>으로
              리텐션과 수익을 동시에 잡는 멘탈 헬스케어 중개 플랫폼.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button asChild size="lg" className="bg-cosmic-cyan text-primary-foreground hover:bg-cosmic-cyan/90">
                <Link to="/experience">
                  나의 행성 만들기 <ArrowRight className="ml-1.5 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-border bg-background/40 backdrop-blur">
                <a href="#solution">피보팅 스토리 보기</a>
              </Button>
            </div>

            <div className="mt-14 flex flex-wrap gap-x-10 gap-y-4 text-sm text-muted-foreground">
              <Stat value="3-Pillar" label="구독 · 중개 · 아이템 수익" />
              <Stat value="AI 위기 감지" label="전문가로 잇는 안전망" />
              <Stat value="C2C 소셜" label="행성 방문 · 감정 교류" />
            </div>
          </motion.div>

          {/* live 3D mascot (reuses the app's GlassMomo component) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative lg:col-span-5"
          >
            <div className="pointer-events-none absolute inset-0 m-auto h-72 w-72 rounded-full bg-cosmic-cyan/20 blur-3xl" />
            <MomoOrb className="relative h-[300px] w-full sm:h-[380px] lg:h-[440px]" />
            <GrowthScrubber />
          </motion.div>
        </div>
      </section>

      {/* ---------------- PROBLEM ---------------- */}
      <section id="problem" className="relative border-t border-border/40 py-28">
        <div className="container">
          <Reveal className="max-w-2xl">
            <Eyebrow>The Problem · Why Now?</Eyebrow>
            <h2 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
              병원은 무섭고,
              <br />
              혼자 쓰는 일기는 지루하다
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              우울·불안은 늘어나는데, 사람들이 택할 수 있는 두 길이 모두 막혀 있습니다.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.1}>
                <div className={`h-full rounded-2xl border ${p.ring} p-7 backdrop-blur-sm`}>
                  <p.icon className={`h-8 w-8 ${p.tone}`} />
                  <p className="mt-5 text-sm uppercase tracking-wide text-muted-foreground">
                    {p.title}
                  </p>
                  <p className={`mt-1 text-2xl font-semibold ${p.tone}`}>{p.head}</p>
                  <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                    {p.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- SOLUTION / PIVOT ---------------- */}
      <section id="solution" className="relative border-t border-border/40 py-28">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cosmic-cyan/5 blur-3xl" />
        <div className="container relative">
          <Reveal className="mx-auto max-w-2xl text-center">
            <Eyebrow>The Pivot</Eyebrow>
            <h2 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
              혼자 노는 일기장을 넘어,
              <br />
              마음을 <span className="text-cosmic-cyan text-glow-cyan">‘잇는다’</span>
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              외화(externalization)는 그대로 두고, 거기에 ‘연결(connection)’을 더합니다.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.12}>
                <div
                  className={`h-full rounded-2xl border ${p.ring} bg-card/60 p-8 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 ${p.glow}`}
                >
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {p.badge}
                  </span>
                  <p.icon className={`mt-6 h-10 w-10 ${p.color}`} />
                  <h3 className="mt-5 font-display text-3xl font-semibold">{p.title}</h3>
                  <p className={`mt-1 text-sm font-medium ${p.color}`}>{p.sub}</p>
                  <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
                    {p.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.2}>
            <p className="mt-14 text-center font-display text-2xl text-cosmic-cyan">
              = 외화 + 연결 = 지속 가능한 멘탈 헬스케어 플랫폼
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---------------- PRODUCTS ---------------- */}
      <section id="products" className="relative border-t border-border/40 py-28">
        <div className="container space-y-24">
          {/* Product 1 */}
          <ProductRow
            label="Product ① · 안전망"
            icon={ShieldCheck}
            accent="text-cosmic-cyan"
            title="닥터 컨텍"
            tagline="AI 위기 감지 & 비대면 진료 연계"
            points={[
              ["감지 · Detect", "대화 중 극단적 표현·심각한 불안 신호를 ‘디지털 바이오마커’로 포착합니다."],
              ["개입 · Break", "CBT 기반 브레이크가 부정적 반추 루프를 끊고 안전 모드로 전환합니다."],
              ["연계 · Escalate", "검증된 비대면 진료·전문 상담사에게 안전하게 토스(Escalation)합니다."],
            ]}
            note="직접 의료행위는 하지 않습니다. 위기 순간을 감지하는 ‘트리거’ 역할만 수행하고, 실제 진료는 제휴 병원·검증된 플랫폼이 담당합니다."
            mock={
              <ChatMock />
            }
          />
          {/* Product 2 */}
          <ProductRow
            reverse
            label="Product ② · 리텐션"
            icon={MapIcon}
            accent="text-warm-rose"
            title="소셜 탐사"
            tagline="타인 행성 방문 & 감정 교류"
            points={[
              ["은하수 지도", "다른 유저의 감정 행성을 탐색합니다. 관음증적 호기심이 강력한 후킹 요소가 됩니다."],
              ["행성 방문 · 입장료", "‘우주 티켓’으로 입장 — 유저 간 거래(C2C)가 발생하는 결제 지점."],
              ["감정 교류", "감정 나무에 물을 주거나 ‘위로의 하트’를 남기며 사회적 지지를 주고받습니다."],
            ]}
            note="호기심과 관계가 ‘1개월차 데스밸리’를 돌파시킵니다 — 재미와 수익을 동시에 잡는 핵심 장치."
            mock={<GalaxyCard />}
          />
        </div>
      </section>

      {/* ---------------- BUSINESS MODEL ---------------- */}
      <section id="business" className="relative border-t border-border/40 py-28">
        <div className="container">
          <Reveal className="max-w-2xl">
            <Eyebrow>Business Model</Eyebrow>
            <h2 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
              3-Pillar 수익 모델
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              막연한 데이터 판매가 아니라, 확실하게 돈이 도는{" "}
              <span className="text-foreground">거래(Transaction) 기반</span> 3중 수익 구조.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {BUSINESS.map((b, i) => (
              <Reveal key={b.title} delay={i * 0.1}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card/60 p-8 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-3xl font-semibold text-muted-foreground/60">
                      {b.no}
                    </span>
                    <span className={`rounded-full border border-current/20 px-3 py-1 text-xs font-semibold ${b.color}`}>
                      {b.model}
                    </span>
                  </div>
                  <b.icon className={`mt-6 h-9 w-9 ${b.color}`} />
                  <h3 className="mt-4 text-2xl font-semibold">{b.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                    {b.body}
                  </p>
                  <div className="mt-6 flex items-center gap-2 border-t border-border pt-5 text-sm font-medium">
                    <TrendingUp className={`h-4 w-4 ${b.color}`} />
                    <span className={b.color}>{b.metric}</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* differentiators */}
          <div className="mt-20 grid gap-6 md:grid-cols-3">
            {ADVANTAGES.map((a, i) => (
              <Reveal key={a.title} delay={i * 0.08}>
                <div className="flex gap-4 rounded-xl border border-border/60 bg-background/30 p-6">
                  <a.icon className="h-6 w-6 shrink-0 text-cosmic-cyan" />
                  <div>
                    <h4 className="font-semibold">{a.title}</h4>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- FINAL CTA ---------------- */}
      <section className="relative overflow-hidden border-t border-border/40 py-32">
        <StarField />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cosmic-cyan/10 blur-3xl" />
        <div className="container relative z-10 text-center">
          <Reveal>
            <Rocket className="mx-auto h-12 w-12 text-cosmic-cyan" />
            <h2 className="mt-6 font-display text-4xl font-semibold leading-tight sm:text-6xl">
              지금, 당신의 행성을
              <br />
              만들어보세요
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
              오늘의 감정을 기록하면, AI 모모가 당신의 행성을 빚어냅니다.
              혼자가 아닌, 잇닿은 내면의 우주로.
            </p>
            <Button asChild size="lg" className="mt-10 bg-cosmic-cyan text-primary-foreground hover:bg-cosmic-cyan/90">
              <Link to="/experience">
                INNERVERSE 체험 시작 <ArrowRight className="ml-1.5 h-5 w-5" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="border-t border-border/40 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cosmic-cyan" />
            <span className="font-display text-lg">INNERVERSE 2.0</span>
          </div>
          <p>감정을 외화하고, 마음을 잇는다.</p>
          <p className="text-muted-foreground/60">© 2026 INNERVERSE · Pivoting Pitch</p>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* Day 1~7 성장 단계 스크러버 — 3D StageMomo와 store(useGrowthPreview)로 동기화 */
function GrowthScrubber() {
  const stage = useCurrentStage();
  const setPreview = useGrowthPreview((s) => s.setPreview);
  const spec = STAGE_LIST.find((s) => s.stage === stage) ?? STAGE_LIST[0];

  return (
    <div className="relative mt-2">
      <div className="text-center">
        <p className="font-display text-xl font-semibold text-foreground">
          {spec.day} · {spec.name}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{spec.caption}</p>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        {STAGE_LIST.map((s) => {
          const active = s.stage === stage;
          return (
            <button
              key={s.stage}
              type="button"
              onClick={() => setPreview(s.stage)}
              aria-label={`${s.day} ${s.name}`}
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold transition-all ${
                active
                  ? "scale-110 border-transparent text-background"
                  : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              }`}
              style={active ? { backgroundColor: s.swatch, boxShadow: `0 0 16px ${s.swatch}` } : undefined}
            >
              {s.stage}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
        매일 기록하면 모모가 7일에 걸쳐 자라요 — 리텐션의 비밀 🌱
      </p>
    </div>
  );
}

function ProductRow({
  label,
  icon: Icon,
  accent,
  title,
  tagline,
  points,
  note,
  mock,
  reverse = false,
}: {
  label: string;
  icon: typeof ShieldCheck;
  accent: string;
  title: string;
  tagline: string;
  points: [string, string][];
  note: string;
  mock: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2">
      <Reveal className={reverse ? "lg:order-2" : ""}>
        <Eyebrow>{label}</Eyebrow>
        <div className="flex items-center gap-3">
          <Icon className={`h-9 w-9 ${accent}`} />
          <h3 className="font-display text-4xl font-semibold sm:text-5xl">{title}</h3>
        </div>
        <p className={`mt-2 text-lg font-medium ${accent}`}>{tagline}</p>

        <ul className="mt-8 space-y-5">
          {points.map(([h, b], i) => (
            <li key={h} className="flex gap-4">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/30 text-xs font-bold ${accent}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="font-semibold">{h}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{b}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex gap-3 rounded-xl border border-cosmic-cyan/20 bg-cosmic-cyan/5 p-5">
          <ShieldCheck className="h-5 w-5 shrink-0 text-cosmic-cyan" />
          <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>
        </div>
      </Reveal>

      <Reveal delay={0.15} className={reverse ? "lg:order-1" : ""}>
        <div className="flex justify-center">{mock}</div>
      </Reveal>
    </div>
  );
}

/* Phone mock: 닥터 컨텍 crisis popup */
function ChatMock() {
  return (
    <div className="relative w-[300px] rounded-[2.5rem] border border-border bg-card/80 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-3 border-b border-border/60 pb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cosmic-purple/30 text-sm font-bold text-cosmic-purple">
          모
        </div>
        <div>
          <p className="text-sm font-semibold">모모</p>
          <p className="text-[11px] text-muted-foreground">AI 감정 동반자 · 항상 곁에</p>
        </div>
      </div>
      <div className="space-y-3 py-4">
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-secondary px-4 py-2.5 text-[13px] text-secondary-foreground">
          오늘 하루는 어땠어요?
        </div>
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-warm-rose/80 px-4 py-2.5 text-right text-[13px] text-white">
          다 의미 없어… 사라지고 싶어.
        </div>
      </div>
      <div className="rounded-2xl border border-cosmic-cyan/30 bg-background/90 p-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cosmic-cyan/15">
          <HeartHandshake className="h-6 w-6 text-cosmic-cyan" />
        </div>
        <p className="mt-3 text-sm font-semibold">잠깐, 혼자 견디지 마세요</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
          지금은 전문가의 도움이 필요한 시점인 것 같아요. 비대면 진료를 연결해 드릴까요?
        </p>
        <div className="mt-4 rounded-xl bg-cosmic-cyan py-2.5 text-[13px] font-bold text-primary-foreground">
          지금 연결하기
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">조금 더 얘기할게요</p>
      </div>
    </div>
  );
}

/* 소셜 탐사: 실시간 3D 은하수 (앱의 유리 행성 디자인) + C2C 오버레이 */
function GalaxyCard() {
  return (
    <div className="relative w-full max-w-[440px] overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-[hsl(258,40%,12%)] to-card shadow-2xl">
      {/* live 3D galaxy */}
      <GalaxyExplorer className="h-[360px] w-full sm:h-[420px]" />

      {/* top bar overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <p className="text-sm font-semibold text-foreground">은하수 탐험</p>
        <span className="rounded-full bg-background/50 px-3 py-1 text-[11px] font-bold text-stellar-gold backdrop-blur">
          🪙 1,250
        </span>
      </div>

      {/* bottom visit card overlay */}
      <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-border/60 bg-background/70 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-warm-rose to-cosmic-purple" />
            <div>
              <p className="text-sm font-semibold">민지님의 행성</p>
              <p className="text-[11px] text-muted-foreground">요즘 기분 · 흐림 → 맑음</p>
            </div>
          </div>
          <span className="text-sm font-bold text-stellar-gold">입장료 500 🪙</span>
        </div>
        <div className="mt-3 flex gap-2">
          <div className="flex-1 rounded-xl bg-warm-rose py-2.5 text-center text-[13px] font-bold text-white">
            방문하기
          </div>
          <div className="rounded-xl border border-warm-rose/60 px-4 py-2.5 text-center text-[13px] font-medium text-warm-rose">
            ♡ 위로의 하트
          </div>
        </div>
      </div>
    </div>
  );
}
