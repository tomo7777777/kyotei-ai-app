import { FavStar, FavMemo } from "@/components/fav";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Clock, RefreshCw, Star, ChevronRight, Wind, Thermometer, Waves as WavesIcon, ArrowUpDown } from "lucide-react";
import { STATIC } from "@/lib/staticApi";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Analysis, Venue, Entry, Combo } from "@/lib/types";
import { ManshuCard, BetTips, DistortionList, Boat, ComboView, ConfidenceMeter, EvBadge, SectionTitle, TagChip, pct, hdLabel } from "@/components/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function planHon(plan: NonNullable<Analysis["plan"]>) {
  if (plan.hon) return plan.hon;
  const fav = (plan.entries ?? []).slice().sort((a, b) => b.winProb - a.winProb)[0];
  const q = new Map<string, number>();
  for (const c of plan.main) { const k = c.combo.split("-").slice(0, 2).map(Number).sort().join("-"); q.set(k, (q.get(k) ?? 0) + c.prob); }
  return { fav: fav?.lane ?? 1, favProb: fav?.winProb ?? 0, qu: Array.from(q.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([combo, prob]) => ({ combo, prob })) };
}
const resWin = (r: Analysis["result"]) => r?.win ?? r?.order?.[0] ?? null;
const resQu = (r: Analysis["result"]) => r?.quinella ?? (r?.order && r.order.length >= 2 ? [r.order[0], r.order[1]].sort().join("-") : null);

type Meta = { today: string; tomorrow: string; nowMin: number };

export function VenueList() {
  const { data: meta } = useQuery<Meta>({ queryKey: ["/api/meta"] });
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const hd = meta ? meta[day] : "";
  const { data, isLoading, error } = useQuery<Venue[]>({ queryKey: [`/api/venues?hd=${hd}`], enabled: !!hd, staleTime: 60_000 });

  return (
    <div>
      <SectionTitle
        sub="レース場とレース番号を選ぶと、期待値・選手の癖・AI予想を表示します。"
        right={
          <div className="flex rounded-lg border p-0.5 text-sm">
            {(["today", "tomorrow"] as const).map((d) => (
              <button key={d} onClick={() => setDay(d)} data-testid={`button-day-${d}`} className={cn("rounded-md px-3 py-1", day === d ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {d === "today" ? "今日" : "明日"}{meta ? ` ${hdLabel(meta[d])}` : ""}
              </button>
            ))}
          </div>
        }
      >
        開催レース場
      </SectionTitle>
      {isLoading || !hd ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : error ? (
        <p className="rounded-lg border p-4 text-sm text-destructive">{String((error as Error).message)}</p>
      ) : !data?.length ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">この日の開催情報はまだ発表されていません。</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...data].sort((a, b) => Number(a.finished) - Number(b.finished)).map((v) => (
            <div key={v.jcd} className={cn("rounded-xl border bg-card p-4", v.finished && "opacity-60")} data-testid={`card-venue-${v.jcd}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold">{v.name}</h3>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{v.grade}</span>
                    {v.timeZone && <span className="rounded bg-accent px-1.5 py-0.5 text-[11px]">{v.timeZone}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{v.title}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{v.day.split(" ").pop()}</span>
              </div>
              <div className="mt-3 grid grid-cols-6 gap-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((r) => {
                  const dl = v.deadlines[r - 1];
                  const isNext = v.nextRace === r;
                  const past = day === "today" && (v.nextRace === null || r < (v.nextRace ?? 13));
                  return (
                    <Link
                      key={r}
                      href={`/race/${hd}/${v.jcd}/${r}`}
                      data-testid={`link-race-${v.jcd}-${r}`}
                      className={cn(
                        "flex flex-col items-center rounded-md border py-1 text-xs transition-colors hover:border-primary",
                        isNext && "border-primary bg-primary/10 font-bold",
                        past && "text-muted-foreground",
                      )}
                    >
                      <span className="font-semibold">{r}R</span>
                      <span className="num text-[10px] text-muted-foreground">{dl ?? ""}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusLabel(a: Analysis) {
  if (a.status === "finished") return { t: "確定", c: "bg-muted text-muted-foreground" };
  if (a.status === "closed") return { t: "締切", c: "bg-muted text-muted-foreground" };
  return { t: "発売中", c: "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]" };
}

type AshiLane = { lane: number; today: Record<string, { v: number | null; rank: number | null }> | null; series: Record<string, { n: number; avg: number; mark: string; srank?: number; stotal?: number }>; n: number; summary: string[] };
type Ashi = { available: boolean; venue: string | null; keys: string[]; labels: Record<string, string>; lanes: AshiLane[] };
function AshiRow({ x, keys, labels }: { x: AshiLane; keys: string[]; labels: Record<string, string> }) {
  if (!x.n && !x.today) return <div className="mt-2 rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground" data-testid={`ashi-${x.lane}`}>今節の足：まだ記録がありません</div>;
  return (
    <div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5" data-testid={`ashi-${x.lane}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold">今節の足{x.n ? <span className="font-normal text-muted-foreground">（展示{x.n}回の順位平均）</span> : null}
        {x.summary.map((t) => <span key={t} className={cn("rounded px-1 text-[10px] font-bold", t === "足が弱め" ? "bg-muted text-muted-foreground" : "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]")}>{t}</span>)}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
        {keys.map((k) => { const sr = x.series[k]; const td = x.today?.[k];
          return (
            <div key={k} className="text-[11px]">
              <div className="text-[10px] text-muted-foreground">{labels[k] ?? k}</div>
              <div className="num"><span className={cn("font-bold", sr?.mark === "◎" && "text-[hsl(var(--chart-2))]", sr?.mark === "△" && "text-muted-foreground")}>{sr?.mark || ""}{sr ? `${sr.avg.toFixed(1)}位` : "—"}</span></div>
              {sr?.srank && sr.stotal ? <div className="num text-[10px] font-semibold text-blue-600 dark:text-blue-400" data-testid={`srank-${x.lane}-${k}`}>節間 {sr.srank}位/{sr.stotal}人</div> : null}
              {td && td.v !== null && <div className="num text-[10px] text-muted-foreground">今回 {td.v.toFixed(2)}（{td.rank}位）</div>}
            </div>
          ); })}
      </div>
    </div>
  );
}
function EntryCard({ e, hd, ashi }: { e: Entry; hd: string; ashi?: Ashi }) {
  const [, nav] = useLocation();
  const [openTag, setOpenTag] = useState<string | null>(null);
  const stat = (label: string, v: string, hi?: boolean) => (
    <div className="rounded-md bg-muted/50 px-2 py-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("num text-sm", hi && "font-bold text-primary")}>{v}</div>
    </div>
  );
  const fmt = (v: number | null, d = 2) => (v === null || v === undefined ? "—" : v.toFixed(d));
  return (
    <div className="rounded-xl border bg-card p-3" data-testid={`card-entry-${e.lane}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-5 text-center text-lg font-bold">{e.mark}</span>
        <Boat n={e.lane} />
        <button className="min-w-0 flex-1 text-left" onClick={() => nav(`/racer/${e.toban}`)} data-testid={`button-racer-${e.toban}`}>
          <div className="truncate font-bold hover:text-primary">{e.name} <span className="text-xs font-semibold text-muted-foreground">{e.cls}</span></div>
          <div className="truncate text-[11px] text-muted-foreground">{e.toban}・{e.branch}・{e.age}歳・{e.weight}kg{e.course !== e.lane && <span className="ml-1 font-semibold text-[hsl(var(--chart-3))]">進入{e.course}コース</span>}</div>
        </button>
        <FavStar toban={e.toban} name={e.name} cls={e.cls} branch={e.branch} size="sm" />
        <div className="text-right">
          <div className="num text-lg font-bold leading-none">{pct(e.winProb, 0)}</div>
          <div className="text-[10px] text-muted-foreground">1着率</div>
        </div>
      </div>
      <div className="mt-2"><FavMemo toban={e.toban} compact /></div>
      {ashi?.available && (() => { const x = ashi.lanes.find((l) => l.lane === e.lane); return x ? <AshiRow x={x} keys={ashi.keys} labels={ashi.labels} /> : null; })()}
      <div className="mt-2 flex gap-3 text-[11px] text-muted-foreground">
        <span>2連対 <span className="num text-foreground">{pct(e.top2Prob, 0)}</span></span>
        <span>3連対 <span className="num text-foreground">{pct(e.top3Prob, 0)}</span></span>
        {e.marketWin !== null && <span>市場1着 <span className="num text-foreground">{pct(e.marketWin, 0)}</span></span>}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {stat("全国勝率", fmt(e.natWin))}
        {stat("当地勝率", fmt(e.locWin))}
        {stat("モーター2連", e.motor2 === null ? "—" : `${e.motor2.toFixed(0)}%`, (e.motor2 ?? 0) >= 45)}
        {stat("平均ST", fmt(e.avgST))}
        {stat("展示タイム", fmt(e.exTime), e.exRank === 1)}
        {stat("展示ST", e.exST === null ? "—" : e.exST < 0 ? `F${Math.abs(e.exST).toFixed(2)}` : e.exST.toFixed(2))}
        {stat("チルト", e.tilt === null ? "—" : e.tilt.toFixed(1))}
        {stat("F/L", `F${e.f} L${e.l}`)}
      </div>
      {e.series.length > 0 && (
        <div className="mt-2 flex items-center gap-1 overflow-x-auto text-[11px]">
          <span className="shrink-0 text-muted-foreground">今節</span>
          {e.series.map((s, i) => (
            <span key={i} className="num flex shrink-0 flex-col items-center rounded border px-1 leading-tight" title={`枠${s.frame} 進入${s.course} ST${s.st}`}>
              <span className={cn("font-bold", s.rank === "1" && "text-primary")}>{s.rank || "-"}</span>
              <span className="text-[9px] text-muted-foreground">{s.course}C</span>
            </span>
          ))}
        </div>
      )}
      {e.tags.length > 0 && (
        <>
          <div className="mt-2 flex flex-wrap gap-1">
            {e.tags.map((t) => (
              <button key={t.label} onClick={() => setOpenTag(openTag === t.label ? null : t.label)} data-testid={`button-tag-${e.lane}-${t.label}`}>
                <TagChip label={t.label} tone={t.tone} title={t.detail} />
              </button>
            ))}
          </div>
          {openTag && <p className="mt-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground fade-in">{e.tags.find((t) => t.label === openTag)?.detail}</p>}
        </>
      )}
      {e.factors?.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]" data-testid={`factors-${e.lane}`}>
          <span className="text-muted-foreground">AI評価</span>
          {[...e.factors].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 4).map((f) => (
            <span key={f.label} className={cn("rounded px-1.5 py-0.5", f.value > 0 ? "bg-[hsl(var(--chart-2)/0.12)] text-[hsl(var(--chart-2))]" : "bg-destructive/10 text-destructive")}>
              {f.value > 0 ? "+" : "−"} {f.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const isValue = (c: Combo) => c.prob >= 0.015 && !!c.marketProb && c.prob / c.marketProb >= 1.12;

function EvTable({ a }: { a: Analysis }) {
  const [kind, setKind] = useState<"3t" | "2t">("3t");
  const [sort, setSort] = useState<"ev" | "prob" | "odds">("prob");
  const [onlyPlus, setOnlyPlus] = useState(false);
  const [head, setHead] = useState<number | null>(null);
  const [limit, setLimit] = useState(20);
  const rows = useMemo(() => {
    let r: Combo[] = kind === "3t" ? a.trifecta : a.exacta;
    if (head) r = r.filter((c) => c.combo.startsWith(`${head}-`));
    if (onlyPlus) r = r.filter(isValue);
    const key = (c: Combo) => (sort === "ev" ? c.ev ?? -1 : sort === "prob" ? c.prob : c.odds ?? 0);
    return [...r].sort((x, y) => (sort === "odds" ? key(x) - key(y) : key(y) - key(x)));
  }, [a, kind, sort, onlyPlus, head]);
  const plusCount = (kind === "3t" ? a.trifecta : a.exacta).filter(isValue).length;

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="flex rounded-lg border p-0.5 text-sm">
          {(["3t", "2t"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} data-testid={`button-kind-${k}`} className={cn("rounded-md px-3 py-1", kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {k === "3t" ? "3連単" : "2連単"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">1着</span>
          <button onClick={() => setHead(null)} className={cn("rounded border px-1.5 py-0.5", head === null && "border-primary text-primary")} data-testid="button-head-all">全</button>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} onClick={() => setHead(head === n ? null : n)} className={cn("rounded p-0.5", head === n ? "ring-2 ring-primary" : "opacity-80")} data-testid={`button-head-${n}`}>
              <Boat n={n} small />
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={onlyPlus} onChange={(e) => setOnlyPlus(e.target.checked)} data-testid="checkbox-plus" />
          妙味ありのみ（{plusCount}点）
        </label>
      </div>
      {!a.oddsAvailable && <p className="border-b p-3 text-xs text-muted-foreground">オッズ発表前のため、AI確率のみ表示しています。</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="p-2 text-left font-medium">買い目</th>
              {(["prob", "odds", "ev"] as const).map((k) => (
                <th key={k} className="p-2 text-right font-medium">
                  <button onClick={() => setSort(k)} className={cn("inline-flex items-center gap-0.5", sort === k && "text-foreground")} data-testid={`button-sort-${k}`}>
                    {k === "prob" ? "AI確率" : k === "odds" ? "オッズ" : "期待値"} <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              ))}
              <th className="hidden p-2 text-right font-medium sm:table-cell">モデル / 市場</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((c) => (
              <tr key={c.combo} className={cn("border-b border-border/50", a.result?.trifecta === c.combo || a.result?.exacta === c.combo ? "bg-[hsl(var(--chart-2)/0.12)]" : "")} data-testid={`row-combo-${c.combo}`}>
                <td className="p-2"><ComboView combo={c.combo} small /></td>
                <td className="num p-2 text-right">{pct(c.prob)}</td>
                <td className="num p-2 text-right">{c.odds ? c.odds.toFixed(1) : "—"}</td>
                <td className="p-2 text-right"><EvBadge ev={c.ev} /></td>
                <td className="num hidden p-2 text-right text-xs text-muted-foreground sm:table-cell">{pct(c.modelProb)} / {pct(c.marketProb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button className="w-full p-2.5 text-sm font-semibold text-primary" onClick={() => setLimit(limit + 40)} data-testid="button-more-combos">
          さらに表示（残り{rows.length - limit}点）
        </button>
      )}
      {rows.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">該当する買い目はありません。</p>}
    </div>
  );
}

export function RaceDetail({ hd, jcd, rno }: { hd: string; jcd: string; rno: number }) {
  const key = `/api/race?hd=${hd}&jcd=${jcd}&rno=${rno}`;
  const { data: a, isLoading, error, isFetching } = useQuery<Analysis>({
    queryKey: [key],
    staleTime: 60_000,
    refetchInterval: (q) => ((q.state.data as Analysis | undefined)?.status === "upcoming" ? 60_000 : false),
  });
  const { data: ashi } = useQuery<Ashi>({ queryKey: [`/api/ashi?hd=${hd}&jcd=${jcd}&rno=${rno}`], staleTime: 60_000, refetchInterval: (q) => (a?.status === "upcoming" ? 120_000 : false) });
  const { toast } = useToast();
  const add = useMutation({
    mutationFn: () => apiRequest("POST", "/api/myraces", { hd, jcd, rno, memo: "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/myraces"] });
      toast({ title: "マイレースに追加しました", description: "「マイレース」タブで買い目の期待値を管理できます。" });
    },
  });
  const forceRefresh = async () => {
    const r = await apiRequest("GET", key + "&fresh=1");
    queryClient.setQueryData([key], await r.json());
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        <Link href="/race" className="mr-1 shrink-0 text-xs text-muted-foreground hover:text-foreground" data-testid="link-back-venues">レース場一覧</Link>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((r) => (
          <Link key={r} href={`/race/${hd}/${jcd}/${r}`} className={cn("shrink-0 rounded-md border px-2.5 py-1 text-xs", r === rno ? "border-primary bg-primary text-primary-foreground font-bold" : "hover:border-primary")} data-testid={`link-rno-${r}`}>
            {r}R
          </Link>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <p className="text-center text-xs text-muted-foreground">出走表・オッズ・展示情報・選手のコース別成績を取得中…</p>
          <div className="grid gap-3 md:grid-cols-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
        </div>
      ) : error || !a ? (
        <p className="rounded-xl border p-6 text-sm text-destructive">{error ? String((error as Error).message) : "データがありません"}</p>
      ) : (
        <>
          <section className="rounded-xl border bg-card p-4 md:p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold">{a.venue} {a.rno}R</h1>
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", statusLabel(a).c)}>{statusLabel(a).t}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{a.raceTitle}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{hdLabel(a.hd)} 締切 <span className="num text-foreground">{a.deadline ?? "—"}</span></span>
                  {a.weather && (
                    <>
                      <span className="inline-flex items-center gap-1"><Thermometer className="h-3.5 w-3.5" />{a.weather.weather} {a.weather.temp}</span>
                      <span className="inline-flex items-center gap-1"><Wind className="h-3.5 w-3.5" />風 {a.weather.wind}</span>
                      <span className="inline-flex items-center gap-1"><WavesIcon className="h-3.5 w-3.5" />波 {a.weather.wave}</span>
                    </>
                  )}
                  {!a.beforeAvailable && <span>展示情報は締切の約20分前に反映</span>}
                </div>
              </div>
              <ConfidenceMeter value={a.confidence} label={a.confidenceLabel} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!STATIC && <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending} data-testid="button-add-myrace">
                <Star className="mr-1.5 h-4 w-4" />マイレースに追加
              </Button>}
              <Button size="sm" variant="outline" onClick={forceRefresh} disabled={isFetching} data-testid="button-refresh-race">
                <RefreshCw className={cn("mr-1.5 h-4 w-4", isFetching && "animate-spin")} />{STATIC ? "最新データを読み込む" : "最新オッズで再計算"}
              </Button>
            </div>
          </section>

          {a.result?.finished && (
            <section className="flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--chart-2)/0.4)] bg-[hsl(var(--chart-2)/0.08)] p-4 text-sm">
              <span className="font-bold">レース結果</span>
              <ComboView combo={a.result.trifecta!} />
              <span className="num">3連単 {a.result.trifectaPay?.toLocaleString()}円</span>
              <span className="num text-muted-foreground">2連単 {a.result.exacta} {a.result.exactaPay?.toLocaleString()}円</span>
              <span className="text-muted-foreground">決まり手 {a.result.kimarite}</span>
              <span className="ml-auto flex flex-wrap items-center gap-3 font-semibold">
                {a.plan && <span data-testid="text-judge-plan">朝の予想 {a.plan.main.some((m) => m.combo === a.result!.trifecta) ? "的中" : "不的中"}</span>}
                {a.pre && <span className="text-muted-foreground" data-testid="text-judge-pre">締切5分前の予想 {a.pre.main.some((m) => m.combo === a.result!.trifecta) ? "的中" : "不的中"}</span>}
                {a.plan?.chuana?.tier && <span className="text-[hsl(var(--chart-4))]" data-testid="text-judge-chuana">中穴狙い {a.plan.chuana.picks.some((m) => m.combo === a.result!.trifecta) ? "的中" : "不的中"}</span>}
                {a.plan?.manshu?.tier && <span className="text-[hsl(var(--chart-4))]" data-testid="text-judge-manshu">万舟狙い {a.plan.manshu.picks.some((m) => m.combo === a.result!.trifecta) ? "的中" : "不的中"}</span>}
                {!a.plan && !a.pre && <span>AI推奨 {a.main.some((m) => m.combo === a.result!.trifecta) ? "的中" : "不的中"}</span>}
              </span>
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="rounded-xl border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="font-bold">AIの予想</h2>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" data-testid="text-model-kind">
                  {a.modelKind === "ml" ? "機械学習モデル（過去1年・約5万レースで学習・56項目）" : "基本モデル"}
                </span>
              </div>
              <div className="space-y-1 text-sm leading-relaxed">{a.comment.map((c, i) => <p key={i}>{c}</p>)}</div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="space-y-2">
                <DistortionList items={a.distortions} />
                <BetTips tips={a.betTips} />
              </div>
              {a.plan && (
                <div className="mt-3 rounded-lg border p-3" data-testid="card-plan">
                  <div className="mb-1.5 flex items-center gap-2 text-xs">
                    {a.plan.tier === "S" && <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">S</span>}
                    <span className="font-semibold">朝の予想（固定）</span>
                    <span className="text-muted-foreground">{new Date(a.plan.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })}時点・自信度 <span className="num text-foreground">{a.plan.confidence}</span></span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.plan.main.map((m) => (
                      <span key={m.combo} className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5", a.result?.trifecta === m.combo && "ring-2 ring-[hsl(var(--chart-2))]")}>
                        <ComboView combo={m.combo} small /><span className="num text-[10px] text-muted-foreground">{pct(m.prob, 0)}</span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">AI予想タブの成績はこの5点で計算しています。</p>
                  {(() => {
                    const pf = a.plan.entries?.slice().sort((x, y) => y.winProb - x.winProb)[0];
                    const cf = a.entries.slice().sort((x, y) => y.winProb - x.winProb)[0];
                    return a.status === "upcoming" && pf && cf && pf.lane !== cf.lane ? (
                      <p className="mt-1.5 rounded-md bg-[hsl(var(--chart-4)/0.1)] px-2 py-1 text-xs text-[hsl(var(--chart-4))]" data-testid="warn-fav-race">
                        朝の本命は{pf.lane}号艇でしたが、最新の分析では{cf.lane}号艇 {cf.name}が本命です。
                      </p>
                    ) : null;
                  })()}
                </div>
              )}
              {((a.plan?.chuana?.tier) || a.chuana?.tier) && (
                <div className="mb-3">
                  {a.plan?.chuana?.tier
                    ? <ManshuCard label="中穴" m={a.plan!.chuana!} title="中穴狙い 10点（朝の予想・固定）" result={a.result?.trifecta} />
                    : <ManshuCard label="中穴" m={a.chuana!} title={"中穴狙い 10点（最新の分析・参考）"} result={a.result?.trifecta} />}
                </div>
              )}
              {((a.plan?.manshu?.tier) || a.manshu?.tier) && (
                <div className="mt-3">
                  {a.plan?.manshu?.tier
                    ? <ManshuCard m={a.plan!.manshu!} title={`万舟狙い ${a.plan!.manshu!.picks.length}点（朝の予想・固定）`} result={a.result?.trifecta} />
                    : <ManshuCard m={a.manshu!} title={`万舟狙い ${a.manshu!.picks.length}点（最新の分析・参考）`} result={a.result?.trifecta} />}
                </div>
              )}
              <h2 className="mb-2 mt-3 font-bold">{a.status === "upcoming" ? "最新の推奨買い目（3連単）" : "確定オッズで再計算した買い目（参考）"}</h2>
              <table className="w-full text-sm">
                <tbody>
                  {a.main.map((c) => (
                    <tr key={c.combo} className="border-b border-border/60 last:border-0">
                      <td className="py-1.5"><ComboView combo={c.combo} small /></td>
                      <td className="num text-right text-xs text-muted-foreground">{pct(c.prob)}</td>
                      <td className="num text-right">{c.odds ? `${c.odds.toFixed(1)}倍` : "—"}</td>
                      <td className="text-right"><EvBadge ev={c.ev} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {a.value.length > 0 && (
                <>
                  <h3 className="mb-1 mt-3 text-xs font-semibold text-[hsl(var(--chart-2))]">妙味（期待値が高い穴目）</h3>
                  <div className="flex flex-wrap gap-2">
                    {a.value.map((v) => (
                      <span key={v.combo} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs">
                        <ComboView combo={v.combo} small /> <span className="num">{v.odds?.toFixed(1)}倍</span> <EvBadge ev={v.ev} />
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          <section>
            <SectionTitle sub={`選手名をタップするとコース別の詳しい癖を表示。タグをタップすると根拠が出ます。${ashi?.available ? "「今節の足」は、この場のオリジナル展示（直線・まわり足・一周など）で同じレースの6人中何位だったかの今節の平均です（小さいほど良い。◎2.0位以内、○2.8位以内、△4.5位以下、2回以上で判定）。青字の「節間」は、今節この場を走った全選手の中での順位です（各レースの平均タイムとの差で比較）。" : ""}`}>出走選手と癖</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">{a.entries.map((e) => <EntryCard key={e.lane} e={e} hd={hd} ashi={ashi} />)}</div>
          </section>

          <section>
            <SectionTitle sub="期待値＝AI確率×オッズ。控除率が約25%あるため多くは1.00未満です。「妙味あり」はAI確率が市場確率より12%以上高い買い目です。">期待値一覧</SectionTitle>
            <EvTable a={a} />
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-bold">{a.venue}の水面傾向</h2>
            <p className="mb-3 text-xs text-muted-foreground">コース別1着率（{a.venueStats.period || "直近"}）</p>
            <div className="space-y-1.5">
              {a.venueStats.course1st.map((v, i) => {
                const k = a.venueStats.kimarite[i];
                const topK = k ? Object.entries(k).filter(([, x]) => x > 0).sort((x, y) => y[1] - x[1]).slice(0, 2) : [];
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-14 whitespace-nowrap text-xs text-muted-foreground">{i + 1}コース</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
                    </div>
                    <span className="num w-12 text-right">{v.toFixed(1)}%</span>
                    <span className="hidden w-36 text-xs text-muted-foreground sm:block">{topK.map(([n, x]) => `${n}${x.toFixed(0)}%`).join(" ")}</span>
                  </div>
                );
              })}
            </div>
          </section>
          <p className="text-right text-xs text-muted-foreground">データ: BOAT RACE オフィシャルウェブサイト ／ 計算 {new Date(a.updatedAt).toLocaleTimeString("ja-JP")}</p>
        </>
      )}
    </div>
  );
}
