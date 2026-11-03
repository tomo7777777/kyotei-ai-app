import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Info } from "lucide-react";
import { SectionTitle } from "@/components/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Metric = { name: string; ll3: number; llwin: number; hit5: number; fav_win: number };
type Strat = { bets?: number; stake: number; ret: number; roi: number | null };
type Section = {
  races: number;
  metrics: Metric[];
  strategies: Record<string, Strat>;
  buckets: Record<string, { races: number; hit: number; stake: number; ret: number; favwin: number }>;
};
type Report = { dates: string[]; oos: Section; trainRaces: number; trainFrom: string; trainTo: string; nFeatures: number; importance: { label: string; share: number }[]; betting?: Betting; evChoice?: EvChoice; live?: LiveEval | null; manshu?: ManshuSum | null; liveLog?: { days: string[]; races: number } };
type ManshuSum = { races: number; months: string[]; tiers: { name: string; races: number; roi: number; lo: number; hi: number; hit: number; medianPay: number; manHit: number; monthly: Record<string, number> }[] };
function ManshuSumView({ m }: { m: ManshuSum }) {
  const pct0 = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <section className="rounded-xl border bg-card p-4" data-testid="card-manshu-sum">
      <h2 className="font-bold">万舟狙い（10点）の検証</h2>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{m.races.toLocaleString()}レース（{parseInt(m.months[0].slice(4))}月〜{parseInt(m.months[m.months.length - 1].slice(4))}月）。各月はそれより前のデータだけで学習したAIで予想。配当の推定と荒れ専用AIも過去データだけで学習したモデルを使っています。万舟Sは上位3%、万舟Aは上位3〜6%。カッコ内は90%信頼区間。</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-muted-foreground"><tr className="border-b"><th className="pb-1.5 text-left font-medium">対象</th><th className="pb-1.5 text-right font-medium">レース数</th><th className="pb-1.5 text-right font-medium">的中率</th><th className="hidden pb-1.5 text-right font-medium sm:table-cell">的中時の配当（中央値）</th><th className="pb-1.5 text-right font-medium">回収率</th></tr></thead>
          <tbody>
            {m.tiers.map((t) => (
              <tr key={t.name} className="border-b border-border/60 last:border-0">
                <td className="py-1.5">{t.name}</td>
                <td className="num py-1.5 text-right text-xs">{t.races.toLocaleString()}</td>
                <td className="num py-1.5 text-right text-xs">{pct0(t.hit)}</td>
                <td className="num hidden py-1.5 text-right text-xs sm:table-cell">{Math.round(t.medianPay).toLocaleString()}円</td>
                <td className={cn("num py-1.5 text-right font-semibold", t.roi >= 1 && "text-[hsl(var(--chart-2))]")}>{pct0(t.roi)}<span className="ml-1 text-[10px] font-normal text-muted-foreground">({pct0(t.lo)}〜{pct0(t.hi)})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">万舟Sは平均で100%前後ですが、信頼区間が広く、プラスとは言い切れません。荒れ専用AIが万舟を見分ける力（AUC）は0.59で、まだ高くありません。</p>
    </section>
  );
}
type EvRes = { bets: number; roi: number; hit: number; lo: number; hi: number };
type EvChoice = { races: number; from_: string; to: string; split: string; rules: { key: string; label: string; A: EvRes; B: EvRes; all: EvRes }[] };
type LiveR = Record<string, { bets: number; roi: number | null; hits: number }>;
type LiveEval = { races: number; days: string[]; rules: LiveR; stages?: Record<string, LiveR> };

function EvView({ e, live, log }: { e: EvChoice; live?: LiveEval | null; manshu?: ManshuSum | null; log?: { days: string[]; races: number } }) {
  const pct0 = (x: number) => `${Math.round(x * 100)}%`;
  const md = (d: string) => `${parseInt(d.slice(4, 6))}/${parseInt(d.slice(6, 8))}`;
  return (
    <section className="rounded-xl border bg-card p-4" data-testid="card-ev">
      <h2 className="font-bold">オッズのゆがみを狙う買い方</h2>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        {e.races.toLocaleString()}レース（{md(e.from_)}〜{md(e.to)}）の確定オッズで検証。条件は前半（〜{md(e.split)}）で決め、後半でも通用するか確認しました。カッコ内は90%信頼区間です。
      </p>
      <div className="space-y-2">
        {e.rules.filter((r) => r.key !== "tan_ai").map((r) => (
          <div key={r.key} className="rounded-lg border p-3">
            <div className="text-sm font-medium">{r.label}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              {(["A", "B", "all"] as const).map((k) => (
                <div key={k}>
                  <div className="text-[10px] text-muted-foreground">{k === "A" ? "前半" : k === "B" ? "後半" : "全期間"}（{r[k].bets}点）</div>
                  <div className="num text-lg font-bold text-[hsl(var(--chart-2))]">{pct0(r[k].roi)}</div>
                  <div className="num text-[10px] text-muted-foreground">{pct0(r[k].lo)}〜{pct0(r[k].hi)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">
        <div className="mb-1 font-semibold">購入時点（締切約5分前）のオッズでの検証：記録中</div>
        <p className="text-muted-foreground">
          記録済み {log?.races ?? 0}レース{live && live.races > 0 ? `、結果照合済み ${live.races}レース` : ""}。締切10分前・5分前・2分前の3時点で記録し、どの時点で買うのが良いかを比べています。
          {live?.stages && Object.entries(live.stages).sort((a, b) => Number(b[0]) - Number(a[0])).map(([st, r]) => (
            <span key={st} className="block" data-testid={`live-stage-${st}`}>{st}分前：単勝 {r.tan?.bets ?? 0}点・回収率 {r.tan?.roi != null ? pct0(r.tan.roi) : "—"}／2連複 {r.qu?.bets ?? 0}点・回収率 {r.qu?.roi != null ? pct0(r.qu.roi) : "—"}</span>
          ))}
          単勝は締切直前に大口の投票でオッズが大きく動くことがあり、確定オッズでの好成績が購入時点でも再現するかは、数千レース分の記録がたまるまで判断できません。
        </p>
      </div>
    </section>
  );
}
type Res = { races: number; roi: number; hit: number };
type Betting = { races: number; months: string[]; strategies: Record<string, { label: string; k: number; res: { A: Res; B: Res; all: Res } }>; pop1: Record<string, { A: number; B: number }> };

function BettingView({ b }: { b: Betting }) {
  const order = ["tan_non1", "tan_top", "tan_1", "q2_conf", "q_top", "ex_top", "tf_top", "t_top", "t_top5"];
  const pct0 = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <section className="rounded-xl border bg-card p-4" data-testid="card-betting">
      <h2 className="font-bold">券種別の回収率（実際の払戻金で検証）</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {b.races.toLocaleString()}レース（{parseInt(b.months[0].slice(4))}月〜{parseInt(b.months[b.months.length - 1].slice(4))}月）。各月はそれより前のデータだけで学習したAIで予想しています。前半（6〜7月）と後半（8月〜）の両方で数字が安定しているかを確認しています。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-muted-foreground">
            <tr className="border-b"><th className="pb-1.5 text-left font-medium">買い方（1レース100円×点数）</th><th className="hidden pb-1.5 text-right font-medium sm:table-cell">レース数</th><th className="pb-1.5 text-right font-medium">的中率</th><th className="hidden pb-1.5 text-right font-medium sm:table-cell">前半</th><th className="hidden pb-1.5 text-right font-medium sm:table-cell">後半</th><th className="pb-1.5 text-right font-medium">回収率</th></tr>
          </thead>
          <tbody>
            {order.filter((k) => b.strategies[k]).map((k) => {
              const s = b.strategies[k]; const best = k === "tan_non1";
              return (
                <tr key={k} className={cn("border-b border-border/60 last:border-0", best && "bg-[hsl(var(--chart-2)/0.08)]")}>
                  <td className="py-1.5">{s.label}{best && <span className="ml-1.5 whitespace-nowrap rounded bg-[hsl(var(--chart-2)/0.15)] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--chart-2))]">最も高い</span>}</td>
                  <td className="num hidden py-1.5 text-right text-xs sm:table-cell">{s.res.all.races.toLocaleString()}</td>
                  <td className="num py-1.5 text-right text-xs">{pct0(s.res.all.hit)}</td>
                  <td className="num hidden py-1.5 text-right text-xs text-muted-foreground sm:table-cell">{pct0(s.res.A.roi)}</td>
                  <td className="num hidden py-1.5 text-right text-xs text-muted-foreground sm:table-cell">{pct0(s.res.B.roi)}</td>
                  <td className={cn("num py-1.5 text-right font-semibold", s.res.all.roi >= 0.95 && "text-[hsl(var(--chart-2))]")}>{pct0(s.res.all.roi)}</td>
                </tr>
              );
            })}
            {Object.entries(b.pop1).map(([bt, v]) => (
              <tr key={bt} className="border-b border-border/60 text-muted-foreground last:border-0">
                <td className="py-1.5">比較：{bt} 1番人気を毎回</td><td className="num hidden py-1.5 text-right text-xs sm:table-cell">{b.races.toLocaleString()}</td><td className="py-1.5 text-right text-xs">—</td>
                <td className="num hidden py-1.5 text-right text-xs sm:table-cell">{pct0(v.A)}</td><td className="num hidden py-1.5 text-right text-xs sm:table-cell">{pct0(v.B)}</td><td className="num py-1.5 text-right">{pct0((v.A + v.B) / 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">AIの本命は、どの券種でも1番人気より回収率が高くなりました。中でも「AIの本命が1号艇以外のときの単勝」が約97%で最も高く、前半・後半とも安定しています。ただし100%は超えていないため、長く続けるとわずかにマイナスになる計算です。</p>
    </section>
  );
}
const STRAT_LABEL: Record<string, string> = { top5_all: "全レースで推奨5点", top1_all: "全レースで推奨1点目のみ", value: "妙味の買い目（最大3点）" };

const fmtDate = (d: string) => `${parseInt(d.slice(4, 6))}/${parseInt(d.slice(6, 8))}`;
const roiCls = (r: number | null) => (r === null ? "" : r >= 1 ? "text-[hsl(var(--chart-2))] font-bold" : "text-muted-foreground");

export default function BacktestPage() {
  const { data, isLoading, error } = useQuery<Report>({ queryKey: ["/api/backtest"] });
  return (
    <div className="space-y-5">
      <SectionTitle sub="過去1年分の公式データでAIを学習し、学習に使っていないレースで予想精度と回収率を検証しました。">
        <span className="inline-flex items-center gap-1.5"><FlaskConical className="h-4 w-4" />AI検証</span>
      </SectionTitle>
      {isLoading ? <Skeleton className="h-64 rounded-xl" /> : error || !data ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">検証データはまだありません。</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Box label="学習レース" value={`${data.trainRaces.toLocaleString()}`} />
            <Box label="学習期間" value={`${data.trainFrom.slice(2, 4)}/${parseInt(data.trainFrom.slice(4, 6))}〜${data.trainTo.slice(2, 4)}/${parseInt(data.trainTo.slice(4, 6))}`} />
            <Box label="AIが見る要素" value={`${data.nFeatures}項目`} />
            <Box label={`検証（${fmtDate(data.dates[0])}〜${fmtDate(data.dates[data.dates.length - 1])}）`} value={`${data.oos.races}レース`} />
          </div>
          <section className="rounded-xl border bg-card p-4 text-sm leading-relaxed" data-testid="card-summary">
            <h2 className="mb-1 font-bold">結論</h2>
            <p>1着・2着・3着を順番に予測するAIに改良し、オッズと組み合わせた予想は確定オッズをわずかに上回る精度になりました。回収率では、AIの本命はどの券種でも1番人気より高く、単勝で約93%、本命が1号艇以外の単勝で約97%でした（1番人気を買い続けた場合は約75%）。AIの本命をそのまま買う方法では100%を超えていません。一方、AIの確率に比べてオッズが高すぎる買い目（オッズのゆがみ）だけを買うと確定オッズでは100%を大きく超えましたが、購入時点のオッズで再現するかは記録して検証中です。</p>
          </section>
          <Headline s={data.oos} />
          <SectionView s={data.oos} />
          {data.manshu && <ManshuSumView m={data.manshu} />}
          {data.evChoice && <EvView e={data.evChoice} live={data.live} log={data.liveLog} />}
          {data.betting && <BettingView b={data.betting} />}
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-bold">AIが重視している要素</h2>
            <p className="mb-3 text-xs text-muted-foreground">機械学習モデルが予想に使っている度合い（上位12項目）。</p>
            <div className="space-y-1.5">
              {data.importance.slice(0, 12).map((f) => (
                <div key={f.label} className="flex items-center gap-2 text-sm">
                  <span className="w-36 shrink-0 truncate text-xs sm:w-44 sm:text-sm">{f.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (f.share / data.importance[0].share) * 100)}%` }} /></div>
                  <span className="num w-12 text-right text-xs">{(f.share * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </section>
          <section className="flex gap-2 rounded-xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>競艇は控除率が約25%あるため、どんな買い方でも長期の回収率は75%前後に近づくのが普通です。回収率は確定オッズで計算しています。実際の購入時点のオッズとは異なるため、実際の成績はこれより下がる可能性があります。学習には公式の競走成績・番組表データを使い、各レース時点より前の情報だけで特徴量を作っています（未来の情報は使っていません）。</p>
          </section>
        </>
      )}
    </div>
  );
}

function SectionView({ s }: { s: Section }) {
  const best = Math.min(...s.metrics.map((x) => x.ll3));
  const bestW = Math.min(...s.metrics.map((x) => x.llwin));
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-bold">予想精度（{s.races}レース）</h2>
        <p className="mb-3 text-xs text-muted-foreground">対数損失は小さいほど確率が正確です。オッズ（市場）は非常に強い基準で、これを下回れば市場より正確ということになります。</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b">
              <th className="p-2 text-left font-medium">予想方法</th><th className="p-2 text-right font-medium">3連単 対数損失</th><th className="p-2 text-right font-medium">1着 対数損失</th><th className="p-2 text-right font-medium">本命1着率</th><th className="p-2 text-right font-medium">上位5点 的中率</th>
            </tr></thead>
            <tbody>
              {s.metrics.map((m) => (
                <tr key={m.name} className="border-b border-border/50 last:border-0">
                  <td className="p-2">{m.name}</td>
                  <td className={cn("num p-2 text-right", m.ll3 === best && "font-bold text-primary")}>{m.ll3.toFixed(3)}</td>
                  <td className={cn("num p-2 text-right", m.llwin === bestW && "font-bold text-primary")}>{m.llwin.toFixed(3)}</td>
                  <td className="num p-2 text-right">{(m.fav_win * 100).toFixed(1)}%</td>
                  <td className="num p-2 text-right">{(m.hit5 * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-bold">AI自信度別の成績（推奨5点・各100円）</h2>
        <p className="mb-3 text-xs text-muted-foreground">自信度が高いほど本命が勝ち、推奨が当たる割合が上がっているかを確認します。</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(s.buckets).map(([k, b]) => (
            <div key={k} className="rounded-lg border p-3" data-testid={`bucket-${k}`}>
              <div className="text-xs text-muted-foreground">自信度 {k}</div>
              <div className="num mt-1 text-sm">{b.races}レース</div>
              <div className="num text-sm">本命1着 {b.races ? ((b.favwin / b.races) * 100).toFixed(0) : "—"}%</div>
              <div className="num text-sm">的中 {b.hit}/{b.races}</div>
              <div className={cn("num text-base", roiCls(b.stake ? b.ret / b.stake : null))}>回収率 {b.stake ? Math.round((b.ret / b.stake) * 100) : "—"}%</div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-bold">買い方別の回収率</h2>
        <p className="mb-3 text-xs text-muted-foreground">すべて100円ずつ買った場合です。</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="p-2 text-left font-medium">買い方</th><th className="hidden p-2 text-right font-medium sm:table-cell">点数</th><th className="p-2 text-right font-medium">投資</th><th className="p-2 text-right font-medium">払戻</th><th className="p-2 text-right font-medium">回収率</th></tr></thead>
            <tbody>
              {Object.entries(s.strategies).map(([k, st]) => (
                <tr key={k} className="border-b border-border/50 last:border-0">
                  <td className="p-2 text-xs sm:text-sm">{STRAT_LABEL[k] ?? k}</td>
                  <td className="num hidden p-2 text-right sm:table-cell">{st.bets ?? "—"}</td>
                  <td className="num whitespace-nowrap p-2 text-right">{st.stake.toLocaleString()}円</td>
                  <td className="num whitespace-nowrap p-2 text-right">{st.ret.toLocaleString()}円</td>
                  <td className={cn("num p-2 text-right", roiCls(st.roi))}>{st.roi === null ? "—" : `${Math.round(st.roi * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Headline({ s }: { s: Section }) {
  const b = s.buckets["75以上"];
  if (!b || !b.races) return null;
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="card-headline">
      <div className="text-xs font-medium text-primary">自信度75以上のレース（{b.races}レース）</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div><div className="text-xs text-muted-foreground">本命1着率</div><div className="num text-xl font-bold">{Math.round((b.favwin / b.races) * 100)}%</div></div>
        <div><div className="text-xs text-muted-foreground">推奨5点 的中率</div><div className="num text-xl font-bold">{Math.round((b.hit / b.races) * 100)}%</div></div>
        <div><div className="text-xs text-muted-foreground">回収率</div><div className={cn("num text-xl font-bold", roiCls(b.ret / b.stake))}>{Math.round((b.ret / b.stake) * 100)}%</div></div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">自信度が高いレースほど本命が勝つ割合が上がっています。AI予想タブは、この自信度が高いレースから順に選んでいます。</p>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="num mt-0.5 font-bold">{value}</div></div>;
}
