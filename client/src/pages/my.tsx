import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Trash2, Plus, Clock, ChevronRight, Star } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MyRaceOut } from "@/lib/types";
import { Boat, ComboView, EvBadge, SectionTitle, pct, hdLabel } from "@/components/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// "1-23-234" や "1-2-3, 1-3-2" を展開
export function expandCombos(input: string, kind: "3t" | "2t"): string[] {
  const out = new Set<string>();
  for (const part of input.split(/[,\s、]+/).filter(Boolean)) {
    const segs = part.replace(/[＝=ー－]/g, "-").split("-").map((s) => s.replace(/[^1-6]/g, "").split("").map(Number));
    const need = kind === "3t" ? 3 : 2;
    if (segs.length !== need || segs.some((s) => !s.length)) continue;
    if (kind === "3t") {
      for (const a of segs[0]) for (const b of segs[1]) for (const c of segs[2]) if (a !== b && b !== c && a !== c) out.add(`${a}-${b}-${c}`);
    } else {
      for (const a of segs[0]) for (const b of segs[1]) if (a !== b) out.add(`${a}-${b}`);
    }
  }
  return Array.from(out);
}

function RaceBlock({ r }: { r: MyRaceOut }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<"3t" | "2t">("3t");
  const [combo, setCombo] = useState("");
  const [amount, setAmount] = useState(100);
  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/myraces"] });
  const addBets = useMutation({
    mutationFn: async (list: { type: string; combo: string; amount: number }[]) => {
      for (const b of list) await apiRequest("POST", "/api/bets", { raceId: r.id, ...b });
    },
    onSuccess: () => { setCombo(""); inv(); },
    onError: (e: Error) => toast({ title: "追加できませんでした", description: e.message, variant: "destructive" }),
  });
  const delBet = useMutation({ mutationFn: (id: number) => apiRequest("DELETE", `/api/bets/${id}`), onSuccess: inv });
  const delRace = useMutation({ mutationFn: () => apiRequest("DELETE", `/api/myraces/${r.id}`), onSuccess: inv });

  const submit = () => {
    const list = expandCombos(combo, kind);
    if (!list.length) return toast({ title: "買い目の形式を確認してください", description: kind === "3t" ? "例: 1-2-3 / 1-23-234（フォーメーション）" : "例: 1-2 / 1-234", variant: "destructive" });
    if (list.length > 60) return toast({ title: "一度に追加できるのは60点までです", variant: "destructive" });
    addBets.mutate(list.map((c) => ({ type: kind, combo: c, amount })));
  };

  const stake = r.stake ?? 0;
  const exp = r.expReturn ?? 0;
  const hitPay = r.bets.reduce((s, b) => s + (b.pay || 0), 0);

  return (
    <article className="rounded-xl border bg-card" data-testid={`card-myrace-${r.id}`}>
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold">{hdLabel(r.hd)} {r.venue} {r.rno}R</h3>
            {r.status && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{r.status === "upcoming" ? "発売中" : r.status === "finished" ? "確定" : "締切"}</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />締切 <span className="num">{r.deadline ?? "—"}</span>
            {r.raceTitle && <span className="ml-2 truncate">{r.raceTitle}</span>}
          </div>
        </div>
        {r.confidence !== undefined && (
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">AI自信度</div>
            <div className="num font-bold">{r.confidence} <span className="text-xs font-semibold">{r.confidenceLabel}</span></div>
          </div>
        )}
        <Link href={`/race/${r.hd}/${r.jcd}/${r.rno}`} className="inline-flex items-center text-sm font-semibold text-primary" data-testid={`link-myrace-detail-${r.id}`}>
          分析 <ChevronRight className="h-4 w-4" />
        </Link>
        <button onClick={() => delRace.mutate()} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="マイレースから削除" data-testid={`button-delete-myrace-${r.id}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {r.error ? (
        <p className="p-4 text-sm text-destructive">{r.error}</p>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="mb-2 grid grid-cols-3 gap-2">
              <Mini label="購入額" value={`${stake.toLocaleString()}円`} />
              <Mini label="期待払戻" value={`${Math.round(exp).toLocaleString()}円`} />
              <Mini label="期待値" value={stake ? (exp / stake).toFixed(2) : "—"} tone={stake ? (exp / stake >= 1 ? "good" : "bad") : undefined} />
            </div>
            {r.result?.finished && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-2 text-xs">
                結果 <ComboView combo={r.result.trifecta!} small /> <span className="num">{r.result.trifectaPay?.toLocaleString()}円</span>
                <span className={cn("ml-auto font-bold", hitPay > 0 ? "text-[hsl(var(--chart-2))]" : "text-muted-foreground")}>
                  {stake ? (hitPay > 0 ? `払戻 ${hitPay.toLocaleString()}円` : "不的中") : ""}
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border p-0.5 text-xs">
                {(["3t", "2t"] as const).map((k) => (
                  <button key={k} onClick={() => setKind(k)} className={cn("rounded-md px-2.5 py-1", kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")} data-testid={`button-bet-kind-${k}-${r.id}`}>
                    {k === "3t" ? "3連単" : "2連単"}
                  </button>
                ))}
              </div>
              <Input value={combo} onChange={(e) => setCombo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={kind === "3t" ? "1-2-3 / 1-23-234" : "1-2 / 1-234"} className="h-9 w-40 flex-1" data-testid={`input-combo-${r.id}`} />
              <Input type="number" min={100} step={100} value={amount} onChange={(e) => setAmount(Math.max(100, parseInt(e.target.value) || 100))} className="num h-9 w-24" aria-label="金額" data-testid={`input-amount-${r.id}`} />
              <Button size="sm" onClick={submit} disabled={addBets.isPending} data-testid={`button-add-bet-${r.id}`}><Plus className="mr-1 h-4 w-4" />追加</Button>
            </div>
            {r.bets.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="p-1.5 text-left font-medium">買い目</th>
                      <th className="p-1.5 text-right font-medium">金額</th>
                      <th className="p-1.5 text-right font-medium">AI確率</th>
                      <th className="p-1.5 text-right font-medium">オッズ</th>
                      <th className="p-1.5 text-right font-medium">期待値</th>
                      <th className="p-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {r.bets.map((b) => (
                      <tr key={b.id} className={cn("border-b border-border/50", b.hit && "bg-[hsl(var(--chart-2)/0.12)]")} data-testid={`row-bet-${b.id}`}>
                        <td className="p-1.5"><span className="mr-1 text-[10px] text-muted-foreground">{b.type === "3t" ? "3単" : "2単"}</span><ComboView combo={b.combo} small /></td>
                        <td className="num p-1.5 text-right">{b.amount}</td>
                        <td className="num p-1.5 text-right">{pct(b.prob)}</td>
                        <td className="num p-1.5 text-right">{b.odds?.toFixed(1) ?? "—"}</td>
                        <td className="p-1.5 text-right"><EvBadge ev={b.ev} /></td>
                        <td className="p-1.5 text-right">
                          <button onClick={() => delBet.mutate(b.id)} className="text-muted-foreground hover:text-destructive" aria-label="買い目を削除" data-testid={`button-delete-bet-${b.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">買い目を入力すると、AI確率とオッズから期待値を計算します。フォーメーション（例: 1-23-234）にも対応。</p>
            )}
          </div>

          <div className="space-y-3">
            {r.entries && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">AIの印</div>
                <div className="flex flex-wrap gap-2">
                  {[...r.entries].sort((a, b) => b.winProb - a.winProb).slice(0, 4).map((e) => (
                    <span key={e.lane} className="inline-flex items-center gap-1 text-xs"><b>{e.mark}</b><Boat n={e.lane} small />{e.name.split(" ")[0]}</span>
                  ))}
                </div>
              </div>
            )}
            <QuickList title="AI推奨（タップで追加）" list={r.main ?? []} onAdd={(c) => addBets.mutate([{ type: "3t", combo: c, amount }])} />
            <QuickList title="期待値が高い買い目" list={r.bestEv ?? []} onAdd={(c) => addBets.mutate([{ type: "3t", combo: c, amount }])} />
          </div>
        </div>
      )}
    </article>
  );
}

function QuickList({ title, list, onAdd }: { title: string; list: MyRaceOut["main"] & {}; onAdd: (c: string) => void }) {
  if (!list.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((c) => (
          <button key={c.combo} onClick={() => onAdd(c.combo)} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs hover:border-primary" data-testid={`button-quick-${c.combo}`}>
            <ComboView combo={c.combo} small /> <span className="num">{c.odds?.toFixed(1) ?? "—"}</span> <EvBadge ev={c.ev} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("num font-bold", tone === "good" && "text-[hsl(var(--chart-2))]", tone === "bad" && "text-[hsl(var(--destructive))]")}>{value}</div>
    </div>
  );
}

function MyStats({ data }: { data: MyRaceOut[] }) {
  type Agg = { stake: number; pay: number; bets: number; hits: number };
  const z = (): Agg => ({ stake: 0, pay: 0, bets: 0, hits: 0 });
  const all = z(); const byVenue: Record<string, Agg> = {}; const byType: Record<string, Agg> = {};
  for (const r of data) {
    if (!r.result?.finished) continue;
    for (const b of r.bets ?? []) {
      for (const g of [all, (byVenue[r.venue ?? ""] ??= z()), (byType[b.type === "2t" ? "2連単" : "3連単"] ??= z())]) {
        g.stake += b.amount; g.pay += b.pay || 0; g.bets += 1; if (b.hit) g.hits += 1;
      }
    }
  }
  if (!all.bets) return null;
  const roi = (g: Agg) => (g.stake ? Math.round((g.pay / g.stake) * 100) : 0);
  const Row = ({ k, g }: { k: string; g: Agg }) => (
    <tr className="border-b border-border/50 last:border-0"><td className="py-1">{k}</td><td className="num py-1 text-right text-xs">{g.hits}/{g.bets}</td><td className="num py-1 text-right text-xs">{g.stake.toLocaleString()}円</td><td className={cn("num py-1 text-right font-semibold", roi(g) >= 100 ? "text-[hsl(var(--chart-2))]" : "text-muted-foreground")}>{roi(g)}%</td></tr>
  );
  return (
    <section className="rounded-xl border bg-card p-4" data-testid="card-my-stats">
      <h2 className="font-bold">自分の成績（確定したレース）</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Mini label="的中" value={`${all.hits}/${all.bets}点`} />
        <Mini label="払戻 / 購入" value={`${all.pay.toLocaleString()} / ${all.stake.toLocaleString()}円`} />
        <Mini label="回収率" value={`${roi(all)}%`} tone={roi(all) >= 100 ? "good" : "bad"} />
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {[["場別", byVenue], ["券種別", byType]].map(([t, m]) => (
          <table key={t as string} className="w-full text-sm">
            <thead className="text-[11px] text-muted-foreground"><tr className="border-b"><th className="pb-1 text-left font-medium">{t as string}</th><th className="pb-1 text-right font-medium">的中</th><th className="pb-1 text-right font-medium">購入</th><th className="pb-1 text-right font-medium">回収率</th></tr></thead>
            <tbody>{Object.entries(m as Record<string, Agg>).sort((a, b) => b[1].stake - a[1].stake).map(([k, g]) => <Row key={k} k={k} g={g} />)}</tbody>
          </table>
        ))}
      </div>
    </section>
  );
}

export default function MyPage() {
  const { data, isLoading } = useQuery<MyRaceOut[]>({ queryKey: ["/api/myraces"], refetchInterval: 90_000 });
  const total = (data ?? []).reduce((s, r) => s + (r.stake ?? 0), 0);
  const exp = (data ?? []).reduce((s, r) => s + (r.expReturn ?? 0), 0);
  return (
    <div className="space-y-4">
      <SectionTitle sub="気になるレースを登録し、自分の買い目の期待値をまとめて確認できます。オッズは開くたびに最新化されます。">マイレース</SectionTitle>
      {data && data.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Mini label="登録レース" value={`${data.length}`} />
          <Mini label="合計購入額" value={`${total.toLocaleString()}円`} />
          <Mini label="合計期待値" value={total ? (exp / total).toFixed(2) : "—"} tone={total ? (exp / total >= 1 ? "good" : "bad") : undefined} />
        </div>
      )}
      {data && <MyStats data={data} />}
      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <Star className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-semibold">マイレースはまだありません</p>
          <p className="mt-1 text-sm text-muted-foreground">レース画面の「マイレースに追加」から登録できます。</p>
          <Link href="/race" className="mt-4 inline-flex items-center text-sm font-semibold text-primary" data-testid="link-empty-to-race">レースを選ぶ <ChevronRight className="h-4 w-4" /></Link>
        </div>
      ) : (
        data.map((r) => <RaceBlock key={r.id} r={r} />)
      )}
    </div>
  );
}
