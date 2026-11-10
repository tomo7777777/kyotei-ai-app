import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Moon, Sun, ShieldCheck, Clock, ListChecks, TriangleAlert } from "lucide-react";
import { Logo, ComboView, useTheme, hdLabel } from "@/components/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type TRace = {
  jcd: string; venue: string; rno: number; deadline: string | null; raceTitle: string; confidence: number; addedAt: string;
  picks: { combo: string; prob: number }[];
  result: { trifecta: string | null; trifectaPay: number | null } | null; hit: boolean | null;
};
type RecDay = { hd: string; n: number; hit: number; inv: number; ret: number };
type TResp = {
  hd: string; createdAt: string | null; races: TRace[];
  yesterday: { hd: string; races: TRace[] } | null;
  recentHits: ({ hd: string } & TRace)[];
  record: { from: string | null; days: RecDay[]; total: { n: number; hit: number; inv: number; ret: number } };
};

const UNIT = 10; // 1点1,000円（記録は100円単位）
const yen = (v: number) => `${v < 0 ? "-" : ""}${Math.abs(Math.round(v)).toLocaleString()}円`;
const jstHm = (iso: string | null) => { if (!iso) return "—"; const d = new Date(new Date(iso).getTime() + 9 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const nowHm = () => { const d = new Date(Date.now() + 9 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const toM = (t: string | null) => (t ? parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3, 5)) : 0);

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-3 text-center">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("num mt-0.5 text-xl font-bold", tone === "good" && "text-[hsl(var(--chart-2))]", tone === "bad" && "text-destructive")}>{value}</div>
      {sub ? <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function RaceCard({ r, hd, live }: { r: TRace; hd: string; live?: boolean }) {
  const left = toM(r.deadline) - nowHm();
  const status = r.result ? (r.hit ? "hit" : "miss") : live && left > 0 ? "open" : "wait";
  return (
    <div className={cn("rounded-2xl border bg-card p-4", status === "hit" && "border-[hsl(var(--chart-2))]")} data-testid={`teppan-${r.jcd}-${r.rno}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold">{r.venue} {r.rno}R</span>
        <span className="num text-sm text-muted-foreground">締切 {r.deadline ?? "—"}</span>
        <span className="ml-auto text-xs">
          {status === "hit" && <span className="rounded-full bg-[hsl(var(--chart-2)/0.15)] px-2 py-0.5 font-bold text-[hsl(var(--chart-2))]">的中</span>}
          {status === "miss" && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">不的中</span>}
          {status === "open" && <span className="num rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">あと{left >= 60 ? `${Math.floor(left / 60)}時間${left % 60}分` : `${left}分`}</span>}
          {status === "wait" && <span className="text-muted-foreground">結果待ち</span>}
        </span>
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{r.raceTitle}・AI自信度 <span className="num font-semibold text-foreground">{r.confidence}</span></div>
      <div className="mt-3 space-y-1.5">
        {r.picks.map((p) => (
          <div key={p.combo} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", r.result?.trifecta === p.combo && "border-[hsl(var(--chart-2))] bg-[hsl(var(--chart-2)/0.1)]")}>
            <span className="text-[11px] text-muted-foreground">3連単</span>
            <ComboView combo={p.combo} />
            <span className="ml-auto text-[11px] text-muted-foreground">AI確率 <span className="num font-semibold text-foreground">{Math.round(p.prob * 100)}%</span></span>
          </div>
        ))}
      </div>
      {r.result?.trifecta ? (
        <div className="mt-2 text-xs text-muted-foreground">
          結果 <span className="num font-semibold text-foreground">{r.result.trifecta}</span>
          {r.result.trifectaPay ? <>（3連単 {r.result.trifectaPay.toLocaleString()}円）{r.hit ? <span className="ml-1 font-semibold text-[hsl(var(--chart-2))]">1,000円が{yen(r.result.trifectaPay * UNIT)}</span> : null}</> : null}
        </div>
      ) : null}
      <div className="mt-2 text-[10px] text-muted-foreground">予想確定 {jstHm(r.addedAt)}<Link href={`/race/${hd}/${r.jcd}/${r.rno}`} className="ml-2 underline">レース詳細</Link></div>
    </div>
  );
}

export default function TeppanPage() {
  const { dark, setDark } = useTheme();
  const { data, isLoading } = useQuery<TResp>({ queryKey: ["/api/teppan"], refetchInterval: 60_000 });
  const t = data?.record.total;
  const inv = (t?.inv ?? 0) * UNIT, ret = (t?.ret ?? 0) * UNIT;
  const roi = inv ? ret / inv : 0;
  const days = [...(data?.record.days ?? [])].reverse();
  const live = (data?.races ?? []).filter((r) => !r.result);
  const done = (data?.races ?? []).filter((r) => r.result);
  return (
    <div className="min-h-dvh water-bg">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
          <Logo className="h-7 w-7" />
          <span className="font-bold">競艇AIラボ</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">本日の鉄板</span>
          <button onClick={() => setDark(!dark)} className="ml-auto rounded-lg p-2 hover:bg-muted" aria-label="表示切替" data-testid="teppan-theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-16 pt-6">
        <section>
          <div className="text-xs font-semibold text-primary">現在 無料公開中</div>
          <h1 className="mt-1 text-2xl font-bold leading-snug">AIが自信を持てたレースだけ。<br />3連単を1〜2点で。</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            全国のレースをAIが朝に分析し、自信度90以上のレースから、当たる確率が20%以上ある3連単だけを出します。対象がない日は無理に出しません。予想は朝に確定し、あとから変えません。外れも含めて全部の成績を載せています。
          </p>
        </section>

        <section className="space-y-2" data-testid="teppan-record">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-bold">これまでの成績</h2>
            <span className="text-xs text-muted-foreground">{data?.record.from ? `${hdLabel(data.record.from)}から・1点1,000円で計算` : ""}</span>
          </div>
          {isLoading || !t ? <Skeleton className="h-24 w-full rounded-xl" /> : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="的中率" value={`${t.n ? Math.round((t.hit / t.n) * 100) : 0}%`} sub={`${t.hit}/${t.n}レース`} />
                <Stat label="回収率" value={`${Math.round(roi * 100)}%`} tone={roi >= 1 ? "good" : "bad"} />
                <Stat label="収支" value={`${ret - inv >= 0 ? "+" : ""}${yen(ret - inv)}`} tone={ret - inv >= 0 ? "good" : "bad"} />
                <Stat label="購入 / 払戻" value={yen(inv)} sub={`払戻 ${yen(ret)}`} />
              </div>
              <p className="text-[11px] text-muted-foreground">朝に確定した予想を、締切前の予想だけで集計しています。過去の成績は今後の的中や利益を約束するものではありません。</p>
            </>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-bold">本日の鉄板{data ? `（${hdLabel(data.hd)}）` : ""}</h2>
            <span className="text-xs text-muted-foreground">{data?.createdAt ? `朝の予想確定 ${jstHm(data.createdAt)}` : ""}</span>
          </div>
          {isLoading ? <Skeleton className="h-40 w-full rounded-2xl" /> : data && data.races.length === 0 ? (
            <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="teppan-none">本日は条件に合うレースがありません。<br />自信が持てない日は見送ります。</div>
          ) : (
            <div className="space-y-3">
              {live.map((r) => <RaceCard key={`${r.jcd}-${r.rno}`} r={r} hd={data!.hd} live />)}
              {done.length > 0 && <div className="pt-1 text-xs font-semibold text-muted-foreground">終わったレース</div>}
              {done.map((r) => <RaceCard key={`${r.jcd}-${r.rno}`} r={r} hd={data!.hd} />)}
            </div>
          )}
        </section>

        {data && data.recentHits.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-base font-bold">最近の的中</h2>
            <div className="divide-y rounded-2xl border bg-card">
              {data.recentHits.map((h) => (
                <div key={`${h.hd}-${h.jcd}-${h.rno}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="num w-10 text-xs text-muted-foreground">{hdLabel(h.hd)}</span>
                  <span className="whitespace-nowrap font-semibold">{h.venue} {h.rno}R</span>
                  <ComboView combo={h.result?.trifecta ?? ""} small />
                  <span className="num ml-auto whitespace-nowrap font-semibold text-[hsl(var(--chart-2))]">{yen((h.result?.trifectaPay ?? 0) * UNIT)}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">1点1,000円で買った場合の払戻です。外れたレースは下の日別成績に全部載っています。</p>
          </section>
        )}

        {days.length > 0 && (
          <section className="space-y-2" data-testid="teppan-days">
            <h2 className="text-base font-bold">日別の成績（外れも全部）</h2>
            <div className="overflow-hidden rounded-2xl border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left font-medium">日付</th><th className="px-2 py-2 text-right font-medium">的中</th><th className="px-2 py-2 text-right font-medium">購入</th><th className="px-3 py-2 text-right font-medium">収支</th></tr>
                </thead>
                <tbody className="divide-y">
                  {days.map((d) => { const p = (d.ret - d.inv) * UNIT; return (
                    <tr key={d.hd}>
                      <td className="num px-3 py-2">{hdLabel(d.hd)}</td>
                      <td className="num px-2 py-2 text-right">{d.hit}/{d.n}</td>
                      <td className="num px-2 py-2 text-right text-muted-foreground">{yen(d.inv * UNIT)}</td>
                      <td className={cn("num px-3 py-2 text-right font-semibold", p >= 0 ? "text-[hsl(var(--chart-2))]" : "text-destructive")}>{p >= 0 ? "+" : ""}{yen(p)}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="grid gap-2 sm:grid-cols-3">
          {[
            { icon: Clock, h: "朝に確定", b: "予想は朝に決まり、締切まで変えません。確定時刻も表示しています。" },
            { icon: ListChecks, h: "外れも公開", b: "都合のいいレースだけ見せることはしません。全レースの結果を載せています。" },
            { icon: ShieldCheck, h: "出さない日もある", b: "AIの自信が足りない日は、無理に予想を出しません。" },
          ].map((x) => (
            <div key={x.h} className="rounded-xl border bg-card p-3">
              <x.icon className="h-4 w-4 text-primary" />
              <div className="mt-1 text-sm font-semibold">{x.h}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{x.b}</div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground"><TriangleAlert className="h-4 w-4" />ご利用の前に</div>
          <ul className="list-disc space-y-1 pl-4">
            <li>この予想は情報の提供です。的中や利益を約束するものではありません。</li>
            <li>舟券の購入はご自身の判断と責任で行ってください。当方が舟券の購入を代わりに行うことはありません。</li>
            <li>20歳未満の方、学生・生徒の方は舟券を購入できません。</li>
            <li>無理のない金額で楽しんでください。</li>
          </ul>
        </section>

        <div className="text-center text-xs text-muted-foreground"><Link href="/" className="underline">競艇AIラボのアプリへ</Link></div>
      </main>
    </div>
  );
}
