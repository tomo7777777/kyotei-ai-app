import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionTitle } from "@/components/shell";
import { FavStar } from "@/components/fav";
import { cn } from "@/lib/utils";

type VRow = { toban: string; name: string; n: number; lanes: number[]; m: Record<string, { avg: number; srank: number; stotal: number; mark: string; n: number }>; summary: string[] };
type VAshi = { jcd: string; venue: string; from: string | null; to: string | null; days: number; races: number; keys: string[]; labels: Record<string, string>; rows: VRow[] };
type VList = { jcd: string; venue: string; from: string | null; to: string | null; days: number; racers: number }[];
const md = (h: string | null) => (h ? `${parseInt(h.slice(4, 6))}/${parseInt(h.slice(6, 8))}` : "");
const todayHd = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");

export default function AshiPage() {
  const { data: vs } = useQuery<VList>({ queryKey: ["/api/ashi/venues"], refetchInterval: 180_000 });
  const [jcd, setJcd] = useState<string | null>(null);
  useEffect(() => { if (!jcd && vs?.length) setJcd((vs.find((v) => v.to === todayHd()) ?? vs.find((v) => v.racers) ?? vs[0]).jcd); }, [vs, jcd]);
  const { data, isLoading } = useQuery<VAshi>({ queryKey: [`/api/ashi/venue?jcd=${jcd}`], enabled: !!jcd, refetchInterval: 180_000 });
  const [sortKey, setSortKey] = useState<string | null>(null);
  const key = sortKey && data?.keys.includes(sortKey) ? sortKey : data?.keys[0] ?? null;
  const rows = [...(data?.rows ?? [])].sort((a, b) => (a.m[key ?? ""]?.srank ?? 999) - (b.m[key ?? ""]?.srank ?? 999));
  const t = todayHd();
  return (
    <div className="space-y-4">
      <SectionTitle sub="各場のオリジナル展示（直線・まわり足・一周など）から、今節走っている選手の足を一覧にしています。「平均◯位」は同じレースの6人中の順位の平均（小さいほど良い。展示2回以上で◎2.0位以内・○2.8位以内・△4.5位以下）、青字の「節間」は今節この場の全選手の中での順位です。江戸川はオリジナル展示を公開していないため対象外です。">船足</SectionTitle>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[...(vs ?? [])].sort((a, b) => (b.racers ? 1 : 0) - (a.racers ? 1 : 0) || a.jcd.localeCompare(b.jcd)).map((v) => (
          <button key={v.jcd} onClick={() => setJcd(v.jcd)} disabled={!v.racers} data-testid={`chip-ashi-${v.jcd}`}
            className={cn("shrink-0 rounded-lg border px-3 py-1.5 text-left text-sm", jcd === v.jcd ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card", !v.racers && "opacity-40")}>
            <div>{v.venue}</div>
            <div className="text-[10px] font-normal text-muted-foreground">{v.racers ? (v.to === t ? `開催中・${v.days}日分` : `${md(v.to)}まで・${v.days}日分`) : "データなし"}</div>
          </button>
        ))}
      </div>
      {isLoading || !data ? <Skeleton className="h-60 w-full rounded-xl" /> : !data.rows.length ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">この場の今節のデータはまだありません。</div>
      ) : (<>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{data.venue} 今節 {md(data.from)}〜{md(data.to)}（{data.days}日・{data.races}レース・{data.rows.length}人）</span>
          <span className="ml-auto flex items-center gap-1">並び順
            {data.keys.map((k) => <button key={k} onClick={() => setSortKey(k)} data-testid={`sort-${k}`} className={cn("rounded-md border px-2 py-0.5", key === k ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card")}>{data.labels[k]}</button>)}
          </span>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.toban} className="rounded-xl border bg-card p-3" data-testid={`row-ashi-${r.toban}`}>
              <div className="flex items-center gap-2">
                <span className="num w-6 text-center text-sm font-bold text-blue-600 dark:text-blue-400">{i + 1}</span>
                <Link href={`/racer/${r.toban}`} className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold hover:text-primary">{r.name} <span className="text-[11px] font-normal text-muted-foreground">{r.toban}・展示{r.n}回</span></div>
                </Link>
                {r.summary.map((s) => <span key={s} className={cn("shrink-0 rounded px-1 text-[10px] font-bold", s === "足が弱め" ? "bg-muted text-muted-foreground" : "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]")}>{s}</span>)}
                <FavStar toban={r.toban} name={r.name} size="sm" />
              </div>
              <div className="mt-1.5 grid gap-2" style={{ gridTemplateColumns: `repeat(${data.keys.length}, minmax(0, 1fr))` }}>
                {data.keys.map((k) => { const x = r.m[k]; return (
                  <div key={k} className={cn("rounded-md px-2 py-1 text-[11px]", key === k ? "bg-primary/5" : "bg-muted/40")}>
                    <div className="text-[10px] text-muted-foreground">{data.labels[k]}</div>
                    {x ? (<>
                      <div className={cn("num font-bold", x.mark === "◎" && "text-[hsl(var(--chart-2))]", x.mark === "△" && "text-muted-foreground")}>{x.mark}平均{x.avg.toFixed(1)}位</div>
                      <div className="num text-[10px] font-semibold text-blue-600 dark:text-blue-400">節間 {x.srank}位/{x.stotal}人</div>
                    </>) : <div className="text-muted-foreground">—</div>}
                  </div>
                ); })}
              </div>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}
