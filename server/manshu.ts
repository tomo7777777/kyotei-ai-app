// 万舟狙い（的中率重視）: 朝のAIの確率と締切8分前のオッズで「50倍以上の目にAIが置く確率の合計」が高いレース（全体の上位3%）だけ、
// 50倍以上の目をAIの確率順に20点買う。過去（6〜10月・約2万レース）の検証: 1日約4.6レース・的中率22%・回収率106%（前半109%・後半104%）。
import fs from "node:fs";
import path from "node:path";
import * as B from "./boatrace";
import { jstNowMin, toMin } from "./model";

export const MAN_TH = 0.5594; // 過去の全レースの上位3%（50倍以上の目の確率合計）
export const MAN_MIN = 50; // 50倍以上
export const MAN_N = 20;
const DIR = path.resolve("data/manshu"); fs.mkdirSync(DIR, { recursive: true });
const MP_DIR = path.resolve("data/mp"); fs.mkdirSync(MP_DIR, { recursive: true });

export type ManRec = {
  jcd: string; venue: string; rno: number; deadline: string | null;
  sel: boolean; pman: number; at: string;
  buy: { combo: string; odds: number; p: number }[];
  result?: { trifecta: string | null; trifectaPay: number | null } | null;
};
const cache: Record<string, ManRec[]> = {};
const load = (hd: string): ManRec[] => (cache[hd] ??= (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${hd}.json`), "utf8")); } catch { return []; } })());
const save = (hd: string) => fs.writeFileSync(path.join(DIR, `${hd}.json`), JSON.stringify(cache[hd] ?? []));

// 朝のAIの3連単確率（120通り）を日ごとに保存（プランに入れたときの値で固定）
const mpCache: Record<string, Record<string, Record<string, number>>> = {};
const loadMp = (hd: string) => (mpCache[hd] ??= (() => { try { return JSON.parse(fs.readFileSync(path.join(MP_DIR, `${hd}.json`), "utf8")); } catch { return {}; } })());
export function putMorningP(hd: string, jcd: string, rno: number, mp: Record<string, number>) {
  const d = loadMp(hd); const k = `${jcd}-${rno}`; if (d[k]) return;
  d[k] = mp; fs.writeFileSync(path.join(MP_DIR, `${hd}.json`), JSON.stringify(d));
}

type PlanRef = { jcd: string; venue: string; rno: number; deadline: string | null; addedAt: string };
let planOf: (hd: string) => PlanRef[] | null = () => null;
export function setManPlanSource(f: typeof planOf) { planOf = f; }

let busy = false;
export async function manshuTick() {
  if (busy) return; busy = true;
  try {
    const hd = B.todayHd(); const now = jstNowMin(hd); const xs = load(hd); let ch = false;
    const items = planOf(hd) ?? []; const mps = loadMp(hd);
    for (const it of items) {
      const m = toMin(it.deadline || ""); if (m === null || m - now > 8 || m - now < 1) continue;
      if (xs.find((x) => x.jcd === it.jcd && x.rno === it.rno)) continue;
      const mp = mps[`${it.jcd}-${it.rno}`]; if (!mp) continue;
      const o = await B.getOdds3t(it.jcd, it.rno, hd).catch(() => ({} as Record<string, number>)); if (Object.keys(o).length < 100) continue;
      const big = Object.keys(mp).filter((c) => (o[c] ?? 0) >= MAN_MIN);
      const pman = big.reduce((a, c) => a + mp[c], 0);
      const sel = pman >= MAN_TH;
      const buy = sel ? big.sort((a, b) => mp[b] - mp[a]).slice(0, MAN_N).map((c) => ({ combo: c, odds: o[c], p: Math.round(mp[c] * 1e5) / 1e5 })) : [];
      xs.push({ jcd: it.jcd, venue: it.venue, rno: it.rno, deadline: it.deadline, sel, pman: Math.round(pman * 1e4) / 1e4, at: new Date().toISOString(), buy }); ch = true;
    }
    for (const x of xs) {
      if (!x.sel || x.result?.trifecta || (toMin(x.deadline || "") ?? 9999) + 3 > now) continue;
      const r = await B.getResult(x.jcd, x.rno, hd).catch(() => null);
      if (r?.finished) { x.result = { trifecta: r.trifecta, trifectaPay: r.trifectaPay }; ch = true; }
    }
    if (ch) save(hd);
  } catch (e: any) { console.log("manshu error", e?.message); } finally { busy = false; }
}

function stat(xs: ManRec[]) {
  let n = 0, hit = 0, pts = 0, ret = 0;
  for (const x of xs) { if (!x.sel || !x.result?.trifecta) continue; n++; pts += x.buy.length; if (x.buy.some((b) => b.combo === x.result!.trifecta)) { hit++; ret += x.result.trifectaPay ?? 0; } }
  return { n, hit, pts, inv: pts * 100, ret };
}
export function manshuResp(hd: string) {
  const xs = load(hd).filter((x) => x.sel).sort((a, b) => (toMin(a.deadline || "") ?? 0) - (toMin(b.deadline || "") ?? 0));
  const files = fs.readdirSync(DIR).filter((f) => /^\d{8}\.json$/.test(f)).sort();
  const days = files.map((f) => ({ hd: f.slice(0, 8), ...stat(load(f.slice(0, 8))) })).filter((d) => d.n > 0);
  const total = days.reduce((a, d) => ({ n: a.n + d.n, hit: a.hit + d.hit, pts: a.pts + d.pts, inv: a.inv + d.inv, ret: a.ret + d.ret }), { n: 0, hit: 0, pts: 0, inv: 0, ret: 0 });
  const judged = load(hd).length;
  return { hd, th: MAN_TH, min: MAN_MIN, n: MAN_N, judged, races: xs, today: stat(xs), all: { days, total } };
}
