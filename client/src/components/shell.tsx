import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Moon, Sun, Sparkles, Waves, Star, UserSearch, FlaskConical, Heart, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-label="競艇AIラボ" className={className}>
      <rect x="1" y="1" width="30" height="30" rx="7" stroke="currentColor" strokeWidth="2" />
      <path d="M6 21c3 0 3-2.2 6-2.2s3 2.2 6 2.2 3-2.2 6-2.2c1.4 0 2 .5 2 .5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M9 14.5l7-6 7 6" stroke="hsl(var(--primary))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function useTheme() {
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return { dark, setDark };
}

const NAV = [
  { href: "/", label: "AI予想", icon: Sparkles },
  { href: "/race", label: "レース", icon: Waves },
  { href: "/ashi", label: "船足", icon: Gauge },
  { href: "/racer", label: "選手の癖", icon: UserSearch },
  { href: "/fav", label: "お気に入り", icon: Heart },
  { href: "/backtest", label: "AI検証", icon: FlaskConical },
];

export function Shell({ children }: { children: ReactNode }) {
  const { dark, setDark } = useTheme();
  const [loc] = useLocation();
  const active = (href: string) => (href === "/" ? loc === "/" : loc === href || loc.startsWith(href + "/"));
  return (
    <div className="min-h-dvh water-bg">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <Logo className="h-7 w-7" />
            <span className="font-bold tracking-tight">競艇AIラボ</span>
          </Link>
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                data-testid={`link-nav-${n.href.replace("/", "") || "picks"}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active(n.href) ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
          </nav>
          <button
            className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setDark(!dark)}
            aria-label="テーマ切替"
            data-testid="button-theme"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:pb-12">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-background/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            data-testid={`link-tab-${n.href.replace("/", "") || "picks"}`}
            className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[10px]", active(n.href) ? "font-semibold text-primary" : "text-muted-foreground")}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Boat({ n, small }: { n: number | string; small?: boolean }) {
  return <span className={cn("boat", `boat-${n}`, small && "boat-sm")}>{n}</span>;
}

export function ComboView({ combo, small, sep = "-" }: { combo: string; small?: boolean; sep?: string }) {
  const parts = combo.split("-");
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && <span className="text-xs text-muted-foreground">{sep}</span>}
          <Boat n={p} small={small} />
        </span>
      ))}
    </span>
  );
}

export function ConfidenceMeter({ value, label }: { value: number; label?: string }) {
  const tone = value >= 75 ? "bg-[hsl(var(--chart-2))]" : value >= 62 ? "bg-primary" : value >= 50 ? "bg-[hsl(var(--chart-3))]" : "bg-muted-foreground";
  return (
    <div className="min-w-[7rem]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">AI自信度</span>
        <span className="num text-lg font-bold" data-testid="text-confidence">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-700", tone)} style={{ width: `${value}%` }} />
      </div>
      {label && <div className="mt-1 text-right text-xs font-semibold">{label}</div>}
    </div>
  );
}

export function TagChip({ label, tone, title }: { label: string; tone: "good" | "bad" | "info"; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium",
        tone === "good" && "bg-[hsl(var(--chart-2)/0.14)] text-[hsl(var(--chart-2))]",
        tone === "bad" && "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
        tone === "info" && "bg-[hsl(var(--chart-3)/0.16)] text-[hsl(var(--chart-3))]",
      )}
    >
      {label}
    </span>
  );
}

export function EvBadge({ ev }: { ev: number | null }) {
  if (ev === null) return <span className="num text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "num rounded px-1.5 py-0.5 text-sm font-semibold",
        ev >= 1.2 ? "bg-[hsl(var(--chart-2)/0.16)] text-[hsl(var(--chart-2))]" : ev >= 1 ? "text-[hsl(var(--chart-2))]" : "text-muted-foreground",
      )}
    >
      {ev.toFixed(2)}
    </span>
  );
}

export function SectionTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-bold md:text-lg">{children}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(d)}%`);
export const hdLabel = (hd: string) => `${parseInt(hd.slice(4, 6))}/${parseInt(hd.slice(6, 8))}`;

export function BetTips({ tips, compact }: { tips?: { key: string; label: string; combos: string[]; prob: number; histRoi: number; histHit: number; highlight: boolean }[]; compact?: boolean }) {
  if (!tips || tips.length === 0) return null;
  return (
    <div className={cn("rounded-lg border border-primary/25 bg-primary/5", compact ? "p-2.5" : "p-3")} data-testid="bet-tips">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-primary">回収率重視の買い方</span>
        <span className="text-[10px] text-muted-foreground">過去1.9万レースの検証値</span>
      </div>
      <ul className="space-y-1.5">
        {tips.map((t) => (
          <li key={t.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid={`tip-${t.key}`}>
            <span className="w-12 shrink-0 text-xs font-medium">{t.label}</span>
            <span className="flex items-center gap-1">
              {t.combos.map((c, i) => (
                <span key={c} className="flex items-center gap-1">
                  {i > 0 && <span className="text-xs text-muted-foreground">/</span>}
                  {c.includes("-") ? <ComboView combo={c} sep="=" small /> : <Boat n={parseInt(c)} small />}
                </span>
              ))}
            </span>
            {t.highlight && <span className="rounded bg-[hsl(var(--chart-2)/0.15)] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--chart-2))]">狙い目</span>}
            <span className="ml-auto text-xs text-muted-foreground">
              AI単体 <span className="num text-foreground">{(t.prob * 100).toFixed(0)}%</span>・回収率 <span className={cn("num font-semibold", t.histRoi >= 0.95 ? "text-[hsl(var(--chart-2))]" : "text-foreground")}>{Math.round(t.histRoi * 100)}%</span>・的中 <span className="num">{Math.round(t.histHit * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DistortionList({ items, compact }: { items?: { bt: string; combo: string; odds: number; aiProb: number; mixProb: number; ev: number }[]; compact?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={cn("rounded-lg border border-[hsl(var(--chart-2)/0.4)] bg-[hsl(var(--chart-2)/0.06)]", compact ? "p-2.5" : "p-3")} data-testid="distortions">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[hsl(var(--chart-2))]">オッズのゆがみ</span>
        <span className="text-[10px] text-muted-foreground">締切直前に必ず再確認</span>
      </div>
      <ul className="space-y-1.5">
        {items.slice(0, compact ? 3 : 6).map((d) => (
          <li key={d.bt + d.combo} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid={`dist-${d.bt}-${d.combo}`}>
            <span className="w-12 shrink-0 text-xs font-medium">{d.bt}</span>
            {d.combo.includes("-") ? <ComboView combo={d.combo} sep="=" small /> : <Boat n={parseInt(d.combo)} small />}
            <span className="num text-xs">{d.odds.toFixed(1)}倍</span>
            <span className="ml-auto text-xs text-muted-foreground">
              合成確率 <span className="num text-foreground">{(d.mixProb * 100).toFixed(0)}%</span>・期待値 <span className="num font-semibold text-[hsl(var(--chart-2))]">{d.ev.toFixed(2)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 買い目を「頭-2着-3着」の流し方の形にまとめる（例: 4-1-236）
export function toForms(combos: string[]): { head: number; text: string; n: number }[] {
  const byHead = new Map<number, Map<number, number[]>>();
  for (const c of combos) {
    const [a, b, d] = c.split("-").map(Number);
    if (!byHead.has(a)) byHead.set(a, new Map());
    const m = byHead.get(a)!; if (!m.has(b)) m.set(b, []); m.get(b)!.push(d);
  }
  const out: { head: number; text: string; n: number }[] = [];
  for (const [a, m] of Array.from(byHead.entries())) {
    // merge 2着 groups that share the same 3着 set: 4-12-36
    const groups = new Map<string, number[]>();
    for (const [b, ds] of Array.from(m.entries())) { const k = ds.slice().sort().join(""); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(b); }
    for (const [ds, bs] of Array.from(groups.entries())) out.push({ head: a, text: `${a}-${bs.sort().join("")}-${ds}`, n: bs.length * ds.length });
  }
  return out.sort((x, y) => y.n - x.n);
}
export function FormLine({ combos }: { combos: string[] }) {
  const f = toForms(combos);
  return (
    <div className="mb-2 rounded-md bg-card px-2 py-1.5 text-xs" data-testid="text-forms">
      <span className="mr-1.5 text-[10px] font-semibold text-muted-foreground">流し方で書くと</span>
      {f.map((x, i) => <span key={x.text} className="num inline-block whitespace-nowrap font-semibold">{i > 0 && <span className="mx-1 text-muted-foreground">/</span>}{x.text}</span>)}
    </div>
  );
}

export function ManshuCard({ m, title, result, compact, label = "万舟" }: { m: { score: number; hitProb?: number; tier: "S" | "A" | null; realOdds: boolean; reasons: string[]; tenkai?: { lane: number; prob: number; shape: string; seconds: number[] }[]; picks: { combo: string; prob: number; odds: number; estOdds: number }[] }; title?: string; result?: string | null; compact?: boolean; label?: string }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--chart-4)/0.45)] bg-[hsl(var(--chart-4)/0.06)] p-3" data-testid={label === "中穴" ? "card-chuana" : "card-manshu"}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
        {m.tier && <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold", m.tier === "S" ? "bg-[hsl(var(--chart-4))] text-white" : "border border-[hsl(var(--chart-4))] text-[hsl(var(--chart-4))]")}>{label}{m.tier}</span>}
        <span className="font-semibold">{title ?? `${label}狙い ${m.picks.length}点`}</span>
        <span className="ml-auto text-muted-foreground">{m.picks.length}点のどれかが来る確率（AI） <span className="num font-semibold text-foreground">{((m.hitProb ?? m.score) * 100).toFixed(1)}%</span></span>
      </div>
      {m.reasons.length > 0 && (
        <ul className="mb-2 space-y-0.5 text-xs">
          {m.reasons.map((r) => <li key={r} className="flex gap-1.5"><span className="text-muted-foreground">・</span>{r}</li>)}
        </ul>
      )}
      {m.tenkai && m.tenkai.length > 0 && (
        <div className="mb-2 space-y-1 rounded-md border bg-card p-2 text-xs" data-testid="tenkai-plan">
          <div className="text-[11px] font-semibold">展開予想（頭は1号艇以外の2艇）</div>
          {m.tenkai.map((t) => (
            <div key={t.lane} className="flex flex-wrap items-center gap-1.5">
              <Boat n={t.lane} small /><span className="font-semibold">{t.shape}</span>
              <span className="text-muted-foreground">1着率</span><span className="num font-bold">{Math.round(t.prob * 100)}%</span>
              <span className="text-muted-foreground">→ 2着</span>{t.seconds.map((x) => <Boat key={x} n={x} small />)}
            </div>
          ))}
        </div>
      )}
      <FormLine combos={m.picks.map((p) => p.combo)} />
      <div className="flex flex-wrap gap-1.5">
        {m.picks.map((p) => (
          <span key={p.combo} className={cn("inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5", result === p.combo && "ring-2 ring-[hsl(var(--chart-2))]")}>
            <ComboView combo={p.combo} small /><span className="num text-[10px] text-muted-foreground">{p.odds >= 1000 ? Math.round(p.odds) : p.odds.toFixed(0)}倍</span>
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">{m.realOdds ? "倍率は取得時点の実オッズ" : "オッズ発表前のため倍率はAIの推定値"}。{m.tenkai?.length ? "2着は展開（差し・まくりの連動や1号艇の残り）の2艇とAIが選ぶ1艇、3着は全通り。その中の推定30倍以上から、AI確率の高い順に最大20点。" : `配当${label === "中穴" ? "50" : "80"}倍以上（オッズ発表後は実オッズで判定）の組み合わせから、AI確率の高い順に10点。`}</p>
    </div>
  );
}
