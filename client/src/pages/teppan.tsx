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
type MRec = { jcd: string; venue: string; rno: number; deadline: string | null; pman: number; at: string; buy: { combo: string; odds: number; p: number }[]; result?: { trifecta: string | null; trifectaPay: number | null } | null };
type MStat = { n: number; hit: number; pts: number; inv: number; ret: number };
type MResp = { hd: string; th: number; min: number; n: number; judged: number; races: MRec[]; today: MStat; all: { days: ({ hd: string } & MStat)[]; total: MStat } };
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

function NeraiCard({ r, hd }: { r: MRec; hd: string }) {
  const tri = r.result?.trifecta; const hit = !!tri && r.buy.some((b) => b.combo === tri);
  const left = toM(r.deadline) - nowHm();
  return (
    <div className={cn("rounded-2xl border bg-card p-4", hit && "border-[hsl(var(--chart-2))]")} data-testid={`nerai-${r.jcd}-${r.rno}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold">{r.venue} {r.rno}R</span>
        <span className="num text-sm text-muted-foreground">締切 {r.deadline ?? "—"}</span>
        <span className="ml-auto text-xs">
          {tri ? (hit ? <span className="rounded-full bg-[hsl(var(--chart-2)/0.15)] px-2 py-0.5 font-bold text-[hsl(var(--chart-2))]">的中</span> : <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">不的中</span>)
            : left > 0 ? <span className="num rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">あと{left >= 60 ? `${Math.floor(left / 60)}時間${left % 60}分` : `${left}分`}</span> : <span className="text-muted-foreground">結果待ち</span>}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">3連単{r.buy.length}点・{Math.round(Math.min(...r.buy.map((b) => b.odds)))}倍以上</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {r.buy.map((b) => (
          <span key={b.combo} className={cn("flex items-center gap-1 rounded-md border px-1 py-0.5", tri === b.combo && "border-[hsl(var(--chart-2))] bg-[hsl(var(--chart-2)/0.12)]")}>
            <ComboView combo={b.combo} small /><span className="num text-[10px] text-muted-foreground">{Math.round(b.odds)}倍</span>
          </span>
        ))}
      </div>
      {tri ? <div className="mt-2 text-xs text-muted-foreground">結果 <span className="num font-semibold text-foreground">{tri}</span>{r.result?.trifectaPay ? <>（3連単 {r.result.trifectaPay.toLocaleString()}円）{hit ? <span className="ml-1 font-semibold text-[hsl(var(--chart-2))]">1点1,000円で{yen(r.result.trifectaPay * UNIT)}</span> : null}</> : null}</div> : null}
      <div className="mt-2 text-[10px] text-muted-foreground">発表 {jstHm(r.at)}<Link href={`/race/${hd}/${r.jcd}/${r.rno}`} className="ml-2 underline">レース詳細</Link></div>
    </div>
  );
}

function NeraiSection() {
  const { data, isLoading } = useQuery<MResp>({ queryKey: ["/api/manshu"], refetchInterval: 60_000 });
  const t = data?.all.total; const inv = (t?.inv ?? 0) * UNIT, ret = (t?.ret ?? 0) * UNIT; const roi = inv ? ret / inv : 0;
  const xs = data?.races ?? []; const live = xs.filter((r) => !r.result?.trifecta); const done = xs.filter((r) => r.result?.trifecta).reverse();
  return (
    <section className="space-y-3" data-testid="nerai">
      <div>
        <div className="flex items-baseline gap-2"><span className="rounded-md bg-[hsl(var(--chart-4)/0.15)] px-2 py-0.5 text-xs font-bold text-[hsl(var(--chart-4))]">狙い</span><h2 className="text-base font-bold">中穴〜万舟を20点で</h2></div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">50倍以上の目が来そうだとAIが強く見ているレースだけ（1日4〜5レースほど）、50倍以上の3連単をAIの確率順に20点。締切8分前のオッズで決めて発表し、そのあと変えません。</p>
      </div>
      {t && t.n > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="的中率" value={`${Math.round((t.hit / t.n) * 100)}%`} sub={`${t.hit}/${t.n}レース`} />
          <Stat label="回収率" value={`${Math.round(roi * 100)}%`} tone={roi >= 1 ? "good" : "bad"} />
          <Stat label="収支" value={`${ret - inv >= 0 ? "+" : ""}${yen(ret - inv)}`} tone={ret - inv >= 0 ? "good" : "bad"} />
          <Stat label="購入 / 払戻" value={yen(inv)} sub={`払戻 ${yen(ret)}`} />
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-3 text-xs leading-relaxed text-muted-foreground">11/11から記録を始めます。参考までに、過去（6〜10月・約2万レース）の検証では的中率22%・回収率106%でした（実際の成績ではありません）。</div>
      )}
      {isLoading ? <Skeleton className="h-28 w-full rounded-2xl" /> : xs.length === 0 ? (
        <div className="rounded-2xl border bg-card p-5 text-center text-sm text-muted-foreground">締切8分前に判定し、対象になったレースだけここに出ます。{data ? `本日はここまで${data.judged}レースを判定し、対象は0レースです。` : ""}</div>
      ) : (
        <div className="space-y-3">
          {live.map((r) => <NeraiCard key={`${r.jcd}-${r.rno}`} r={r} hd={data!.hd} />)}
          {done.length > 0 && <div className="pt-1 text-xs font-semibold text-muted-foreground">終わったレース</div>}
          {done.map((r) => <NeraiCard key={`${r.jcd}-${r.rno}`} r={r} hd={data!.hd} />)}
        </div>
      )}
    </section>
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
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">本日の勝負レース</span>
          <button onClick={() => setDark(!dark)} className="ml-auto rounded-lg p-2 hover:bg-muted" aria-label="表示切替" data-testid="teppan-theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-16 pt-6">
        <section>
          <div className="text-xs font-semibold text-primary">現在 無料公開中</div>
          <h1 className="mt-1 text-2xl font-bold leading-snug">本日の勝負レース</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            全国のレースをAIが分析し、自信のあるレースだけを出します。少ない点数で堅く取る「本命」と、点数をかけて高配当を取りにいく「狙い」の2本立てです。予想は決めたあと変えず、外れも含めて全部の成績を載せています。
          </p>
        </section>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <a href="#honmei" onClick={(e) => { e.preventDefault(); document.getElementById("honmei")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-xl border bg-card p-3"><div className="font-bold text-primary">本命</div><div className="mt-0.5 text-muted-foreground">1日2〜4R・1〜2点・朝に確定{data ? `・本日${data.races.length}R` : ""}</div></a>
          <a href="#nerai" onClick={(e) => { e.preventDefault(); document.getElementById("nerai")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-xl border bg-card p-3"><div className="font-bold text-[hsl(var(--chart-4))]">狙い</div><div className="mt-0.5 text-muted-foreground">1日4〜5R・20点・締切8分前に発表</div></a>
        </div>

        <section id="honmei" className="space-y-2 scroll-mt-16" data-testid="teppan-record">
          <div className="flex items-baseline gap-2"><span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">本命</span><h2 className="text-base font-bold">堅いレースを1〜2点で</h2></div>
          <p className="text-xs leading-relaxed text-muted-foreground">AIの自信度が90以上のレースから、当たる確率が20%以上ある3連単だけ。対象がない日は無理に出しません。朝に確定し、あとから変えません。</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-bold">本命のこれまでの成績</h3>
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
            <h3 className="text-sm font-bold">本日の本命{data ? `（${hdLabel(data.hd)}）` : ""}</h3>
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
            <h3 className="text-sm font-bold">本命の最近の的中</h3>
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
            <h3 className="text-sm font-bold">本命の日別の成績（外れも全部）</h3>
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

        <div id="nerai" className="scroll-mt-16 border-t pt-6"><NeraiSection /></div>

        <section className="grid gap-2 sm:grid-cols-3">
          {[
            { icon: Clock, h: "決めたら変えない", b: "本命は朝、狙いは締切8分前に決まり、そのあと変えません。決めた時刻も表示しています。" },
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
