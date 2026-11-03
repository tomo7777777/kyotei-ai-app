import { FavStar, FavMemo } from "@/components/fav";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import type { RacerResponse, RacerCourse } from "@/lib/types";
import { Boat, SectionTitle, TagChip } from "@/components/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Habit = { label: string; tone: "good" | "bad" | "info"; detail: string };

function habits(c: RacerCourse): Habit[] {
  const h: Habit[] = [];
  const er = c.entryRate.map((x) => x ?? 0);
  const p = c.place;
  const first = (i: number) => p[i]?.[0] ?? null;
  if (first(0) !== null && er[0] >= 8) {
    if (first(0)! >= 65) h.push({ label: "イン逃げが強い", tone: "good", detail: `1コース1着率 ${first(0)!.toFixed(1)}%` });
    else if (first(0)! <= 40) h.push({ label: "インで取りこぼす", tone: "bad", detail: `1コース1着率 ${first(0)!.toFixed(1)}%` });
  }
  if (first(1) !== null && er[1] >= 8 && first(1)! >= 25) h.push({ label: "2コース差しが得意", tone: "good", detail: `2コース1着率 ${first(1)!.toFixed(1)}%` });
  const center = [2, 3].filter((i) => er[i] >= 8 && (first(i) ?? 0) >= 22);
  if (center.length) h.push({ label: "センターから攻める", tone: "good", detail: center.map((i) => `${i + 1}コース1着率 ${first(i)!.toFixed(1)}%`).join("、") });
  const outer = [4, 5].filter((i) => er[i] >= 8 && (c.top3[i] ?? 0) >= 45);
  if (outer.length) h.push({ label: "外枠でも舟券に絡む", tone: "good", detail: outer.map((i) => `${i + 1}コース3連対率 ${c.top3[i]!.toFixed(1)}%`).join("、") });
  const weakOuter = [4, 5].filter((i) => er[i] >= 8 && (c.top3[i] ?? 100) <= 25);
  if (weakOuter.length) h.push({ label: "外枠は苦戦", tone: "bad", detail: weakOuter.map((i) => `${i + 1}コース3連対率 ${c.top3[i]!.toFixed(1)}%`).join("、") });
  const inner = er[0] + er[1];
  if (inner >= 55) h.push({ label: "内寄りの進入が多い", tone: "info", detail: `1〜2コース進入率 ${inner.toFixed(1)}%（前付けの可能性）` });
  if (er[5] >= 25) h.push({ label: "6コース進入が多い", tone: "info", detail: `6コース進入率 ${er[5].toFixed(1)}%（大外に回ることがある）` });
  const sts = c.courseST.filter((x): x is number => x !== null && x > 0);
  if (sts.length) {
    const avg = sts.reduce((a, b) => a + b, 0) / sts.length;
    if (avg <= 0.14) h.push({ label: "スタートが速い", tone: "good", detail: `コース平均ST ${avg.toFixed(2)}` });
    else if (avg >= 0.19) h.push({ label: "スタートは慎重", tone: "bad", detail: `コース平均ST ${avg.toFixed(2)}` });
    const minI = c.courseST.indexOf(Math.min(...sts));
    const maxI = c.courseST.indexOf(Math.max(...sts));
    if (Math.max(...sts) - Math.min(...sts) >= 0.04) h.push({ label: `${minI + 1}コースでSTが速い`, tone: "info", detail: `${minI + 1}コース ${c.courseST[minI]!.toFixed(2)} ／ ${maxI + 1}コース ${c.courseST[maxI]!.toFixed(2)}` });
  }
  const so = c.startOrder.filter((x): x is number => x !== null);
  if (so.length && so.reduce((a, b) => a + b, 0) / so.length <= 2.8) h.push({ label: "スタート順が早い", tone: "good", detail: "スタートで先に飛び出す傾向" });
  const pl2 = p.map((x, i) => (x && er[i] >= 8 ? { i, w: x[0], s: x[1] + x[2] } : null)).filter(Boolean) as { i: number; w: number; s: number }[];
  if (pl2.length && pl2.filter((x) => x.s >= x.w * 2.2 && x.s >= 30).length >= 2) h.push({ label: "2・3着が多いヒモ型", tone: "info", detail: "1着より2〜3着の比率が高い。3連単の相手向き" });
  if (c.season?.finishDist?.[0] && c.season.finishDist[0] >= 30) h.push({ label: "勝ち切る力がある", tone: "good", detail: `期別1着率 ${c.season.finishDist[0].toFixed(1)}%` });
  return h;
}

function CourseChart({ c }: { c: RacerCourse }) {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const p = c.place[i] ?? [0, 0, 0];
        return (
          <div key={i} className="flex items-center gap-2 text-sm">
            <Boat n={i + 1} small />
            <div className="flex h-4 flex-1 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary" style={{ width: `${p[0]}%` }} title={`1着 ${p[0]}%`} />
              <div className="h-full bg-primary/55" style={{ width: `${p[1]}%` }} title={`2着 ${p[1]}%`} />
              <div className="h-full bg-primary/25" style={{ width: `${p[2]}%` }} title={`3着 ${p[2]}%`} />
            </div>
            <span className="num w-24 text-right text-xs"><b>{p[0].toFixed(0)}</b>/{p[1].toFixed(0)}/{p[2].toFixed(0)}%</span>
          </div>
        );
      })}
      <div className="flex justify-end gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-primary" />1着</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-primary/55" />2着</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-primary/25" />3着</span>
      </div>
    </div>
  );
}

export default function RacerPage({ toban }: { toban?: string }) {
  const [, nav] = useLocation();
  const [q, setQ] = useState(toban ?? "");
  const { data, isLoading, error } = useQuery<RacerResponse>({ queryKey: [`/api/racer/${toban}`], enabled: !!toban && /^\d{4}$/.test(toban), staleTime: 3600_000 });
  const c = data?.course;
  const hs = c ? habits(c) : [];

  return (
    <div className="space-y-5">
      <SectionTitle sub="登録番号で検索するか、レース画面の選手名をタップしてください。コース別の成績から癖を読み取ります。">選手の癖</SectionTitle>
      <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (/^\d{4}$/.test(q)) nav(`/racer/${q}`); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="登録番号（例: 4320）" className="num" data-testid="input-toban" />
        <Button type="submit" disabled={!/^\d{4}$/.test(q)} data-testid="button-search-racer"><Search className="mr-1 h-4 w-4" />検索</Button>
      </form>

      {!toban ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">選手を選ぶと、コース別の1着率・進入率・スタート傾向と、そこから読み取れる癖を表示します。</div>
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
      ) : error || !data || !c ? (
        <p className="rounded-xl border p-4 text-sm text-destructive">{error ? String((error as Error).message) : "見つかりません"}</p>
      ) : (
        <>
          <section className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h1 className="text-xl font-bold" data-testid="text-racer-name">{data.name}</h1>
              <span className="text-sm text-muted-foreground">{data.kana}</span>
              <span className="ml-auto self-center"><FavStar toban={toban!} name={data.name} cls={data.profile["級別"]} branch={data.profile["支部"]} /></span>
            </div>
            <div className="mt-2"><FavMemo toban={toban!} /></div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {["登録番号", "級別", "支部", "登録期", "生年月日"].map((k) => data.profile[k] && <span key={k}><span className="text-xs text-muted-foreground">{k}</span> {data.profile[k]}</span>)}
            </div>
            {c.season && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {[
                  ["勝率", c.season.winRate?.toFixed(2)],
                  ["出走", c.season.starts ? `${c.season.starts}回` : "—"],
                  ["平均ST", c.season.avgST?.toFixed(2)],
                  ["優勝", c.season.firsts !== null ? `${c.season.firsts}回` : "—"],
                  ["能力指数", c.season.ability ?? "—"],
                ].map(([l, v]) => (
                  <div key={String(l)} className="rounded-lg bg-muted/50 p-2"><div className="text-[10px] text-muted-foreground">{l}</div><div className="num font-bold">{v ?? "—"}</div></div>
                ))}
              </div>
            )}
            {c.season?.period && <p className="mt-1 text-[11px] text-muted-foreground">期別成績 集計期間 {c.season.period}</p>}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 font-bold">読み取れる癖</h2>
            {hs.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {hs.map((h) => (
                  <li key={h.label} className="flex items-start gap-2 rounded-lg border p-2.5" data-testid={`text-habit-${h.label}`}>
                    <TagChip label={h.label} tone={h.tone} />
                    <span className="text-xs text-muted-foreground">{h.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">目立った傾向はありません（データ不足の可能性があります）。</p>
            )}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 font-bold">コース別 入着率</h2>
              <CourseChart c={c} />
            </div>
            <div className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 font-bold">コース別 進入率・スタート</h2>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="p-1.5 text-left font-medium">コース</th><th className="p-1.5 text-right font-medium">進入率</th><th className="p-1.5 text-right font-medium">3連対率</th><th className="p-1.5 text-right font-medium">平均ST</th><th className="p-1.5 text-right font-medium">ST順</th></tr></thead>
                <tbody>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="p-1.5"><Boat n={i + 1} small /></td>
                      <td className="num p-1.5 text-right">{c.entryRate[i] ?? "—"}%</td>
                      <td className="num p-1.5 text-right">{c.top3[i] ?? "—"}%</td>
                      <td className="num p-1.5 text-right">{c.courseST[i]?.toFixed(2) ?? "—"}</td>
                      <td className="num p-1.5 text-right">{c.startOrder[i]?.toFixed(1) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {c.season?.finishDist && (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 font-bold">着順分布（期別）</h2>
              <div className="flex h-28 items-end gap-2">
                {c.season.finishDist.map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="num text-xs">{v.toFixed(0)}%</span>
                    <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(2, v * 2)}px` }} />
                    <span className="text-xs text-muted-foreground">{i + 1}着</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <p className="text-right text-xs text-muted-foreground">データ: BOAT RACE オフィシャルウェブサイト（コース別成績・期別成績）</p>
        </>
      )}
    </div>
  );
}
