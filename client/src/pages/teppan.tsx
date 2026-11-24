import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import { Moon, Sun, ShieldCheck, Clock, ListChecks, TriangleAlert, Copy, Check } from "lucide-react";
import { Logo, ComboView, Boat, useTheme, hdLabel } from "@/components/shell";
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
  kata?: { n: number; races: KRace[]; record: { from: string | null; days: RecDay[]; total: { n: number; hit: number; inv: number; ret: number } } };
};
type KRace = Omit<TRace, "picks"> & { picks: string[]; probs?: (number | null)[] };

const UNIT = 10; // 1点1,000円（記録は100円単位）
const yen = (v: number) => `${v < 0 ? "-" : ""}${Math.abs(Math.round(v)).toLocaleString()}円`;
const jstHm = (iso: string | null) => { if (!iso) return "—"; const d = new Date(new Date(iso).getTime() + 9 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const nowHm = () => { const d = new Date(Date.now() + 9 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const toM = (t: string | null) => (t ? parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3, 5)) : 0);

const pretty = (c: string) => (c.includes("-") ? c : c.split("").join("-"));
async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const a = document.createElement("textarea"); a.value = t; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; } a.remove(); return ok;
  }
}
function CopyBtn({ text, label = "予想をコピー" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}
      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold", done ? "border-[hsl(var(--chart-2))] text-[hsl(var(--chart-2))]" : "text-foreground hover-elevate")} data-testid="copy-btn">
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{done ? "コピーしました" : label}
    </button>
  );
}
// 1着・2着が同じ目をまとめる（例: 1-2-3 と 1-2-4 → 1-2-34）
type Form = { a: string; b: string; c: string[] };
function groupForm(combos: string[]): Form[] {
  const m = new Map<string, Form>();
  for (const x of combos) { const [a, b, c] = pretty(x).split("-"); const k = `${a}-${b}`; if (!m.has(k)) m.set(k, { a, b, c: [] }); m.get(k)!.c.push(c); }
  return Array.from(m.values()).map((f) => ({ ...f, c: f.c.sort() })).sort((x, y) => (x.a + x.b).localeCompare(y.a + y.b));
}
const formText = (f: Form) => `${f.a}-${f.b}-${f.c.join("")}`;
const pctS = (p: number | null | undefined) => (p == null ? "" : p >= 0.1 ? `${Math.round(p * 100)}%` : `${(p * 100).toFixed(1)}%`);
function FormRows({ combos, hit, prob }: { combos: string[]; hit?: string | null; prob?: Record<string, number | null> }) {
  const h = hit ? pretty(hit).split("-") : null;
  return (
    <div className="mt-1 space-y-1">
      {groupForm(combos).map((f) => {
        const on = !!h && h[0] === f.a && h[1] === f.b && f.c.includes(h[2]);
        return (
          <div key={f.a + f.b} className={cn("flex items-center gap-1 rounded-lg border px-2 py-1.5", on && "border-[hsl(var(--chart-2))] bg-[hsl(var(--chart-2)/0.12)]")}>
            <Boat n={f.a} small /><span className="text-xs text-muted-foreground">-</span><Boat n={f.b} small /><span className="text-xs text-muted-foreground">-</span>
            <span className="inline-flex flex-wrap items-start gap-1">{f.c.map((c) => {
              const p = prob?.[`${f.a}-${f.b}-${c}`]; const win = !!h && h[0] === f.a && h[1] === f.b && h[2] === c;
              return <span key={c} className={cn("inline-flex flex-col items-center", win && "rounded ring-2 ring-[hsl(var(--chart-2))]")}><Boat n={c} small />{prob ? <span className={cn("num text-[10px] leading-tight", (p ?? 0) < 0.02 ? "text-muted-foreground" : "font-semibold text-foreground")}>{pctS(p)}</span> : null}</span>;
            })}</span>
            <span className="num ml-auto text-[11px] text-muted-foreground">{f.c.length}点</span>
          </div>
        );
      })}
    </div>
  );
}
const HON = 3; // 本線の点数（AIの確率上位）
const raceText = (venue: string, rno: number, deadline: string | null, head: string, combos: string[]) => [`${venue}${rno}R（締切${deadline ?? "—"}）`, head, ...groupForm(combos).map(formText)].join("\n");
const honLine = (combos: string[]) => `（本線 ${combos.slice(0, HON).map(pretty).join("、")}）`;
const kataLines = (combos: string[]) => [...groupForm(combos).map(formText), honLine(combos)];
const kataText = (venue: string, rno: number, deadline: string | null, head: string, combos: string[]) => [`${venue}${rno}R（締切${deadline ?? "—"}）`, head, ...kataLines(combos)].join("\n");

const pctI = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
function noteText(data: TResp): string {
  const L: string[] = []; const hd = hdLabel(data.hd);
  const k = data.kata; const open = (x: { result: unknown }) => !x.result;
  const hon = data.races.filter(open).length ? data.races.filter(open) : data.races;
  const kat = k ? (k.races.filter(open).length ? k.races.filter(open) : k.races) : [];
  L.push(`【${hd} 競艇AI 本日の勝負レース】`, "", "全国のレースをAIが分析し、自信のあるレースだけを選んでいます。予想は朝に確定し、あとから変えません。", "");
  L.push("━━━━━━━━━━", "◆本命（3連単1〜2点）", "━━━━━━━━━━");
  if (!hon.length) L.push("本日は対象レースがありません。");
  for (const r of hon) {
    L.push("", `■${r.venue}${r.rno}R（締切${r.deadline ?? "—"}）`);
    for (const p of r.picks) L.push(pretty(p.combo));
    if (r.result?.trifecta) L.push(`結果 ${r.result.trifecta}${r.hit ? ` 的中 ${(r.result.trifectaPay ?? 0).toLocaleString()}円` : " 不的中"}`);
  }
  if (k) {
    L.push("", "━━━━━━━━━━", `◆的中重視（3連単${k.n}点）`, "━━━━━━━━━━");
    if (!kat.length) L.push("本日は対象レースがありません。");
    for (const r of kat) {
      L.push("", `■${r.venue}${r.rno}R（締切${r.deadline ?? "—"}）`, ...kataLines(r.picks));
      if (r.result?.trifecta) L.push(`結果 ${r.result.trifecta}${r.hit ? ` 的中 ${(r.result.trifectaPay ?? 0).toLocaleString()}円` : " 不的中"}`);
    }
  }
  const t = data.record.total; const kt = k?.record.total;
  L.push("", "━━━━━━━━━━", "◆これまでの成績（1点100円で計算）", "━━━━━━━━━━");
  L.push(`本命 ${data.record.from ? hdLabel(data.record.from) + "から " : ""}${t.hit}/${t.n}レース的中（${pctI(t.hit, t.n)}）回収率${pctI(t.ret, t.inv)}`);
  if (k && kt) L.push(`的中重視 ${k.record.from ? hdLabel(k.record.from) + "から " : ""}${kt.hit}/${kt.n}レース的中（${pctI(kt.hit, kt.n)}）回収率${pctI(kt.ret, kt.inv)}`);
  L.push("", "※過去の成績は今後の的中や利益を約束するものではありません。舟券の購入はご自身の判断でお願いします。");
  return L.join("\n");
}

function MonthTable({ days, unit, label }: { days: RecDay[]; unit: number; label: string }) {
  const m = new Map<string, { n: number; hit: number; inv: number; ret: number }>();
  for (const d of days) { const k = d.hd.slice(0, 6); const a = m.get(k) ?? { n: 0, hit: 0, inv: 0, ret: 0 }; a.n += d.n; a.hit += d.hit; a.inv += d.inv; a.ret += d.ret; m.set(k, a); }
  const rows = Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  if (!rows.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border bg-card" data-testid="month-table">
      <div className="border-b px-3 py-2 text-xs font-bold">{label}</div>
      <table className="w-full text-xs">
        <thead className="text-[11px] text-muted-foreground"><tr><th className="px-3 py-1.5 text-left font-medium">月</th><th className="px-2 py-1.5 text-right font-medium">的中</th><th className="px-2 py-1.5 text-right font-medium">的中率</th><th className="px-2 py-1.5 text-right font-medium">回収率</th><th className="px-3 py-1.5 text-right font-medium">収支</th></tr></thead>
        <tbody>
          {rows.map(([k, a]) => { const r = a.inv ? a.ret / a.inv : 0; const pl = (a.ret - a.inv) * unit; return (
            <tr key={k} className="border-t">
              <td className="px-3 py-1.5 font-semibold">{parseInt(k.slice(4, 6))}月{k === rows[0][0] ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">途中</span> : null}</td>
              <td className="num px-2 py-1.5 text-right">{a.hit}/{a.n}</td>
              <td className="num px-2 py-1.5 text-right">{a.n ? Math.round((a.hit / a.n) * 100) : 0}%</td>
              <td className={cn("num px-2 py-1.5 text-right font-semibold", r >= 1 ? "text-[hsl(var(--chart-2))]" : "text-destructive")}>{Math.round(r * 100)}%</td>
              <td className={cn("num px-3 py-1.5 text-right", pl >= 0 ? "text-[hsl(var(--chart-2))]" : "text-destructive")}>{pl >= 0 ? "+" : ""}{yen(pl)}</td>
            </tr>); })}
        </tbody>
      </table>
    </div>
  );
}

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
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><span>予想確定 {jstHm(r.addedAt)}</span><Link href={`/race/${hd}/${r.jcd}/${r.rno}`} className="underline">レース詳細</Link><span className="ml-auto"><CopyBtn text={raceText(r.venue, r.rno, r.deadline, `本命 3連単${r.picks.length}点`, r.picks.map((p) => p.combo))} /></span></div>
    </div>
  );
}

function KataCard({ r, hd }: { r: KRace; hd: string }) {
  const tri = r.result?.trifecta; const left = toM(r.deadline) - nowHm();
  const pay = r.result?.trifectaPay ?? 0; const cost = r.picks.length * 100;
  const pm = r.probs ? Object.fromEntries(r.picks.map((c, i) => [pretty(c), r.probs![i] ?? null])) : undefined;
  return (
    <div className={cn("rounded-2xl border bg-card p-4", r.hit && "border-[hsl(var(--chart-2))]")} data-testid={`kata-${r.jcd}-${r.rno}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold">{r.venue} {r.rno}R</span>
        <span className="num text-sm text-muted-foreground">締切 {r.deadline ?? "—"}</span>
        <span className="ml-auto text-xs">
          {tri ? (r.hit ? <span className="rounded-full bg-[hsl(var(--chart-2)/0.15)] px-2 py-0.5 font-bold text-[hsl(var(--chart-2))]">的中</span> : <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">不的中</span>)
            : left > 0 ? <span className="num rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">あと{left >= 60 ? `${Math.floor(left / 60)}時間${left % 60}分` : `${left}分`}</span> : <span className="text-muted-foreground">結果待ち</span>}
        </span>
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">3連単{r.picks.length}点・AI自信度 <span className="num font-semibold text-foreground">{r.confidence}</span></div>
      <div className="mt-2 text-[11px] font-bold text-[hsl(var(--chart-2))]">本線 {Math.min(HON, r.picks.length)}点</div>
      <FormRows combos={r.picks.slice(0, HON)} hit={tri} prob={pm} />
      {r.picks.length > HON ? <><div className="mt-2 text-[11px] font-bold text-muted-foreground">抑え {r.picks.length - HON}点</div><FormRows combos={r.picks.slice(HON)} hit={tri} prob={pm} /></> : null}
      {tri ? <div className="mt-2 text-xs text-muted-foreground">結果 <span className="num font-semibold text-foreground">{tri}</span>{pay ? <>（3連単 {pay.toLocaleString()}円）{r.hit ? <span className={cn("ml-1 font-semibold", pay >= cost ? "text-[hsl(var(--chart-2))]" : "text-destructive")}>1点100円で{yen(cost)}買って{yen(pay)}</span> : null}</> : null}</div> : null}
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><span>予想確定 {jstHm(r.addedAt)}</span><Link href={`/race/${hd}/${r.jcd}/${r.rno}`} className="underline">レース詳細</Link><span className="ml-auto"><CopyBtn text={kataText(r.venue, r.rno, r.deadline, `的中重視 3連単${r.picks.length}点`, r.picks)} /></span></div>
    </div>
  );
}

function KataSection({ data }: { data: TResp }) {
  const k = data.kata; if (!k) return null;
  const t = k.record.total; const inv = t.inv, ret = t.ret; const roi = inv ? ret / inv : 0;
  const live = k.races.filter((r) => !r.result); const done = k.races.filter((r) => r.result);
  return (
    <section className="space-y-3" data-testid="kata">
      <div>
        <div className="flex items-baseline gap-2"><span className="rounded-md bg-[hsl(var(--chart-2)/0.15)] px-2 py-0.5 text-xs font-bold text-[hsl(var(--chart-2))]">的中重視</span><h2 className="text-base font-bold">当てることを優先して{k.n}点</h2></div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">本命と同じ自信度90以上のレースを、AIの確率が高い順に3連単{k.n}点。上位{HON}点が本線、残りが抑えです。各艇の下の数字はその目のAIの確率で、低い目を自分で切るときの目安にしてください。朝に確定し、あとから変えません。過去（6〜10月・約2万レース）の検証では的中率71〜78%、11/11〜11/22の実際のレースでは63%でした。当たっても払戻が購入額より少ないことがよくあります。</p>
      </div>
      {t.n > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="的中率" value={`${Math.round((t.hit / t.n) * 100)}%`} sub={`${t.hit}/${t.n}レース`} />
          <Stat label="回収率" value={`${Math.round(roi * 100)}%`} tone={roi >= 1 ? "good" : "bad"} />
          <Stat label="収支" value={`${ret - inv >= 0 ? "+" : ""}${yen(ret - inv)}`} tone={ret - inv >= 0 ? "good" : "bad"} sub="1点100円" />
          <Stat label="購入 / 払戻" value={yen(inv)} sub={`払戻 ${yen(ret)}`} />
        </div>
      ) : null}
      {k.races.length === 0 ? (
        <div className="rounded-2xl border bg-card p-5 text-center text-sm text-muted-foreground">本日は条件に合うレースがありません。</div>
      ) : (
        <div className="space-y-3">
          {live.map((r) => <KataCard key={`${r.jcd}-${r.rno}`} r={r} hd={data.hd} />)}
          {done.length > 0 && <div className="pt-1 text-xs font-semibold text-muted-foreground">終わったレース</div>}
          {done.map((r) => <KataCard key={`${r.jcd}-${r.rno}`} r={r} hd={data.hd} />)}
        </div>
      )}
    </section>
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
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><span>発表 {jstHm(r.at)}</span><Link href={`/race/${hd}/${r.jcd}/${r.rno}`} className="underline">レース詳細</Link><span className="ml-auto"><CopyBtn text={raceText(r.venue, r.rno, r.deadline, `狙い 3連単${r.buy.length}点`, r.buy.map((b) => b.combo))} /></span></div>
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
            全国のレースをAIが分析し、自信のあるレースだけを出します。少ない点数で堅く取る「本命」、点数を増やして当てることを優先する「的中重視」、高配当を取りにいく「狙い」の3本立てです。予想は決めたあと変えず、外れも含めて全部の成績を載せています。
          </p>
        </section>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <a href="#honmei" onClick={(e) => { e.preventDefault(); document.getElementById("honmei")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-xl border bg-card p-3"><div className="font-bold text-primary">本命</div><div className="mt-0.5 text-muted-foreground">1日2〜4R・1〜2点・朝に確定{data ? `・本日${data.races.length}R` : ""}</div></a>
          <a href="#kata" onClick={(e) => { e.preventDefault(); document.getElementById("kata")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-xl border bg-card p-3"><div className="font-bold text-[hsl(var(--chart-2))]">的中重視</div><div className="mt-0.5 text-muted-foreground">本命と同じレース・10点{data?.kata ? `・本日${data.kata.races.length}R` : ""}</div></a>
          <a href="#nerai" onClick={(e) => { e.preventDefault(); document.getElementById("nerai")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-xl border bg-card p-3"><div className="font-bold text-[hsl(var(--chart-4))]">狙い</div><div className="mt-0.5 text-muted-foreground">1日4〜5R・20点・締切8分前に発表</div></a>
        </div>

        {data ? <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5" data-testid="note-copy"><div className="min-w-0 text-xs"><div className="font-bold">note用にまとめてコピー</div><div className="text-muted-foreground">本命と的中重視の今日の予想と成績を、noteにそのまま貼れる形で</div></div><span className="ml-auto shrink-0"><CopyBtn text={noteText(data)} label="note用コピー" /></span></div> : null}

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
              {data ? <MonthTable days={data.record.days} unit={UNIT} label="月ごとの成績（1点1,000円）" /> : null}
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

        {data?.kata ? <div id="kata" className="scroll-mt-16 border-t pt-6"><KataSection data={data} /></div> : null}

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
