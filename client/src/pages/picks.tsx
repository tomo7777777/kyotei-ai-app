import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { RefreshCw, Clock, ChevronRight, ChevronDown, Trophy, Info, AlertTriangle, Bell } from "lucide-react";
import { STATIC } from "@/lib/staticApi";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PicksResponse, PickSummary, PlanItem, ExEvResp, ExStat } from "@/lib/types";
import { ManshuCard, FormLine, BetTips, DistortionList, Boat, ComboView, ConfidenceMeter, EvBadge, SectionTitle, pct } from "@/components/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function PickCard({ p, rank }: { p: PickSummary; rank: number }) {
  const sorted = [...p.entries].sort((a, b) => b.winProb - a.winProb);
  return (
    <article className="fade-in rounded-xl border bg-card p-4 md:p-5" data-testid={`card-pick-${p.jcd}-${p.rno}`}>
      <div className="flex items-start gap-4">
        <div className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{rank}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-lg font-bold">{p.venue} {p.rno}R</h3>
            <span className="truncate text-sm text-muted-foreground">{p.raceTitle}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> 締切 <span className="num">{p.deadline}</span>
            {!p.beforeAvailable && <span className="ml-2">（展示前）</span>}
          </div>
        </div>
        <ConfidenceMeter value={p.confidence} label={p.confidenceLabel} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="mb-1.5 text-xs font-semibold text-muted-foreground">印と1着確率</div>
          <ul className="space-y-1">
            {sorted.slice(0, 4).map((e) => (
              <li key={e.lane} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-center font-bold">{e.mark}</span>
                <Boat n={e.lane} small />
                <span className="min-w-0 flex-1 truncate">{e.name} <span className="text-xs text-muted-foreground">{e.cls}</span></span>
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, e.winProb * 100)}%` }} />
                </div>
                <span className="num w-12 text-right text-xs">{pct(e.winProb, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <DistortionList items={p.distortions} compact />
          <BetTips tips={p.betTips} compact />
          <div>
          <div className="mb-1.5 text-xs font-semibold text-muted-foreground">AI推奨 3連単</div>
          <table className="w-full text-sm">
            <thead className="text-[10px] text-muted-foreground">
              <tr><th className="pb-1 text-left font-medium">買い目</th><th className="pb-1 text-right font-medium">AI確率</th><th className="pb-1 text-right font-medium">オッズ</th><th className="pb-1 text-right font-medium">期待値</th></tr>
            </thead>
            <tbody>
              {p.main.slice(0, 5).map((c) => (
                <tr key={c.combo} className="border-b border-border/60 last:border-0">
                  <td className="py-1"><ComboView combo={c.combo} small /></td>
                  <td className="num py-1 text-right text-xs text-muted-foreground">{pct(c.prob)}</td>
                  <td className="num py-1 text-right">{c.odds ? `${c.odds.toFixed(1)}倍` : "—"}</td>
                  <td className="py-1 text-right"><EvBadge ev={c.ev} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.value.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[hsl(var(--chart-2))]">妙味</span>
              {p.value.map((v) => (
                <span key={v.combo} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5">
                  <ComboView combo={v.combo} small /> <span className="num">{v.odds?.toFixed(1)}倍</span> <EvBadge ev={v.ev} />
                </span>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-1 rounded-lg bg-muted/60 p-3 text-sm leading-relaxed">
        {p.comment.map((c, i) => <p key={i}>{c}</p>)}
      </div>
      <div className="mt-3 flex justify-end">
        <Link href={`/race/${p.hd}/${p.jcd}/${p.rno}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary" data-testid={`link-pick-detail-${p.jcd}-${p.rno}`}>
          詳しい分析と期待値 <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

// 本命狙い（的中率重視）: 単勝◎1点 + 2連複 上位3点
function honBets(p: PickSummary) {
  if (p.hon) return p.hon;
  const fav = [...p.entries].sort((a, b) => b.winProb - a.winProb)[0];
  const q = new Map<string, number>();
  for (const c of p.main) { const k = c.combo.split("-").slice(0, 2).map(Number).sort().join("-"); q.set(k, (q.get(k) ?? 0) + c.prob); }
  return { fav: fav?.lane ?? 1, favProb: fav?.winProb ?? 0, qu: Array.from(q.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([combo, prob]) => ({ combo, prob })) };
}
const quOf = (r?: PlanItem["result"]) => r?.quinella ?? (r?.order?.length && r.order.length >= 2 ? [r.order[0], r.order[1]].sort().join("-") : null);
const winOf = (r?: PlanItem["result"]) => r?.win ?? r?.order?.[0] ?? null;
function honHit(p: PlanItem) {
  const b = honBets(p); const r = p.result;
  if (!r?.finished) return null;
  const w = winOf(r), q = quOf(r);
  return { win: w === b.fav, qu: !!q && b.qu.some((x) => x.combo === q) };
}

function HonBets({ p, result }: { p: PickSummary; result?: PlanItem["result"] }) {
  const w = result?.finished ? result.trifecta : null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {p.main.slice(0, 5).map((m) => (
        <span key={m.combo} className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5", w === m.combo && "ring-2 ring-[hsl(var(--chart-2))]")}>
          <ComboView combo={m.combo} small /><span className="num text-[10px] text-muted-foreground">{pct(m.prob, 0)}</span>
        </span>
      ))}
    </div>
  );
}

function SRow({ p }: { p: PlanItem }) {
  const fav = p.entries[0];
  return (
    <Link href={`/race/${p.hd}/${p.jcd}/${p.rno}`} className="block rounded-xl border bg-card p-3 hover:border-primary/50" data-testid={`card-s-${p.jcd}-${p.rno}`}>
      <div className="flex items-center gap-2">
        <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">S</span>
        <span className="text-sm font-semibold">{p.venue} {p.rno}R</span>
        <span className="num flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{p.deadline}</span>
        {p.late && <span className="text-[10px] text-muted-foreground">（途中追加）</span>}
        <span className="ml-auto text-right"><span className="num text-lg font-bold">{p.confidence}</span><span className="ml-0.5 text-[10px] text-muted-foreground">自信度</span></span>
      </div>
      {fav && <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">◎<Boat n={fav.lane} small /><span className="text-foreground">{fav.name}</span><span className="num">1着 {pct(fav.winProb, 0)}</span></div>}
      {p.live?.favChanged && p.live.favLane && (
        <div className="mt-1.5 flex items-center gap-1 rounded-md bg-[hsl(var(--chart-4)/0.1)] px-2 py-1 text-xs text-[hsl(var(--chart-4))]" data-testid={`warn-fav-${p.jcd}-${p.rno}`}>
          <AlertTriangle className="h-3.5 w-3.5" />参考：直前の分析では本命が<Boat n={p.live.favLane} small />{p.live.favName}に変わっています（期待度と買い目は朝のまま）
        </div>
      )}
      <HonBets p={p} />
    </Link>
  );
}

function SoonBanner({ items, nowHm, toM }: { items: PlanItem[]; nowHm: number; toM: (t: string | null) => number }) {
  const soon = items.filter((i) => (i.tier === "S" || i.manshu?.tier || i.chuana?.tier) && toM(i.deadline) > nowHm && toM(i.deadline) - nowHm <= 15).sort((a, b) => toM(a.deadline) - toM(b.deadline));
  const [perm, setPerm] = useState<string>(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const notified = useRef(new Set<string>());
  useEffect(() => {
    if (perm !== "granted") return;
    for (const i of soon) {
      const k = `${i.hd}-${i.jcd}-${i.rno}`;
      if (notified.current.has(k)) continue;
      notified.current.add(k);
      try { new Notification(`${i.venue}${i.rno}R まもなく締切（${i.deadline}）`, { body: [i.tier === "S" ? `期待度S 自信度${i.confidence}` : "", i.manshu?.tier ? `万舟${i.manshu.tier}` : "", i.chuana?.tier ? "中穴S" : ""].filter(Boolean).join("・") }); } catch {}
    }
  }, [soon.map((i) => i.jcd + i.rno).join(","), perm]);
  if (!soon.length) return perm === "default" ? (
    <button className="flex items-center gap-1.5 text-xs font-semibold text-primary" data-testid="button-notify"
      onClick={() => { try { Notification.requestPermission().then(setPerm); } catch { setPerm("unsupported"); } }}><Bell className="h-3.5 w-3.5" />注目レースの締切15分前に通知する</button>
  ) : null;
  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="banner-soon">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary"><Bell className="h-4 w-4" />まもなく締切</span>
        {soon.length === 0 && <span className="text-xs text-muted-foreground">15分以内に締切の注目レースはありません</span>}
        {perm === "default" && (
          <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" data-testid="button-notify"
            onClick={() => { try { Notification.requestPermission().then(setPerm); } catch { setPerm("unsupported"); } }}>締切15分前に通知する</Button>
        )}
        {perm === "denied" && <span className="ml-auto text-[10px] text-muted-foreground">通知はブラウザの設定でブロックされています</span>}
      </div>
      {soon.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {soon.map((i) => (
            <Link key={`${i.jcd}-${i.rno}`} href={`/race/${i.hd}/${i.jcd}/${i.rno}`} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm hover:border-primary/50" data-testid={`soon-${i.jcd}-${i.rno}`}>
              <span className="font-semibold">{i.venue}{i.rno}R</span>
              <span className="num text-xs text-muted-foreground">あと{toM(i.deadline) - nowHm}分</span>
              {i.tier === "S" && <span className="rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">S</span>}
              {i.manshu?.tier && <span className="rounded bg-[hsl(var(--chart-4))] px-1 text-[10px] font-bold text-white">万舟{i.manshu.tier}</span>}
              {i.chuana?.tier && <span className="rounded bg-[hsl(var(--chart-3))] px-1 text-[10px] font-bold text-white">中穴S</span>}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function PickChips({ title, picks, win, note }: { title: string; picks: { combo: string; odds: number }[]; win?: string | null; note?: string }) {
  const hit = !!win && picks.some((m) => m.combo === win);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold"><span>{title}</span>
        {win && <span className={cn("rounded px-1 text-[10px]", hit ? "bg-[hsl(var(--chart-2))] text-white" : "bg-muted text-muted-foreground")}>{hit ? "的中" : "不的中"}</span>}
        {note && <span className="font-normal text-muted-foreground">{note}</span>}</div>
      <FormLine combos={picks.map((m) => m.combo)} />
      <div className="flex flex-wrap gap-1">
        {picks.map((m) => (
          <span key={m.combo} className={cn("inline-flex items-center gap-0.5 rounded border px-1 py-0.5", win === m.combo && "border-[hsl(var(--chart-2))] ring-2 ring-[hsl(var(--chart-2))]")}>
            <ComboView combo={m.combo} small /><span className="num text-[10px] text-muted-foreground">{Math.round(m.odds)}倍</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const hitIn = (picks: { combo: string }[] | undefined, win: string | null | undefined) => !!win && !!picks?.some((m) => m.combo === win);

function DoneSpecialRow({ h, isM }: { h: PlanItem; isM: boolean }) {
  const [open, setOpen] = useState(false);
  const win = h.result?.finished ? h.result.trifecta : null;
  const mo = isM ? h.manshu : h.chuana;
  const a5 = !isM ? h.chuana?.alt5 : null;
  const L = isM ? "万舟" : "中穴";
  const tags: { label: string; hit: boolean }[] = [];
  if (mo?.tier) tags.push({ label: `${L}${mo.tier}（${mo.picks.length}点）`, hit: hitIn(mo.picks, win) });
  if (a5?.tier) tags.push({ label: "5点版", hit: hitIn(a5.picks, win) });
  return (
    <div className="border-b last:border-0" data-testid={`row-special-${h.jcd}-${h.rno}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full p-3 text-left hover:bg-accent/40">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{h.venue} {h.rno}R</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs">
            {win ? (<><span className="text-muted-foreground">結果</span><ComboView combo={win} small /><span className="num font-semibold">{h.result!.trifectaPay?.toLocaleString()}円</span></>) : <span className="text-muted-foreground">結果待ち</span>}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
          {tags.map((t) => (
            <span key={t.label} className={cn("rounded px-1.5 py-0.5 font-semibold", !win ? "bg-muted text-muted-foreground" : t.hit ? "bg-[hsl(var(--chart-2))] text-white" : "border text-muted-foreground")}>
              {t.label} {win ? (t.hit ? "的中" : "不的中") : ""}
            </span>
          ))}
        </div>
      </button>
      {open && (
        <div className="space-y-2.5 px-3 pb-3">
          {mo?.tier && <PickChips title={`朝の${mo.picks.length}点（${L}${mo.tier}）`} picks={mo.picks} win={win} note="倍率は朝の推定" />}
          {a5?.tier && <PickChips title="5点版（50倍以上）" picks={a5.picks} win={win} note="倍率は朝の推定" />}
          <Link href={`/race/${h.hd}/${h.jcd}/${h.rno}`} className="inline-flex items-center text-xs font-semibold text-primary">レース画面を開く <ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>
      )}
    </div>
  );
}

// 中穴S と 万舟S/A の両方に選ばれたレース。1号艇以外の1着率上位2艇を頭に、50倍以上からAI確率上位10点
const unionPicks = (i: PlanItem) => {
  const m = new Map<string, { combo: string; odds: number }>();
  for (const x of [...(i.chuana?.picks ?? []), ...(i.manshu?.picks ?? [])]) if (!m.has(x.combo)) m.set(x.combo, { combo: x.combo, odds: x.odds });
  return Array.from(m.values());
};
const bothHeads = (i: PlanItem): { lane: number; prob: number }[] => {
  if (i.chuana?.both?.heads?.length && i.chuana.both.heads.every((h) => h.lane !== 1)) return i.chuana.both.heads;
  // 旧プラン（10/12以前）: 朝の買い目の確率を頭ごとに合計して、1号艇以外の上位2艇を頭にする（1着率は記録なし）
  const sc = new Map<number, number>();
  for (const x of [...(i.chuana?.picks ?? []), ...(i.manshu?.picks ?? [])]) { const h = Number(x.combo.split("-")[0]); if (h !== 1) sc.set(h, (sc.get(h) ?? 0) + (x.prob ?? 0)); }
  return Array.from(sc.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([lane]) => ({ lane, prob: NaN }));
};
const bothPicks = (i: PlanItem) => {
  if (i.chuana?.both?.picks?.length && i.chuana.both.heads.every((h) => h.lane !== 1)) return i.chuana.both.picks;
  const hs = new Set(bothHeads(i).map((h) => h.lane));
  return unionPicks(i).filter((x) => hs.has(Number(x.combo.split("-")[0])));
};
function BothRow({ h, nowHm, toM }: { h: PlanItem; nowHm: number; toM: (t: string | null) => number }) {
  const [open, setOpen] = useState(toM(h.deadline) > nowHm);
  const win = h.result?.finished ? h.result.trifecta : null;
  const u = bothPicks(h); const hit = hitIn(u, win); const heads = bothHeads(h);
  return (
    <div className="border-b last:border-0" data-testid={`row-both-${h.jcd}-${h.rno}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full p-3 text-left hover:bg-accent/40">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{h.venue} {h.rno}R</span><span className="num flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{h.deadline}</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs">
            {win ? (<><ComboView combo={win} small /><span className="num font-semibold">{h.result!.trifectaPay?.toLocaleString()}円</span></>) : <span className="text-muted-foreground">{toM(h.deadline) > nowHm ? "これから" : "結果待ち"}</span>}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
          <span className="rounded bg-[hsl(var(--chart-3))] px-1.5 py-0.5 font-bold text-white">中穴S</span>
          <span className="rounded bg-[hsl(var(--chart-4))] px-1.5 py-0.5 font-bold text-white">万舟{h.manshu?.tier}</span>
          <span className="rounded border px-1.5 py-0.5 text-muted-foreground">{u.length}点（{(u.length * 100).toLocaleString()}円）</span>
          {win && <span className={cn("rounded px-1.5 py-0.5 font-semibold", hit ? "bg-[hsl(var(--chart-2))] text-white" : "border text-muted-foreground")}>{hit ? "的中" : "不的中"}</span>}
        </div>
      </button>
      {open && (
        <div className="space-y-2.5 px-3 pb-3">
          <div className="rounded-md border bg-card p-2" data-testid={`heads-${h.jcd}-${h.rno}`}>
            <div className="mb-1 text-[11px] font-semibold">頭（1着）は1号艇以外の{heads.length}艇</div>
            <div className="flex flex-wrap gap-3">
              {heads.map((x) => (
                <span key={x.lane} className="inline-flex items-center gap-1.5 text-xs"><Boat n={x.lane} small /><span className="text-muted-foreground">1着率</span><span className="num font-bold">{Number.isFinite(x.prob) ? `${Math.round(x.prob * 100)}%` : "記録なし"}</span></span>
              ))}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">1着率＝朝のAIが計算した「その艇が1着になる確率」。1号艇が負けそうなレースを選んでいるので、1号艇以外で1着率が高い2艇を頭にします（1号艇は2・3着には入ります）。</p>
          </div>
          <PickChips title={`買い目 ${u.length}点`} picks={u} win={win} note="倍率は朝の推定" />
          <Link href={`/race/${h.hd}/${h.jcd}/${h.rno}`} className="inline-flex items-center text-xs font-semibold text-primary">レース画面を開く <ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>
      )}
    </div>
  );
}
function BothView({ items, nowHm, toM, loading, madeAt }: { items: PlanItem[]; nowHm: number; toM: (t: string | null) => number; madeAt: string | null; loading: boolean }) {
  const both = items.filter((i) => i.chuana?.tier === "S" && (i.manshu?.tier === "S" || i.manshu?.tier === "A")).sort((a, b) => toM(a.deadline) - toM(b.deadline));
  const up = both.filter((i) => toM(i.deadline) > nowHm); const done = both.filter((i) => toM(i.deadline) <= nowHm).reverse();
  const fin = both.filter((i) => i.result?.finished); const hits = fin.filter((i) => hitIn(bothPicks(i), i.result?.trifecta));
  const inv = fin.reduce((a, i) => a + bothPicks(i).length * 100, 0); const ret = hits.reduce((a, i) => a + (i.result?.trifectaPay ?? 0), 0);
  return (
    <>
      <section>
        <SectionTitle sub={`中穴Sと万舟S/Aの両方に選ばれたレースです。1号艇以外で1着率が高い2艇を頭にして、50倍以上の目からAIの確率が高い順に10点を選びます。${madeAt ? `${madeAt}の朝の分析で確定し、一日を通して変わりません。` : "朝の分析で確定し、一日を通して変わりません。"}`}>中穴×万舟</SectionTitle>
        <div className="mb-3 rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
          朝の条件（進入コースも不明として計算）で過去のレースを検証（1点100円）：両方に選ばれるのは1日4〜5レースほど。1号艇以外の2艇を頭にした10点は的中率16%・回収率85%（以前の中穴＋万舟まとめ買い約17点は83%）。それでも1号艇が1着のレースが約28%あります。倍率は朝の推定値です。利益を保証するものではありません。
        </div>
        <div className="mb-3 rounded-lg border bg-card p-3">
          <div className="text-xs font-semibold">本日の成績（まとめ買い）</div>
          <div className="mt-1 flex items-baseline gap-3 text-sm"><span>的中 <span className="num font-bold">{hits.length}/{fin.length}</span></span><span>回収率 <span className={cn("num font-bold", inv > 0 && ret >= inv && "text-[hsl(var(--chart-2))]")}>{inv ? `${Math.round((ret / inv) * 100)}%` : "—"}</span></span><span className="text-xs text-muted-foreground">購入 {inv.toLocaleString()}円 ／ 払戻 {ret.toLocaleString()}円</span></div>
        </div>
        {loading ? <Skeleton className="h-40 w-full rounded-xl" /> : both.length === 0 ? (
          <div className="rounded-xl border bg-card p-5 text-center text-sm text-muted-foreground">本日は両方に選ばれたレースはありません。</div>
        ) : (
          <>
            {up.length > 0 && <><div className="mb-1.5 text-xs font-semibold text-muted-foreground">これからのレース</div><div className="mb-4 overflow-hidden rounded-xl border bg-card">{up.map((h) => <BothRow key={`${h.jcd}-${h.rno}`} h={h} nowHm={nowHm} toM={toM} />)}</div></>}
            {done.length > 0 && <><div className="mb-1.5 text-xs font-semibold text-muted-foreground">締切後のレース（タップで買い目と結果）</div><div className="overflow-hidden rounded-xl border bg-card">{done.map((h) => <BothRow key={`${h.jcd}-${h.rno}`} h={h} nowHm={nowHm} toM={toM} />)}</div></>}
          </>
        )}
      </section>
    </>
  );
}

function ManshuView({ items, nowHm, toM, loading, madeAt, kind = "manshu" }: { items: PlanItem[]; nowHm: number; toM: (t: string | null) => number; madeAt: string | null; loading: boolean; kind?: "manshu" | "chuana" }) {
  const isM = kind === "manshu";
  const morn = (i: PlanItem) => (isM ? i.manshu : i.chuana);
  const L = isM ? "万舟" : "中穴";
  const byDl = (a: PlanItem, b: PlanItem) => toM(a.deadline) - toM(b.deadline);
  const tiered = items.filter((i) => morn(i)?.tier).sort(byDl);
  const up = tiered.filter((i) => toM(i.deadline) > nowHm);
  const done = items.filter((i) => toM(i.deadline) <= nowHm && (morn(i)?.tier || (!isM && i.chuana?.alt5?.tier))).sort(byDl).reverse();
  const agg = (xs: PlanItem[], picks: (i: PlanItem) => { combo: string }[] | undefined, unit: number) => {
    const f = xs.filter((i) => i.result?.finished); const h = f.filter((i) => hitIn(picks(i), i.result?.trifecta));
    return { n: f.length, hit: h.length, inv: unit > 0 ? f.length * unit : f.reduce((a, i) => a + (picks(i)?.length ?? 0) * 100, 0), ret: h.reduce((a, i) => a + (i.result?.trifectaPay ?? 0), 0) };
  };
  const cards: [string, ReturnType<typeof agg>, string?][] = isM
    ? [["万舟S", agg(tiered.filter((i) => i.manshu!.tier === "S"), (i) => i.manshu?.picks, 0)], ["万舟A", agg(tiered.filter((i) => i.manshu!.tier === "A"), (i) => i.manshu?.picks, 0)]]
    : [["中穴S（10点）", agg(tiered, (i) => i.chuana?.picks, 1000)], ["参考：5点版", agg(items.filter((i) => i.chuana?.alt5?.tier === "S"), (i) => i.chuana?.alt5?.picks, 500), "50倍以上・5点・上位3%（各100円）"]];
  return (
    <>
      <section>
        <SectionTitle sub={`${isM ? "朝専用のAIで波乱を読むレースを選び、1号艇以外の2艇を頭に展開予想で最大20点を組みます。" : "50倍以上の中穴から、AI確率の高い順に10点を選びます。10点のどれかが来る確率が高い上位5%のレースが中穴Sです。"}${madeAt ? `${madeAt}の朝の分析で確定し、一日を通して変わりません。` : "朝の分析で確定し、一日を通して変わりません。"}`}>{isM ? "万舟狙い" : "中穴狙い"}</SectionTitle>
        <div className="mb-3 rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
          {isM
            ? <>買い方：頭は1号艇以外で1着率が高い2艇。2着は展開で決めます（2号艇が頭なら差しで1・3号艇、3〜5号艇が頭ならまくりで外の艇と1号艇の残り、それにAIが選ぶ1艇）。3着は全通りで、その中の推定30倍以上からAI確率の高い順に最大20点。展示タイムや風が分かる前の「朝の条件」で過去約2万レースを検証（1点100円）：<span className="font-semibold text-foreground">万舟S/A</span>（1日約8〜9レース）で的中率25%・回収率86%（前半87%・後半85%）、<span className="font-semibold text-foreground">万舟S</span>だけだと的中率25%・回収率96%。以前の10点（回収率91%）より当たる回数は2倍以上になります。</>
            : <>展示タイムや風が分かる前の「朝の条件」で過去約2万レースを検証（1点100円・10点）：<span className="font-semibold text-foreground">中穴S</span>（上位5%・1日約7〜8レース）は的中率16%・回収率89%（進入コースも朝と同じく不明として計算）。以前の表示（122%）は実際の進入コースを使っていたため高く出ていました。現在、改善方法を検証中です。</>}
          倍率は朝の推定値です。利益を保証するものではありません。
        </div>
        {loading ? <Skeleton className="h-40 w-full rounded-xl" /> : up.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {up.map((p) => (
              <Link key={`${p.jcd}-${p.rno}`} href={`/race/${p.hd}/${p.jcd}/${p.rno}`} className="block space-y-2 rounded-xl border bg-card p-3 hover:border-primary/50" data-testid={`card-${kind}-${p.jcd}-${p.rno}`}>
                <div className="flex items-center gap-2 text-sm"><span className="font-semibold">{p.venue} {p.rno}R</span><span className="num flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{p.deadline}</span></div>
                <ManshuCard m={morn(p)!} compact label={L} title={`${L}狙い ${morn(p)!.picks.length}点（朝の予想）`} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-5 text-center text-sm text-muted-foreground">{tiered.length ? `本日の${L}狙いレースはすべて締切を迎えました。` : `本日これから行われる${L}狙いのレースはありません。`}</div>
        )}
      </section>
      <section>
        <SectionTitle sub={`朝の予想の買い目（各100円）で計算。本日の対象 ${tiered.length}レース。`}><span className="inline-flex items-center gap-1.5"><Trophy className="h-4 w-4" />本日の{L}狙い成績</span></SectionTitle>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {cards.map(([l, x, sub]) => (
            <div key={l} className="rounded-lg border bg-card p-3">
              <div className="text-xs font-semibold">{l}</div>
              {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
              <div className="mt-1 flex items-baseline gap-3 text-sm"><span>的中 <span className="num font-bold">{x.hit}/{x.n}</span></span><span>回収率 <span className={cn("num font-bold", x.inv > 0 && x.ret >= x.inv && "text-[hsl(var(--chart-2))]")}>{x.inv ? `${Math.round((x.ret / x.inv) * 100)}%` : "—"}</span></span></div>
            </div>
          ))}
        </div>
        {done.length > 0 && (
          <>
            <div className="mb-1.5 mt-4 text-xs font-semibold text-muted-foreground">締切後のレース（タップで買い目と結果）</div>
            <div className="overflow-hidden rounded-xl border bg-card">
              {done.map((h) => <DoneSpecialRow key={`${h.jcd}-${h.rno}`} h={h} isM={isM} />)}
            </div>
          </>
        )}
      </section>
    </>
  );
}

function OtherRow({ p }: { p: PlanItem }) {
  const [open, setOpen] = useState(false);
  const fav = p.entries[0];
  return (
    <div className={cn("rounded-lg border bg-card", open && "border-primary/40")} data-testid={`card-other-${p.jcd}-${p.rno}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left" data-testid={`button-other-${p.jcd}-${p.rno}`}>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{p.venue} {p.rno}R <span className="num ml-1 text-xs font-normal text-muted-foreground">{p.deadline}</span>
            {p.chuana?.tier && <span className="ml-1.5 rounded bg-[hsl(var(--chart-3))] px-1 text-[10px] font-bold text-white">中穴S</span>}{p.manshu?.tier && <span className="ml-1.5 rounded bg-[hsl(var(--chart-4))] px-1 text-[10px] font-bold text-white">万舟{p.manshu.tier}</span>}</div>
          {fav && <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">◎<Boat n={fav.lane} small /> {fav.name}</div>}
        </div>
        <span className="text-right"><span className="num text-lg font-bold">{p.confidence}</span><span className="block text-[10px] text-muted-foreground">自信度</span></span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t px-3 pb-3 pt-2 text-xs">
          <div className="space-y-1">
            {p.entries.slice(0, 2).map((e, k) => (
              <div key={e.lane} className="flex items-center gap-1.5"><span className="w-3 text-muted-foreground">{k === 0 ? "◎" : "○"}</span><Boat n={e.lane} small /><span className="text-foreground">{e.name}</span><span className="num ml-auto text-muted-foreground">1着 {pct(e.winProb, 0)}</span></div>
            ))}
          </div>
          {p.live?.favChanged && p.live.favLane && (
            <div className="mt-2 flex items-center gap-1 rounded-md bg-[hsl(var(--chart-4)/0.1)] px-2 py-1 text-[hsl(var(--chart-4))]"><AlertTriangle className="h-3.5 w-3.5" />参考：直前の分析では本命が<Boat n={p.live.favLane} small />に変わっています</div>
          )}
          <div className="mb-0.5 mt-2.5 font-semibold text-muted-foreground">推奨5点（朝の予想）</div>
          <HonBets p={p} />
          {p.comment?.[0] && <p className="mt-2 leading-relaxed text-muted-foreground">{p.comment[0]}</p>}
          <Link href={`/race/${p.hd}/${p.jcd}/${p.rno}`} className="mt-2 inline-flex items-center font-semibold text-primary" data-testid={`link-other-${p.jcd}-${p.rno}`}>レース画面を開く <ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>
      )}
    </div>
  );
}

function DoneRow({ h }: { h: PlanItem }) {
  const r = h.result; const hit = !!r?.finished && h.main.slice(0, 5).some((m) => m.combo === r.trifecta);
  return (
    <Link href={`/race/${h.hd}/${h.jcd}/${h.rno}`} className="block border-b p-3 last:border-0 hover:bg-accent/40" data-testid={`row-result-${h.jcd}-${h.rno}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{h.venue} {h.rno}R</span>
        {h.tier === "S" && <span className="rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">S</span>}
        <span className="whitespace-nowrap text-[11px] text-muted-foreground" data-testid={`conf-${h.jcd}-${h.rno}`}>自信度<span className="num ml-0.5 font-bold text-foreground">{h.confidence}</span></span>
        <span className="ml-auto flex items-center gap-1.5 text-xs">
          {r?.finished ? (<>
            <ComboView combo={r.trifecta!} small />
            <span className={cn("num font-semibold", hit ? "text-[hsl(var(--chart-2))]" : "text-muted-foreground")}>{hit ? `的中 ${((r.trifectaPay ?? 0) * 10).toLocaleString()}円` : "不的中"}</span>
          </>) : <span className="text-muted-foreground">結果待ち</span>}
        </span>
      </div>
      <HonBets p={h} result={r} />
    </Link>
  );
}

type RecDay = { hd: string; n: number; hit: number; inv: number; ret: number };
type RecOut = { from: string | null; days: RecDay[]; total: { n: number; hit: number; inv: number; ret: number }; pending: number };
const useRecords = () => useQuery<{ honS: RecOut; himo: RecOut; honS90?: RecOut; honS90all?: RecOut }>({ queryKey: ["/api/records"], refetchInterval: 300_000 });
function RecordCard({ rec: rec0, title, note, testid, unit = 1 }: { rec?: RecOut; title: string; note: string; testid: string; unit?: number }) {
  const [open, setOpen] = useState(false);
  if (!rec0) return null;
  const mul = <T extends { inv: number; ret: number }>(d: T): T => ({ ...d, inv: d.inv * unit, ret: d.ret * unit });
  const rec = { ...rec0, total: mul(rec0.total), days: rec0.days.map(mul) };
  const t = rec.total; const md = (h: string) => `${parseInt(h.slice(4, 6))}/${parseInt(h.slice(6, 8))}`;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <section className="rounded-xl border bg-card p-3" data-testid={testid}>
      <div className="flex items-baseline gap-2"><h3 className="text-sm font-bold">{title}</h3><span className="text-[11px] text-muted-foreground">{rec.from ? `${md(rec.from)}から` : "記録なし"}</span></div>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
        {[["的中", `${t.hit}/${t.n}`], ["的中率", pct(t.hit, t.n)], ["収支", `${t.ret - t.inv >= 0 ? "+" : ""}${(t.ret - t.inv).toLocaleString()}円`], ["回収率", pct(t.ret, t.inv)]].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-muted/50 p-1.5"><div className="text-[10px] text-muted-foreground">{l}</div><div className={cn("num text-sm font-bold", l === "収支" && (t.ret - t.inv >= 0 ? "text-[hsl(var(--chart-2))]" : "text-destructive"))}>{v}</div></div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">購入 {t.inv.toLocaleString()}円・払戻 {t.ret.toLocaleString()}円。{note}{rec.pending ? `結果を取得中のレースが${rec.pending}件あります。` : ""}</p>
      {rec.days.length > 0 && (<>
        <button onClick={() => setOpen(!open)} className="mt-1 text-xs font-semibold text-primary" data-testid={`${testid}-toggle`}>{open ? "日別を閉じる" : "日別の成績を見る"}</button>
        {open && (
          <div className="mt-1.5 overflow-hidden rounded-lg border text-xs">
            <div className="grid grid-cols-5 bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground"><span>日付</span><span className="text-right">的中</span><span className="text-right">購入</span><span className="text-right">払戻</span><span className="text-right">回収率</span></div>
            {[...rec.days].reverse().map((d) => (
              <div key={d.hd} className="num grid grid-cols-5 border-t px-2 py-1"><span>{md(d.hd)}</span><span className="text-right">{d.hit}/{d.n}</span><span className="text-right">{d.inv.toLocaleString()}</span><span className="text-right">{d.ret.toLocaleString()}</span><span className={cn("text-right font-semibold", d.ret >= d.inv && "text-[hsl(var(--chart-2))]")}>{pct(d.ret, d.inv)}</span></div>
            ))}
          </div>
        )}
      </>)}
    </section>
  );
}

function HimoRec() { const { data } = useRecords(); return <RecordCard rec={data?.himo} title="記録開始からの成績（好調の紐）" note="1点100円で計算。今のルール（好調2〜3人・最大6点）に合うレースだけを数えています。" testid="rec-himo" />; }
function HonSRec() { const { data } = useRecords(); return <RecordCard rec={data?.honS} title="記録開始からの成績（本命S・推奨5点）" note="朝の予想の推奨5点（3連単）を1点1,000円で買った場合。締切前に決まっていた予想だけを数えています。" testid="rec-hons" unit={10} />; }
function HonS90AllRec() { const { data } = useRecords(); return <RecordCard rec={data?.honS90all} title="本命S 自信度90以上の成績（推奨5点）" note="本命Sのうち自信度90以上のレースで、推奨5点（3連単）を1点1,000円で買った場合。締切前に決まっていた予想だけを数えています。" testid="rec-hons90all" unit={10} />; }
function HonS90Rec() { const { data } = useRecords(); return <RecordCard rec={data?.honS90} title="本命S 自信度90以上・20%以上の成績" note="本命Sのうち自信度90以上のレースで、推奨5点の中から確率20%以上の目だけを1点1,000円で買った場合。20%以上の目がないレースは買わない扱いです。締切前に決まっていた予想だけを数えています。" testid="rec-hons90" unit={10} />; }
function HimoView({ items, nowHm, toM, madeAt }: { items: PlanItem[]; nowHm: number; toM: (t: string | null) => number; madeAt: string | null }) {
  const xs = items.filter((i) => i.himo).sort((a, b) => toM(a.deadline) - toM(b.deadline));
  const up = xs.filter((i) => toM(i.deadline) > nowHm); const done = xs.filter((i) => toM(i.deadline) <= nowHm).reverse();
  const fin = done.filter((i) => i.result?.finished); const hit = fin.filter((i) => i.result?.trifecta && i.himo!.picks.includes(i.result.trifecta));
  const inv = fin.reduce((a, i) => a + i.himo!.picks.length * 100, 0); const ret = hit.reduce((a, i) => a + (i.result?.trifectaPay ?? 0), 0);
  const Row = ({ p }: { p: PlanItem }) => {
    const r = p.result; const h = !!r?.finished && !!r.trifecta && p.himo!.picks.includes(r.trifecta);
    return (
      <Link href={`/race/${p.hd}/${p.jcd}/${p.rno}`} className="block rounded-xl border bg-card p-3 hover:border-primary/50" data-testid={`card-himo-${p.jcd}-${p.rno}`}>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm font-semibold">{p.venue} {p.rno}R</span>
          <span className="num text-xs text-muted-foreground">{p.deadline}</span>
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">1号艇 1着率<span className="num ml-0.5 font-bold text-foreground">{Math.round((p.entries.find((e) => e.lane === 1)?.winProb ?? 0) * 100)}%</span></span>
          <span className="ml-auto text-xs">{r?.finished ? (<span className="flex items-center gap-1.5"><ComboView combo={r.trifecta!} small /><span className={cn("num font-semibold", h ? "text-[hsl(var(--chart-2))]" : "text-muted-foreground")}>{h ? `的中 ${r.trifectaPay?.toLocaleString()}円` : "不的中"}</span></span>) : toM(p.deadline) <= nowHm ? <span className="text-muted-foreground">結果待ち</span> : <span className="num font-semibold">{p.himo!.picks.length}点</span>}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {p.himo!.lanes.map((l) => <span key={l.lane} className="flex items-center gap-1"><Boat n={l.lane} small />{p.entries.find((e) => e.lane === l.lane)?.name} 今節{l.n}走 平均<span className="num font-semibold text-foreground">{l.avg.toFixed(2)}</span>着</span>)}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">{p.himo!.picks.map((c) => <span key={c} className={cn("rounded-md border px-1 py-0.5", r?.trifecta === c && "border-[hsl(var(--chart-2))] bg-[hsl(var(--chart-2)/0.1)]")}><ComboView combo={c} small /></span>)}</div>
      </Link>
    );
  };
  return (
    <section className="space-y-3">
      <SectionTitle sub={`${madeAt ? `${madeAt}の分析で決めた買い目で、一日変わりません。` : ""}朝のAIで1号艇の1着率が80%以上のレースのうち、2〜6号艇に今節3走以上で平均着順2.5以内の好調な選手が2人か3人いるレースだけ出します（4人以上は点数が多くなるため対象外、最大6点）。1着は1号艇、2・3着は好調な選手どうしの組み合わせです（3連単、1点100円）。過去の約1,400レースの検証では回収率108%でしたが、払戻上位3件を除くと82%で、まだ試験中です。`}>今節好調の紐（試験中）</SectionTitle>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border bg-card p-2"><div className="text-[10px] text-muted-foreground">本日の結果</div><div className="num font-bold">{hit.length}/{fin.length}</div></div>
        <div className="rounded-lg border bg-card p-2"><div className="text-[10px] text-muted-foreground">購入</div><div className="num font-bold">{inv.toLocaleString()}円</div></div>
        <div className="rounded-lg border bg-card p-2"><div className="text-[10px] text-muted-foreground">回収率</div><div className="num font-bold">{inv ? `${Math.round((ret / inv) * 100)}%` : "—"}</div></div>
      </div>
      <HimoRec />
      {up.length ? <div className="grid gap-2 lg:grid-cols-2">{up.map((p) => <Row key={`${p.jcd}-${p.rno}`} p={p} />)}</div>
        : <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">{xs.length ? "本日の対象レースはすべて締切を迎えました。" : "本日は対象レースがありません（朝の予想から対象になります）。"}</div>}
      {done.length > 0 && (<><h3 className="pt-2 text-sm font-bold">締切後</h3><div className="grid gap-2 lg:grid-cols-2">{done.map((p) => <Row key={`${p.jcd}-${p.rno}`} p={p} />)}</div></>)}
    </section>
  );
}

type H2 = { jcd: string; venue: string; rno: number; deadline: string | null; sel: boolean; p1: number; p1mkt: number; ratio: number; heads: { lane: number; name: string; p: number; pmkt: number }[]; lastSeen: string; result?: { first: number | null; second: number | null; trifecta: string | null; trifectaPay: number | null } | null };
type H2St = { n: number; hit: number; both: number; lose1: number };
type H2Resp = { hd: string; mode?: "live" | "morning"; threshold: number; races: H2[]; today: H2St; all: { days: ({ hd: string } & H2St)[]; total: H2St }; allLive?: { days: ({ hd: string } & H2St)[]; total: H2St } | null; retro?: H2[]; retroStat?: H2St };
type H2Ashi = { available: boolean; keys: string[]; labels: Record<string, string>; lanes: { lane: number; today: Record<string, { v: number | null; rank: number | null }> | null; series: Record<string, { srank?: number; stotal?: number }> }[] };
// 頭2艇のレースの船足（オリジナル展示）: 展示の後に、その日の順位を出す
function H2AshiMini({ hd, x, nowHm, toM }: { hd: string; x: H2; nowHm: number; toM: (t: string | null) => number }) {
  const dl = toM(x.deadline); const on = nowHm >= dl - 25;
  const { data } = useQuery<H2Ashi>({ queryKey: [`/api/ashi?hd=${hd}&jcd=${x.jcd}&rno=${x.rno}`], enabled: on, staleTime: 60_000, refetchInterval: (q) => (q.state.data?.available || nowHm > dl + 30 ? false : 120_000) });
  if (!on) return <div className="mt-1.5 text-[11px] text-muted-foreground">船足は展示の後（締切25分前ごろ）に出ます</div>;
  if (!data) return null;
  const ok = data.available && data.lanes.some((l) => l.today);
  if (!ok) return <div className="mt-1.5 text-[11px] text-muted-foreground">{nowHm > dl + 30 ? "このレースは船足のデータがありませんでした" : "船足はまだ出ていません（展示の後に出ます）"}</div>;
  const hs = x.heads.map((h) => h.lane);
  return (
    <div className="mt-2 overflow-hidden rounded-lg border text-[11px]" data-testid={`h2-ashi-${x.jcd}-${x.rno}`}>
      <div className="grid bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `3.2rem repeat(${data.keys.length}, 1fr)` }}><span>船足</span>{data.keys.map((k) => <span key={k} className="text-center">{data.labels[k]}</span>)}</div>
      {data.lanes.map((l) => (
        <div key={l.lane} className={cn("num grid items-center border-t px-2 py-0.5", hs.includes(l.lane) && "bg-primary/5 font-semibold", l.lane === 1 && "bg-muted/30")} style={{ gridTemplateColumns: `3.2rem repeat(${data.keys.length}, 1fr)` }}>
          <span className="flex items-center gap-1"><Boat n={l.lane} small />{hs.includes(l.lane) ? <span className="text-[9px] text-primary">頭</span> : null}</span>
          {data.keys.map((k) => { const t = l.today?.[k]; const r = t?.rank ?? null; return <span key={k} className={cn("text-center", r === 1 ? "font-bold text-[hsl(var(--chart-2))]" : r !== null && r >= 5 ? "text-destructive" : "")}>{r !== null ? `${r}位` : "—"}{t?.v ? <span className="ml-0.5 text-[9px] text-muted-foreground">{t.v.toFixed(2)}</span> : null}</span>; })}
        </div>
      ))}
      <div className="border-t px-2 py-1 text-[10px] text-muted-foreground">その日の展示での順位（1位が一番速い）。予想（頭2艇）は朝のまま変えていません。</div>
    </div>
  );
}
function Head2View({ nowHm, toM }: { nowHm: number; toM: (t: string | null) => number }) {
  const { data, isLoading } = useQuery<H2Resp>({ queryKey: ["/api/head2"], refetchInterval: 60_000 });
  const [open, setOpen] = useState(false);
  const xs = data?.races ?? []; const up = xs.filter((x) => toM(x.deadline) > nowHm); const done = xs.filter((x) => toM(x.deadline) <= nowHm).reverse();
  const pc = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—"); const md = (h: string) => `${parseInt(h.slice(4, 6))}/${parseInt(h.slice(6, 8))}`;
  const t = data?.all.total; const morning = data?.mode === "morning";
  const Row = ({ x }: { x: H2 }) => {
    const r = x.result; const hs = x.heads.map((h) => h.lane); const hit = !!r?.first && hs.includes(r.first); const both = hit && !!r?.second && hs.includes(r.second);
    return (
      <Link href={`/race/${data!.hd}/${x.jcd}/${x.rno}`} className="block rounded-xl border bg-card p-3 hover:border-primary/50" data-testid={`card-head2-${x.jcd}-${x.rno}`}>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm font-semibold">{x.venue} {x.rno}R</span>
          <span className="num text-xs text-muted-foreground">{x.deadline}</span>
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">1号艇 1着率<span className="num ml-0.5 font-bold text-foreground">{Math.round(x.p1 * 100)}%</span>{x.p1mkt >= 0 && <span className="num ml-0.5">（市場{Math.round(x.p1mkt * 100)}%）</span>}</span>
          <span className="ml-auto text-xs">{r?.first ? (<span className={cn("num font-semibold", hit ? "text-[hsl(var(--chart-2))]" : "text-muted-foreground")}>{hit ? (both ? "頭的中・1-2着" : "頭的中") : "不的中"}</span>) : toM(x.deadline) <= nowHm ? <span className="text-muted-foreground">結果待ち</span> : null}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {x.heads.map((h, i) => (
            <div key={h.lane} className={cn("flex items-center gap-1.5 rounded-lg border px-2 py-1.5", r?.first === h.lane && "border-[hsl(var(--chart-2))] bg-[hsl(var(--chart-2)/0.1)]")}>
              <span className="text-[10px] text-muted-foreground">頭{i + 1}</span><Boat n={h.lane} small /><span className="min-w-0 flex-1 truncate text-xs">{h.name}</span>
              <span className="num text-xs font-bold">{Math.round(h.p * 100)}%</span>
            </div>
          ))}
        </div>
        {morning && <H2AshiMini hd={data!.hd} x={x} nowHm={nowHm} toM={toM} />}
        {r?.first ? <div className="mt-1.5 text-[11px] text-muted-foreground">結果 {r.trifecta}{r.trifectaPay ? `（3連単 ${r.trifectaPay.toLocaleString()}円）` : ""}</div> : null}
      </Link>
    );
  };
  return (
    <section className="space-y-3">
      <SectionTitle sub={morning ? `朝のAIの予想（固定）で、1号艇の1着率が21%以下のレース（全場、1日5〜8レースほど）だけ、1号艇以外で1着率が高い2艇を出します。展示を待たずに朝の時点で決まり、一日を通して変わりません。展示や船足を足しても当たり方はほぼ変わらなかったため、10/17から朝に出す形にしました。過去（6〜10月・全場999レース）の検証では、1号艇が負けたのが85%、この2艇のどちらかが1着になったのが63.5%でした。買い目は出していません。` : `桐生・戸田・平和島・住之江・鳴門・福岡で、締切前のオッズにオリジナル展示（直線・まわり足・一周など）・展示タイム・スタート展示・進入・今節の足・朝のAIを足して1着率を計算し直します。1号艇の1着率が市場（オッズ）より低いと見たレース（全レースの約1割）だけ、1号艇以外で1着になりやすい2艇を出します。締切20分前から2分ごとに更新し、締切直前の内容で記録します。買い目は出していません。`}>頭2艇（試験中）</SectionTitle>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border bg-card p-2"><div className="text-[10px] text-muted-foreground">本日 頭的中</div><div className="num font-bold">{data ? `${data.today.hit}/${data.today.n}` : "—"}</div></div>
        <div className="rounded-lg border bg-card p-2"><div className="text-[10px] text-muted-foreground">2艇で1・2着</div><div className="num font-bold">{data ? `${data.today.both}/${data.today.n}` : "—"}</div></div>
        <div className="rounded-lg border bg-card p-2"><div className="text-[10px] text-muted-foreground">1号艇が負け</div><div className="num font-bold">{data ? `${data.today.lose1}/${data.today.n}` : "—"}</div></div>
      </div>
      {t && (
        <section className="rounded-xl border bg-card p-3" data-testid="rec-head2">
          <div className="flex items-baseline gap-2"><h3 className="text-sm font-bold">{morning ? "記録開始からの成績（頭2艇・朝の予想）" : "記録開始からの成績（頭2艇）"}</h3><span className="text-[11px] text-muted-foreground">{data!.all.days.length ? `${md(data!.all.days[0].hd)}から` : morning ? "10/17から" : "記録なし"}</span></div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            {[["頭的中", `${t.hit}/${t.n}`, pc(t.hit, t.n)], ["2艇で1・2着", `${t.both}/${t.n}`, pc(t.both, t.n)], ["1号艇が負け", `${t.lose1}/${t.n}`, pc(t.lose1, t.n)]].map(([l, a, b]) => (
              <div key={l} className="rounded-lg bg-muted/50 p-1.5"><div className="text-[10px] text-muted-foreground">{l}</div><div className="num text-sm font-bold">{b}</div><div className="num text-[10px] text-muted-foreground">{a}</div></div>
            ))}
          </div>
          {data!.all.days.length > 0 && (<>
            <button onClick={() => setOpen(!open)} className="mt-1.5 text-xs font-semibold text-primary" data-testid="rec-head2-toggle">{open ? "日別を閉じる" : "日別の成績を見る"}</button>
            {open && <div className="mt-1.5 overflow-hidden rounded-lg border text-xs">
              <div className="grid grid-cols-4 bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground"><span>日付</span><span className="text-right">頭的中</span><span className="text-right">1・2着</span><span className="text-right">1号艇負け</span></div>
              {[...data!.all.days].reverse().map((d) => <div key={d.hd} className="num grid grid-cols-4 border-t px-2 py-1"><span>{md(d.hd)}</span><span className="text-right">{d.hit}/{d.n}</span><span className="text-right">{d.both}/{d.n}</span><span className="text-right">{d.lose1}/{d.n}</span></div>)}
            </div>}
          </>)}
          {data!.allLive && data!.allLive.total.n > 0 && <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="rec-head2-live">締切前に展示とオッズで出していた頃（{md(data!.allLive.days[0].hd)}{data!.allLive.days.length > 1 ? `〜${md(data!.allLive.days[data!.allLive.days.length - 1].hd)}` : ""}）：頭的中 {data!.allLive.total.hit}/{data!.allLive.total.n}、2艇で1・2着 {data!.allLive.total.both}/{data!.allLive.total.n}、1号艇が負け {data!.allLive.total.lose1}/{data!.allLive.total.n}</p>}
        </section>
      )}
      {isLoading ? <Skeleton className="h-28 w-full rounded-xl" /> : up.length ? <div className="grid gap-2 lg:grid-cols-2">{up.map((x) => <Row key={`${x.jcd}-${x.rno}`} x={x} />)}</div>
        : <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">{morning ? "今日の対象のレースはすべて締切を迎えました（朝の予想で決まります）。" : "今は対象のレースがありません。締切の20分前ごろ、展示の後に条件に合うレースが出ます（1日4レースほど）。"}</div>}
      {done.length > 0 && (<><h3 className="pt-2 text-sm font-bold">締切後</h3><div className="grid gap-2 lg:grid-cols-2">{done.map((x) => <Row key={`${x.jcd}-${x.rno}`} x={x} />)}</div></>)}
      {data?.retro && data.retro.length > 0 && data.retroStat && (<>
        <div className="pt-3" data-testid="head2-retro">
          <h3 className="text-sm font-bold">参考：今日の朝から動かしていたら</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">この機能を作る前に締切を迎えたレースを、締切後に同じ計算で出したものです。オッズは締切直前ではなく確定オッズを使っているため、実際に締切前に出す内容とは少し違うことがあります。正式な記録には入れていません。</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border bg-card p-2"><div className="text-[10px] text-muted-foreground">頭的中</div><div className="num font-bold">{data.retroStat.hit}/{data.retroStat.n}</div></div>
            <div className="rounded-lg border bg-card p-2"><div className="text-[10px] text-muted-foreground">2艇で1・2着</div><div className="num font-bold">{data.retroStat.both}/{data.retroStat.n}</div></div>
            <div className="rounded-lg border bg-card p-2"><div className="text-[10px] text-muted-foreground">1号艇が負け</div><div className="num font-bold">{data.retroStat.lose1}/{data.retroStat.n}</div></div>
          </div>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">{[...data.retro].reverse().map((x) => <Row key={`r-${x.jcd}-${x.rno}`} x={x} />)}</div>
      </>)}
    </section>
  );
}

function roiTxt(x: ExStat) { return x.inv ? `${Math.round((x.ret / x.inv) * 100)}%` : "—"; }
function ExView({ ex, nowHm, toM, tri = false }: { ex?: ExEvResp; nowHm: number; toM: (t: string | null) => number; tri?: boolean }) {
  const BT = tri ? "3連単" : "2連単";
  const hd = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  const tm = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }) : "";
  return (
    <>
      <section>
        <SectionTitle sub={tri ? `展示情報が出た後の最新オッズで、50〜200倍の3連単のうち期待値が120%以上（確率はAI 30%＋オッズ 70%、確率1%以上）の買い目を出しています。オッズで変わるため、朝の予想とは違い固定ではありません。${ex?.updatedAt ? `最新情報 ${tm(ex.updatedAt)}。` : ""}` : `最新のオッズで、2連単の期待値が1.2以上かつAI確率（AI 50%＋オッズ 50%）が15%以上の買い目を出しています。オッズで変わるため、朝の予想とは違い固定ではありません。${ex?.updatedAt ? `最新情報 ${tm(ex.updatedAt)}。` : ""}`}>{tri ? "中穴 期待値120%超え（3連単）" : "2連単 期待値狙い"}</SectionTitle>
        <div className="mb-3 rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
          {tri ? <>「期待値120%」はAIとオッズから計算した見込みで、実際の回収率ではありません。過去約2万レースの確定オッズで同じ条件を検証すると、実際の回収率は97%（前半95%・後半99%）、1日約24点（約2,400円）・的中は3〜4日に1回ほど（1回あたり平均約8,000円）でした（進入コースは枠番どおりとして計算）。この期間の成績を下で記録して確かめます。成績は締切前に最後に確認した買い目（各100円）で計算します。確認はアプリが動いている間だけ、約5分ごとに行われます。</> : <>過去約1万レースの確定オッズで検証し直すと、この条件の回収率は91〜93%・的中率約16%でした（以前の114〜134%は、レース後に分かる進入コースを使っていたため高く出ていました）。この期間の成績を下で記録して確かめます。成績は締切前に最後に確認した買い目（各100円）で計算します。確認はアプリが動いている間だけ行われるため、締切から離れた時刻の確認になることがあります（各レースに確認時刻を表示します）。</>}
        </div>
        {!ex ? <Skeleton className="h-32 w-full rounded-xl" /> : ex.upcoming.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {ex.upcoming.map((p) => (
              <Link key={`${p.jcd}-${p.rno}`} href={`/race/${p.hd}/${p.jcd}/${p.rno}`} className="block rounded-xl border bg-card p-3 hover:border-primary/50" data-testid={`card-ex-${p.jcd}-${p.rno}`}>
                <div className="flex items-center gap-2 text-sm"><span className="font-semibold">{p.venue} {p.rno}R</span><span className="num flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{p.deadline}</span>
                  {toM(p.deadline) - nowHm <= 15 && <span className="rounded bg-[hsl(var(--chart-4))] px-1 text-[10px] font-bold text-white">まもなく締切</span>}</div>
                <div className="mt-2 space-y-1">
                  {p.exEv.map((e) => (
                    <div key={e.combo} className="flex items-center gap-2 text-xs">
                      <ComboView combo={e.combo} small />
                      <span className="num">{e.odds.toFixed(1)}倍</span>
                      <span className="num text-muted-foreground">確率 {pct(e.mixProb, 0)}</span>
                      <span className="num ml-auto font-bold text-[hsl(var(--chart-2))]">期待値 {e.ev.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-5 text-center text-sm text-muted-foreground">{tri ? "今のところ条件に合う3連単はありません。展示情報とオッズが出るたびに更新されます（締切の約20分前から）。" : "今のところ条件に合う2連単はありません。オッズが出るたびに更新されます。"}</div>
        )}
      </section>
      <section>
        <SectionTitle sub="締切前に最後に確認した買い目（各100円）で計算。"><span className="inline-flex items-center gap-1.5"><Trophy className="h-4 w-4" />{BT} 期待値狙いの成績</span></SectionTitle>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {([["本日", ex?.today], [`記録開始から（${ex?.all.days.length ?? 0}日）`, ex?.all.total]] as const).map(([l, x]) => (
            <div key={l} className="rounded-lg border bg-card p-3">
              <div className="text-xs font-semibold">{l}</div>
              {x ? (<>
                <div className="mt-1 text-sm">的中 <span className="num font-bold">{x.hits}/{x.races}</span><span className="ml-1 text-[10px] text-muted-foreground">レース（{x.bets}点）</span></div>
                <div className="text-sm">回収率 <span className={cn("num font-bold", x.inv > 0 && x.ret >= x.inv && "text-[hsl(var(--chart-2))]")}>{roiTxt(x)}</span></div>
                {x.inv > 0 && <div className="num text-[10px] text-muted-foreground">購入 {x.inv.toLocaleString()}円・払戻 {x.ret.toLocaleString()}円</div>}
              </>) : <Skeleton className="mt-1 h-8 w-full" />}
            </div>
          ))}
        </div>
        {ex && ex.done.length > 0 && (
          <div className="overflow-hidden rounded-xl border bg-card">
            {ex.done.map((h) => {
              const win = h.result?.exacta ?? null; const hit = !!win && h.combos.some((c) => c.combo === win);
              return (
                <Link key={`${h.jcd}-${h.rno}`} href={`/race/${hd}/${h.jcd}/${h.rno}`} className="block border-b p-3 last:border-0 hover:bg-accent/40" data-testid={`row-ex-${h.jcd}-${h.rno}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{h.venue} {h.rno}R</span>
                    <span className="num text-[10px] text-muted-foreground">締切{h.deadline}・確認{tm(h.lastSeen)}</span>
                    <span className="ml-auto flex items-center gap-1.5 text-xs">
                      {win ? (<><span className="text-muted-foreground">結果</span><ComboView combo={win} small /><span className={cn("num font-semibold", hit ? "text-[hsl(var(--chart-2))]" : "text-muted-foreground")}>{hit ? `的中 ${h.result?.exactaPay?.toLocaleString()}円` : "不的中"}</span></>) : <span className="text-muted-foreground">結果待ち</span>}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {h.combos.map((c) => (
                      <span key={c.combo} className={cn("inline-flex items-center gap-0.5 rounded border px-1 py-0.5", win === c.combo && "ring-2 ring-[hsl(var(--chart-2))]")}><ComboView combo={c.combo} small /><span className="num text-[10px] text-muted-foreground">{c.odds.toFixed(1)}倍</span></span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

type TenjiRace = { jcd: string; venue: string; rno: number; deadline: string | null; ex: (number | null)[] | null; st: (number | null)[] | null; course: number[] | null; best: number[]; center: boolean; at: string | null; result?: { trifecta: string | null; trifectaPay: number | null; first: number | null } | null };
type TenjiResp = { hd: string; venues: Record<string, string>; races: TenjiRace[]; updatedAt: string | null; all: { races: number; win: number; wins: Record<string, number> }; ntfyTopic?: string | null };
const useTenji = () => useQuery<TenjiResp>({ queryKey: ["/api/tenji"], refetchInterval: 30_000 });
const tenjiSeen = new Set<string>(); // 通知済み（アプリを開いている間だけ保持）
const centerLanes = (r: TenjiRace) => r.best.filter((l) => l >= 3 && l <= 5);

// 全タブ共通: 3・4・5号艇が展示タイム1番のレースをお知らせ（締切前のみ）
function TenjiAlert({ nowHm, toM, onOpen }: { nowHm: number; toM: (t: string | null) => number; onOpen: () => void }) {
  const { data } = useTenji();
  const hits = (data?.races ?? []).filter((r) => r.center && toM(r.deadline) > nowHm);
  const [perm, setPerm] = useState<string>(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  useEffect(() => {
    if (!data) return;
    const seen = tenjiSeen;
    for (const r of hits) {
      const k = `${data.hd}-${r.jcd}-${r.rno}`; if (seen.has(k)) continue; seen.add(k);
      if (perm === "granted") { try { new Notification(`${r.venue}${r.rno}R 展示タイム1番は${centerLanes(r).join("・")}号艇`, { body: `センター勢が展示1番（${r.ex?.[centerLanes(r)[0] - 1]?.toFixed(2)}）。締切 ${r.deadline}` }); } catch {} }
    }
  }, [hits.map((r) => r.jcd + r.rno).join(","), perm, data?.hd]);
  if (!hits.length) return null;
  return (
    <section className="rounded-xl border border-[hsl(var(--chart-3)/0.5)] bg-[hsl(var(--chart-3)/0.08)] p-3" data-testid="banner-tenji">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Bell className="h-4 w-4" />展示タイム センター勢が1番</span>
        {perm === "default" && <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" data-testid="button-tenji-notify" onClick={() => { try { Notification.requestPermission().then(setPerm); } catch { setPerm("unsupported"); } }}>通知を受け取る</Button>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {hits.map((r) => (
          <button key={`${r.jcd}-${r.rno}`} onClick={onOpen} className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm hover:border-primary/50" data-testid={`tenji-hit-${r.jcd}-${r.rno}`}>
            <span className="font-semibold">{r.venue}{r.rno}R</span>
            {centerLanes(r).map((l) => <Boat key={l} n={l} small />)}
            <span className="num text-xs text-muted-foreground">あと{toM(r.deadline) - nowHm}分</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TenjiRow({ r, nowHm, toM }: { r: TenjiRace; nowHm: number; toM: (t: string | null) => number }) {
  const past = toM(r.deadline) <= nowHm; const hd = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  return (
    <Link href={`/race/${hd}/${r.jcd}/${r.rno}`} className={cn("block border-b px-3 py-2 last:border-0 hover:bg-accent/40", r.center && "bg-[hsl(var(--chart-3)/0.07)]", past && !r.center && "opacity-60")} data-testid={`tenji-row-${r.jcd}-${r.rno}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-9 text-sm font-semibold">{r.rno}R</span>
        <span className="num text-muted-foreground">{r.deadline ?? "--:--"}</span>
        {r.center && <span className="rounded bg-[hsl(var(--chart-3))] px-1 text-[10px] font-bold text-white">センター1番</span>}
        {r.result?.trifecta && <span className="ml-auto flex items-center gap-1"><ComboView combo={r.result.trifecta} small /><span className="num">{r.result.trifectaPay?.toLocaleString()}円</span></span>}
        {!r.ex && !past && <span className="ml-auto text-muted-foreground">{toM(r.deadline) - nowHm <= 35 ? "展示待ち" : ""}</span>}
      </div>
      {r.ex && (
        <div className="mt-1.5 grid grid-cols-6 gap-1">
          {r.ex.map((t, i) => {
            const best = r.best.includes(i + 1);
            return (
              <div key={i} className={cn("flex flex-col items-center rounded border py-0.5", best && "border-[hsl(var(--chart-3))] ring-1 ring-[hsl(var(--chart-3))]")}>
                <Boat n={i + 1} small />
                <span className={cn("num text-[11px]", best ? "font-bold" : "text-muted-foreground")}>{t ? t.toFixed(2) : "-"}</span>
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}

function TenjiView({ nowHm, toM }: { nowHm: number; toM: (t: string | null) => number }) {
  const { data, isLoading } = useTenji();
  const [v, setV] = useState<string>("all");
  const tm = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }) : "";
  const races = data?.races ?? [];
  const hits = races.filter((r) => r.center);
  const venues = Object.entries(data?.venues ?? {}).filter(([j]) => races.some((r) => r.jcd === j));
  const shown = v === "all" ? races.filter((r) => toM(r.deadline) > nowHm - 1 && toM(r.deadline) - nowHm <= 60) : races.filter((r) => r.jcd === v);
  return (
    <>
      <section>
        <SectionTitle sub={`桐生・戸田・江戸川・平和島・鳴門・福岡・住之江の展示タイムを確認し、3・4・5号艇の誰かが展示タイム1番（同タイム含む）を出したら画面の上部でお知らせします。スマホへの通知は、アプリを開いていなくてもGitHubから届きます（日中は10分ごと、17時以降は20分ごとに確認）。${data?.updatedAt ? `最新確認 ${tm(data.updatedAt)}。` : ""}`}>展示タイム</SectionTitle>
        {data?.ntfyTopic && (
          <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed" data-testid="ntfy-info">
            <div className="flex items-center gap-1.5 font-semibold"><Bell className="h-3.5 w-3.5" />アプリを閉じていてもスマホに通知</div>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-muted-foreground">
              <li>App Storeで無料アプリ「ntfy」を入れる</li>
              <li>アプリの「＋」から、チャンネル名に <span className="num select-all whitespace-nowrap rounded bg-card px-1 font-bold text-foreground">{data.ntfyTopic}</span> を入れて登録（Subscribe）</li>
              <li>通知を許可する</li>
            </ol>
            <div className="mt-1 text-[10px] text-muted-foreground">6場で3・4・5号艇が展示1番になると、すぐに展示タイム付きで届きます。チャンネル名を知っている人なら誰でも受け取れるので、人に教えないでください。</div>
          </div>
        )}
        <div className="mb-3 rounded-lg border bg-card p-3 text-xs">
          <div className="font-semibold">本日のセンター1番 {hits.length}レース</div>
          {hits.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {hits.map((r) => (
                <span key={`${r.jcd}-${r.rno}`} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5">
                  <span className="font-semibold">{r.venue}{r.rno}R</span>{centerLanes(r).map((l) => <Boat key={l} n={l} small />)}
                  {r.result?.first ? <span className={cn("num text-[10px]", r.best.includes(r.result.first) ? "font-bold text-[hsl(var(--chart-2))]" : "text-muted-foreground")}>{r.best.includes(r.result.first) ? "1着" : `${r.result.first}号艇1着`}</span> : null}
                </span>
              ))}
            </div>
          ) : <div className="mt-1 text-muted-foreground">まだありません。</div>}
          {data && data.all.races > 0 && <div className="mt-2 text-[11px] text-muted-foreground">記録開始から：センター1番 {data.all.races}レースのうち、展示1番の艇が1着 {data.all.win}回（{Math.round((data.all.win / data.all.races) * 100)}%）</div>}
        </div>
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {[["all", "直近1時間"], ...venues].map(([j, l]) => (
            <button key={j} onClick={() => setV(j)} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", v === j ? "border-primary bg-primary text-primary-foreground" : "bg-card")} data-testid={`tenji-v-${j}`}>{l}</button>
          ))}
        </div>
        {isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : shown.length ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            {(v === "all" ? shown : shown).map((r) => (
              <div key={`${r.jcd}-${r.rno}`}>
                {v === "all" && <div className="border-b bg-muted/40 px-3 py-0.5 text-[10px] font-semibold text-muted-foreground">{r.venue}</div>}
                <TenjiRow r={r} nowHm={nowHm} toM={toM} />
              </div>
            ))}
          </div>
        ) : <div className="rounded-xl border bg-card p-5 text-center text-sm text-muted-foreground">{races.length ? "直近1時間に締切のレースはありません。場を選ぶと一日分を見られます。" : "本日は対象の6場で開催がないか、まだ情報がありません。"}</div>}
      </section>
    </>
  );
}

export default function PicksPage() {
  const { data, isLoading } = useQuery<PicksResponse>({
    queryKey: ["/api/picks"],
    refetchInterval: (q) => ((q.state.data as PicksResponse | undefined)?.status.running ? 4000 : 60_000),
  });
  const refresh = useMutation({
    mutationFn: () => apiRequest("POST", "/api/picks/refresh", {}),
    onSuccess: () => setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/picks"] }), 800),
  });
  const { data: bt } = useQuery<any>({ queryKey: ["/api/backtest"], retry: false });
  const btB = bt?.oos?.buckets?.["75以上"];
  const st = data?.status;

  const [mode, setMode] = useState<"honmei" | "manshu" | "chuana" | "both" | "exev" | "tenji" | "head2">("chuana");
  const [sub, setSub] = useState<"s" | "other" | "result" | "himo">("s");
  const [doneFilter, setDoneFilter] = useState<"s" | "all">("s");
  const plan = data?.plan;
  const nowHm = (() => { const d = new Date(Date.now() + 9 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); })();
  const toM = (t: string | null) => (t ? parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3, 5)) : 0);
  const byDl = (a: PlanItem, b: PlanItem) => toM(a.deadline) - toM(b.deadline);
  const items = plan?.items ?? [];
  const sAll = items.filter((i) => i.tier === "S").sort(byDl);
  const oAll = items.filter((i) => i.tier !== "S").sort(byDl);
  const sUp = sAll.filter((i) => toM(i.deadline) > nowHm);
  const oUp = oAll.filter((i) => toM(i.deadline) > nowHm);
  const sDone = sAll.filter((i) => toM(i.deadline) <= nowHm).reverse();
  const allDone = items.filter((i) => toM(i.deadline) <= nowHm).sort(byDl).reverse();
  const stat = (xs: PlanItem[]) => {
    const st = xs.filter((x) => x.result?.finished); const hit = st.filter((x) => x.main.slice(0, 5).some((m) => m.combo === x.result?.trifecta));
    const inv = st.length * 500; const ret = hit.reduce((a, x) => a + (x.result?.trifectaPay ?? 0), 0);
    return { n: st.length, hit: hit.length, inv, ret };
  };
  const sS = stat(sAll), sO = stat(oAll);
  const madeAt = plan ? new Date(plan.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }) : null;

  return (
    <div className="space-y-8">
      <div className="-mx-1 overflow-x-auto px-1"><div className="inline-flex rounded-lg border bg-card p-1" role="tablist">
        {([["chuana", "中穴狙い"], ["honmei", "本命狙い"], ["head2", "頭2艇"], ["both", "中穴×万舟"], ["tenji", "展示"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} data-testid={`tab-${k}`}
            className={cn("whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors sm:px-3 sm:text-sm", mode === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div></div>
      <TenjiAlert nowHm={nowHm} toM={toM} onOpen={() => setMode("tenji")} />
      <SoonBanner items={items} nowHm={nowHm} toM={toM} />
      {mode === "head2" ? <Head2View nowHm={nowHm} toM={toM} /> : mode === "tenji" ? <TenjiView nowHm={nowHm} toM={toM} /> : mode === "exev" ? <ExView ex={data?.exev} nowHm={nowHm} toM={toM} /> : mode === "chuana" ? <ExView tri ex={data?.triev} nowHm={nowHm} toM={toM} /> : mode === "both" ? <BothView items={items} nowHm={nowHm} toM={toM} madeAt={madeAt} loading={isLoading || (!plan && !!st?.running)} /> : mode !== "honmei" ? <ManshuView key={mode} kind={mode} items={items} nowHm={nowHm} toM={toM} madeAt={madeAt} loading={isLoading || (!plan && !!st?.running)} /> : (<>
      <div className="sticky top-14 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-lg border bg-card/95 p-1 backdrop-blur" role="tablist" data-testid="subtabs">
        {([["s", `期待度S ${sUp.length}`], ["himo", `好調の紐 ${items.filter((i) => i.himo && toM(i.deadline) > nowHm).length}`], ["other", `その他のレース ${oUp.length}`], ["result", "本日の成績"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} data-testid={`subtab-${k}`}
            className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors", sub === k ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>
      {sub === "himo" && <HimoView items={items} nowHm={nowHm} toM={toM} madeAt={madeAt} />}
      {sub === "s" && (<>
      <section>
        <SectionTitle
          sub={madeAt ? `${madeAt}の分析で決めた本日の予想です。AIの本命1着確率が94.7%以上（全レースの上位5%）のレースだけを期待度Sにしています。選定と推奨5点（3連単）は一日を通して変わりません。` : "本日の全レースをAIが分析しています。"}
          right={STATIC ? <span className="text-[11px] text-muted-foreground" data-testid="static-note">約10分ごとに自動更新</span> :
            <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={st?.running} data-testid="button-refresh-picks">
              <RefreshCw className={cn("mr-1.5 h-4 w-4", st?.running && "animate-spin")} />
              {st?.running ? `分析中 ${st.done}/${st.total}` : "最新情報を取得"}
            </Button>
          }
        >
          期待度S（AIが最も自信のある上位5%）
        </SectionTitle>

        {isLoading || (!plan && st?.running) ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              本日の全レースを分析して朝の予想を作成しています{st?.total ? `（${st.done}/${st.total}レース）` : ""}。初回は数分かかります。
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${st?.total ? (st.done / st.total) * 100 : 5}%` }} />
              </div>
            </div>
            {[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : sUp.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {sUp.map((p) => <SRow key={`${p.jcd}-${p.rno}`} p={p} />)}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {sAll.length ? "本日の期待度Sレースはすべて締切を迎えました。" : "本日これから行われる期待度Sのレースはありません。"}
          </div>
        )}
        <p className="mt-2 text-right text-xs text-muted-foreground">
          期待度S {sAll.length}レース・その他 {oAll.length}レース{st?.updatedAt ? `（最新情報 ${new Date(st.updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}）` : ""}
        </p>
      </section>

      <HonSRec />
      <HonS90AllRec />
      <HonS90Rec />

      {data?.distorted && data.distorted.length > 0 && (
        <section>
          <SectionTitle sub="AIの確率に比べて単勝・2連複のオッズが高すぎる買い目があるレース。確定オッズでの過去検証では回収率が100%を大きく超えましたが、締切直前にオッズが大きく動くため、購入時点での成績は検証中です。">
            オッズのゆがみ検出
          </SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.distorted.map((p) => {
              const d = p.distortions![0];
              return (
                <Link key={`d-${p.jcd}-${p.rno}`} href={`/race/${p.hd}/${p.jcd}/${p.rno}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:border-primary/50" data-testid={`link-dist-${p.jcd}-${p.rno}`}>
                  {d.combo.includes("-") ? <ComboView combo={d.combo} sep="=" small /> : <Boat n={parseInt(d.combo)} />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{p.venue} {p.rno}R <span className="num ml-1 text-xs font-normal text-muted-foreground">{p.deadline}</span></div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{d.bt} {d.odds.toFixed(1)}倍{p.distortions!.length > 1 ? `　ほか${p.distortions!.length - 1}点` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-lg font-bold text-[hsl(var(--chart-2))]">{d.ev.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">期待値</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {data?.targets && data.targets.length > 0 && (
        <section>
          <SectionTitle sub="AIの本命が1号艇以外のレース。過去1.9万レースの検証では、この条件の単勝は回収率約97%で、全体（約93%）より高くなっています。">
            単勝の狙い目
          </SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.targets.map((p) => {
              const t = p.betTips!.find((x) => x.highlight)!;
              return (
                <Link key={`t-${p.jcd}-${p.rno}`} href={`/race/${p.hd}/${p.jcd}/${p.rno}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:border-primary/50" data-testid={`link-target-${p.jcd}-${p.rno}`}>
                  <Boat n={parseInt(t.combos[0])} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{p.venue} {p.rno}R <span className="num ml-1 text-xs font-normal text-muted-foreground">{p.deadline}</span></div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.entries.find((e) => e.lane === parseInt(t.combos[0]))?.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-lg font-bold">{(t.prob * 100).toFixed(0)}%</div>
                    <div className="text-[10px] text-muted-foreground">AI1着確率</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      </>)}

      {sub === "other" && (
        <section>
          <SectionTitle sub="期待度S以外のレース（朝の分析時点）。タップすると推奨5点などの詳細が開きます。">その他のレース</SectionTitle>
          {oUp.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">これから行われるその他のレースはありません。</p> : null}
          <div className="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {oUp.map((p) => <OtherRow key={`${p.jcd}-${p.rno}`} p={p} />)}
          </div>
        </section>
      )}

      {sub === "result" && (
      <section>
        <SectionTitle sub="朝の予想（3連単 推奨5点・各1,000円）で計算。レース画面の「朝の予想」と同じ買い目です。">
          <span className="inline-flex items-center gap-1.5"><Trophy className="h-4 w-4" />本日の成績</span>
        </SectionTitle>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {([["期待度S", sS], ["その他のレース", sO]] as const).map(([l, x]) => (
            <div key={l} className="rounded-lg border bg-card p-3">
              <div className={cn("text-xs font-semibold", l !== "期待度S" && "text-muted-foreground")}>{l}</div>
              <div className="mt-1 flex items-baseline gap-3 text-sm"><span>的中 <span className="num font-bold">{x.hit}/{x.n}</span></span><span>回収率 <span className={cn("num font-bold", x.inv > 0 && x.ret >= x.inv && "text-[hsl(var(--chart-2))]")}>{x.inv ? `${Math.round((x.ret / x.inv) * 100)}%` : "—"}</span></span></div>
            </div>
          ))}
        </div>
        <div className="mb-2 inline-flex rounded-md border p-0.5 text-xs">
          {([["s", `期待度S ${sDone.length}`], ["all", `全レース ${allDone.length}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setDoneFilter(k)} data-testid={`filter-done-${k}`} className={cn("rounded px-2.5 py-1 font-semibold", doneFilter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
          ))}
        </div>
        {(doneFilter === "s" ? sDone : allDone).length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">まだ締切を迎えたレースはありません。</p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {(doneFilter === "s" ? sDone : allDone).map((h) => <DoneRow key={`${h.jcd}-${h.rno}`} h={h} />)}
          </div>
        )}
      </section>
      )}

      </>)}

      <section className="flex gap-2 rounded-xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          AI確率は「当地のコース別入着率」「全国・当地勝率」「モーター」「コース別ST」「展示タイム」「コース別1着・2着・3着率」「差し・まくり率」など56項目を過去1年・約5万レースで学習した機械学習モデル（1着→2着→3着を順に予測）の確率を、オッズから逆算した市場確率と合成した値です。期待値＝AI確率×オッズ。控除率が約25%あるため多くの買い目は1.00を下回ります。予想は参考情報であり、的中や利益を保証するものではありません。舟券の購入は20歳以上、無理のない範囲で。
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("num mt-0.5 text-lg font-bold", highlight && "text-[hsl(var(--chart-2))]")}>{value}</div>
    </div>
  );
}
