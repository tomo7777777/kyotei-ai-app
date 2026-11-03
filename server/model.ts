import fs from "node:fs";
import path from "node:path";
import * as B from "./boatrace";

export type Tag = { label: string; tone: "good" | "bad" | "info"; detail: string };
export type Combo = { combo: string; prob: number; modelProb: number; marketProb: number | null; odds: number | null; ev: number | null };
export type EntryOut = B.Entry & {
  course: number;
  exTime: number | null;
  exST: number | null;
  tilt: number | null;
  exRank: number | null;
  racer: B.RacerCourse | null;
  tags: Tag[];
  winProb: number;
  top2Prob: number;
  top3Prob: number;
  modelWin: number;
  marketWin: number | null;
  mark: string;
  factors: { label: string; value: number }[];
};
export type Analysis = {
  hd: string; jcd: string; venue: string; rno: number; raceTitle: string; deadline: string | null;
  status: "upcoming" | "closed" | "finished";
  entries: EntryOut[];
  weather: B.Before["weather"];
  beforeAvailable: boolean;
  oddsAvailable: boolean;
  venueStats: { course1st: number[]; kimarite: Record<string, number>[]; period: string };
  trifecta: Combo[];
  exacta: Combo[];
  confidence: number;
  confidenceLabel: string;
  main: Combo[];
  value: Combo[];
  comment: string[];
  modelKind: "ml" | "basic";
  betTips: BetTip[];
  distortions: Distortion[];
  exEv?: ExEv[];
  triEv?: ExEv[];
  manshu: Manshu | null;
  chuana: Manshu | null;
  result: B.Result | null;
  updatedAt: string;
};

const NAT_C1 = B.NATIONAL_PLACE.map((r) => r[0]);
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const MARKS = ["◎", "○", "▲", "△", "×", ""];

function perms(): number[][] {
  const out: number[][] = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) if (a !== b && b !== c && a !== c) out.push([a, b, c]);
  return out;
}
const PERMS = perms();

function buildTags(e: B.Entry, course: number, r: B.RacerCourse | null, exRank: number | null, entriesCount: number): Tag[] {
  const t: Tag[] = [];
  const pl = r?.place?.[course - 1];
  const c1 = r?.place?.[0];
  if (c1 && (r?.entryRate?.[0] ?? 0) >= 8) {
    if (c1[0] >= 65) t.push({ label: `イン逃げ${c1[0].toFixed(0)}%`, tone: "good", detail: "1コースの1着率が高く、イン戦で崩れにくい" });
    else if (c1[0] <= 40) t.push({ label: `イン弱め${c1[0].toFixed(0)}%`, tone: "bad", detail: "1コースでも1着率が低め。差し・捲りを許しやすい" });
  }
  const st = r?.courseST?.[course - 1] ?? e.avgST;
  if (st !== null && st !== undefined) {
    if (st <= 0.14) t.push({ label: `ST速い ${st.toFixed(2)}`, tone: "good", detail: `${course}コースの平均STが速く、スタートで主導権を取りやすい` });
    else if (st >= 0.19) t.push({ label: `ST遅め ${st.toFixed(2)}`, tone: "bad", detail: `${course}コースの平均STが遅め。叩かれるリスク` });
  }
  const sts = e.series.map((s) => s.st).filter((x): x is number => x !== null && x > 0);
  if (sts.length >= 3) {
    const m = mean(sts);
    const sd = Math.sqrt(mean(sts.map((x) => (x - m) ** 2)));
    if (sd <= 0.02) t.push({ label: "ST安定", tone: "good", detail: `今節のSTばらつきが小さい（σ${sd.toFixed(3)}）` });
    else if (sd >= 0.06) t.push({ label: "ST不安定", tone: "bad", detail: `今節のSTにばらつき（σ${sd.toFixed(3)}）` });
  }
  const maeduke = e.series.filter((s) => s.frame && s.course && s.course < s.frame).length;
  if (maeduke >= 2 || (maeduke >= 1 && e.series.length <= 3)) t.push({ label: "前付け傾向", tone: "info", detail: `今節${maeduke}走で枠より内のコースを取っている。進入が動く可能性` });
  if (r?.entryRate && e.lane >= 4 && (r.entryRate[0] ?? 0) + (r.entryRate[1] ?? 0) >= 50) t.push({ label: "内寄り進入派", tone: "info", detail: "期間内の進入が1〜2コースに偏っている" });
  if (r?.place?.[1] && (r.entryRate?.[1] ?? 0) >= 8 && r.place[1][0] >= 25) t.push({ label: `差し巧者 2C${r.place[1][0].toFixed(0)}%`, tone: "good", detail: "2コースからの1着率が高い" });
  const c3 = r?.place?.[2], c4 = r?.place?.[3];
  if ((c3 && c3[0] >= 25 && (r?.entryRate?.[2] ?? 0) >= 8) || (c4 && c4[0] >= 25 && (r?.entryRate?.[3] ?? 0) >= 8))
    t.push({ label: "攻め型（センター）", tone: "good", detail: "3〜4コースからの1着率が高く、捲り・捲り差しがある" });
  const out = [4, 5].filter((k) => (r?.entryRate?.[k] ?? 0) >= 8).map((k) => r?.top3?.[k]).filter((x): x is number => x !== null && x !== undefined);
  if (out.length && Math.max(...out) >= 50) t.push({ label: "外枠でも絡む", tone: "good", detail: "5〜6コースの3連対率が高い" });
  if (pl && pl[0] + pl[1] + pl[2] >= 45 && pl[1] + pl[2] >= pl[0] * 2.2) t.push({ label: "ヒモ向き", tone: "info", detail: `${course}コースでは1着より2〜3着が多い。3連単の2・3着候補` });
  if (e.locWin !== null && e.natWin !== null && e.locWin > 0) {
    if (e.locWin - e.natWin >= 0.6) t.push({ label: "当地巧者", tone: "good", detail: `当地勝率${e.locWin.toFixed(2)}が全国${e.natWin.toFixed(2)}を上回る` });
    else if (e.locWin - e.natWin <= -0.8) t.push({ label: "当地苦手", tone: "bad", detail: `当地勝率${e.locWin.toFixed(2)}が全国${e.natWin.toFixed(2)}を下回る` });
  }
  if (e.motor2 !== null) {
    if (e.motor2 >= 45) t.push({ label: `モーター強 ${e.motor2.toFixed(0)}%`, tone: "good", detail: "モーター2連対率が高い" });
    else if (e.motor2 <= 28) t.push({ label: `モーター弱 ${e.motor2.toFixed(0)}%`, tone: "bad", detail: "モーター2連対率が低い" });
  }
  if (exRank === 1) t.push({ label: "展示1位", tone: "good", detail: "展示タイムがレース内トップ" });
  else if (exRank === entriesCount) t.push({ label: "展示最下位", tone: "bad", detail: "展示タイムがレース内で最も遅い" });
  if (e.f >= 1) t.push({ label: `F${e.f}持ち`, tone: "bad", detail: "フライング持ちでスタートを慎重に行く可能性" });
  const ranks = e.series.map((s) => parseInt(s.rank)).filter((x) => x >= 1 && x <= 6);
  if (ranks.length >= 3) {
    const m = mean(ranks);
    if (m <= 2.5) t.push({ label: "今節好調", tone: "good", detail: `今節平均着順${m.toFixed(1)}` });
    else if (m >= 4.5) t.push({ label: "今節不調", tone: "bad", detail: `今節平均着順${m.toFixed(1)}` });
  }
  return t;
}


// ---------- model core (shared with backtest) ----------
export type Params = {
  wWr: number; wLoc: number; wMotor: number; wSt: number; wEx: number; wCourse: number; wF: number;
  scale: number; s2: number; s3: number; blend: number; blendWin: number;
};
export let PARAMS: Params = { wWr: 0.45, wLoc: 0.12, wMotor: 0.012, wSt: -6, wEx: -4.5, wCourse: 0.4, wF: -0.08, scale: 1.1, s2: 0.7, s3: 0.55, blend: 0.9, blendWin: 0.7 };
export function setParams(p: Partial<Params>) { PARAMS = { ...PARAMS, ...p }; }

export type BoatFeat = {
  lane: number; course: number; p1: number; p12: number; p123: number;
  dWr: number; dLoc: number; dM2: number; dSt: number; dEx: number | null; courseLR: number | null; f: number;
};
export function buildFeatures(
  E: B.Entry[], courseOf: (lane: number) => number, exTimes: (number | null)[], racers: (B.RacerCourse | null)[], vstats: B.VenueStats,
): BoatFeat[] {
  const wr = E.map((e) => e.natWin ?? 4.5);
  const loc = E.map((e, i) => (e.locWin && e.locWin > 0 ? e.locWin : wr[i]));
  const m2 = E.map((e) => e.motor2 ?? 33);
  const st = E.map((e, i) => {
    const c = courseOf(e.lane);
    const v = racers[i]?.courseST?.[c - 1] ?? e.avgST ?? 0.17;
    return v > 0 && v < 0.4 ? v : 0.17;
  });
  const exAvail = exTimes.every((x) => x !== null && x > 0);
  const mWr = mean(wr), mLoc = mean(loc), mM2 = mean(m2), mSt = mean(st);
  const mEx = exAvail ? mean(exTimes as number[]) : 0;
  return E.map((e, i) => {
    const c = courseOf(e.lane);
    const pl = vstats.place[c - 1];
    const r = racers[i];
    const rc = r?.place?.[c - 1];
    let courseLR: number | null = null;
    if (rc) {
      const starts = r?.season?.starts ?? 120;
      const n = ((r?.entryRate?.[c - 1] ?? 0) / 100) * starts;
      const shrunk = (rc[0] * n + NAT_C1[c - 1] * 10) / (n + 10);
      courseLR = Math.log(Math.max(0.5, shrunk) / NAT_C1[c - 1]);
    }
    return {
      lane: e.lane, course: c,
      p1: Math.max(0.5, pl[0]), p12: Math.max(1, pl[0] + pl[1]), p123: Math.max(1, pl[0] + pl[1] + pl[2]),
      dWr: wr[i] - mWr, dLoc: loc[i] - mLoc, dM2: m2[i] - mM2,
      dSt: st[i] - mSt, dEx: exAvail ? (exTimes[i] as number) - mEx : null, courseLR, f: e.f,
    };
  });
}

export function computeModelP(F: BoatFeat[], P: Params) {
  const adj: number[] = [];
  const factorList: { label: string; value: number }[][] = [];
  for (const b of F) {
    const f: { label: string; value: number }[] = [];
    f.push({ label: "全国勝率", value: P.wWr * b.dWr });
    f.push({ label: "当地勝率", value: P.wLoc * b.dLoc });
    f.push({ label: "モーター", value: P.wMotor * b.dM2 });
    f.push({ label: "スタート", value: Math.max(-0.4, Math.min(0.4, P.wSt * b.dSt)) });
    if (b.dEx !== null) f.push({ label: "展示タイム", value: Math.max(-0.6, Math.min(0.6, P.wEx * b.dEx)) });
    if (b.courseLR !== null) f.push({ label: `${b.course}コース実績`, value: P.wCourse * b.courseLR });
    if (b.f >= 1) f.push({ label: "F持ち", value: P.wF * b.f });
    adj.push(P.scale * f.reduce((a, x) => a + x.value, 0));
    factorList.push(f);
  }
  const w1 = F.map((b, i) => b.p1 * Math.exp(adj[i]));
  const w2 = F.map((b, i) => b.p12 * Math.exp(P.s2 * adj[i]));
  const w3 = F.map((b, i) => b.p123 * Math.exp(P.s3 * adj[i]));
  const S1 = w1.reduce((a, b) => a + b, 0);
  const modelP: Record<string, number> = {};
  for (const [a, b, c] of PERMS) {
    const pa = w1[a - 1] / S1;
    const s2 = w2.reduce((x, y, k) => (k === a - 1 ? x : x + y), 0);
    const pb = w2[b - 1] / s2;
    const s3 = w3.reduce((x, y, k) => (k === a - 1 || k === b - 1 ? x : x + y), 0);
    modelP[`${a}-${b}-${c}`] = pa * pb * (w3[c - 1] / s3);
  }
  return { modelP, adj, factorList };
}
export { PERMS };

export type Distortion = { bt: "単勝" | "2連複"; combo: string; odds: number; aiProb: number; mixProb: number; ev: number };
export function findDistortions(modelP: Record<string, number>, oddsTan: Record<string, number>, odds2f: Record<string, number>): Distortion[] {
  const out: Distortion[] = [];
  const tan: Record<string, number> = {}; const qu: Record<string, number> = {};
  for (const k in modelP) {
    const [a, b] = k.split("-"); tan[a] = (tan[a] || 0) + modelP[k];
    const q = [a, b].sort().join("-"); qu[q] = (qu[q] || 0) + modelP[k];
  }
  const mk = (od: Record<string, number>) => { const inv: Record<string, number> = {}; let s = 0; for (const c in od) if (od[c] > 0) { inv[c] = 1 / od[c]; s += inv[c]; } for (const c in inv) inv[c] /= s; return inv; };
  if (Object.keys(oddsTan).length >= 5) {
    const m = mk(oddsTan);
    for (const c in oddsTan) { const p = 0.5 * (tan[c] || 0) + 0.5 * (m[c] || 0); const ev = p * oddsTan[c]; if (ev >= 1.5) out.push({ bt: "単勝", combo: c, odds: oddsTan[c], aiProb: tan[c] || 0, mixProb: p, ev }); }
  }
  if (Object.keys(odds2f).length >= 10) {
    const m = mk(odds2f);
    for (const c in odds2f) { const p = 0.7 * (qu[c] || 0) + 0.3 * (m[c] || 0); const ev = p * odds2f[c]; if (p >= 0.05 && ev >= 2.0) out.push({ bt: "2連複", combo: c, odds: odds2f[c], aiProb: qu[c] || 0, mixProb: p, ev }); }
  }
  return out.sort((x, y) => y.ev - x.ev);
}
export type ExEv = { combo: string; odds: number; aiProb: number; mixProb: number; ev: number };
// 3連単の期待値狙い（中穴）: 展示後のみ。混合確率 = AI 30% + オッズ由来 70%、50〜200倍、混合確率1%以上、期待値1.2以上
// 確定オッズでの過去検証（2026年6〜10月・進入は枠番として計算）: 回収率97%（前半95%・後半99%）、1日約24点
export const TRI_W = 0.3, TRI_PMIN = 0.01, TRI_TH = 1.2, TRI_LO = 50, TRI_HI = 200;
function findTriEv(trifecta: Combo[]): ExEv[] {
  const out: ExEv[] = [];
  for (const t of trifecta) {
    if (!t.odds || t.marketProb == null || t.odds < TRI_LO || t.odds > TRI_HI) continue;
    const p = TRI_W * t.modelProb + (1 - TRI_W) * t.marketProb; const ev = p * t.odds;
    if (p >= TRI_PMIN && ev >= TRI_TH) out.push({ combo: t.combo, odds: t.odds, aiProb: t.modelProb, mixProb: p, ev });
  }
  return out.sort((a, b) => b.ev - a.ev);
}
// 2連単の期待値狙い: 混合確率 = AI 50% + オッズ由来 50%、混合確率15%以上かつ 期待値1.2以上（確定オッズでの過去検証の条件）
export const EX_W = 0.5, EX_PMIN = 0.15, EX_TH = 1.2;
function findExEv(exacta: Combo[], odds2: Record<string, number>): ExEv[] {
  const ks = Object.keys(odds2).filter((k) => odds2[k] > 0); if (ks.length < 20) return [];
  let s = 0; for (const k of ks) s += 1 / odds2[k];
  const out: ExEv[] = [];
  for (const e of exacta) {
    const o = odds2[e.combo]; if (!o) continue;
    const mk = 1 / o / s; const p = EX_W * e.modelProb + (1 - EX_W) * mk; const ev = p * o;
    if (p >= EX_PMIN && ev >= EX_TH) out.push({ combo: e.combo, odds: o, aiProb: e.modelProb, mixProb: p, ev });
  }
  return out.sort((a, b) => b.ev - a.ev);
}
export type Manshu = { score: number; tenkai?: { lane: number; prob: number; shape: string; seconds: number[] }[]; picks10?: { combo: string; prob: number; odds: number; estOdds: number }[]; both?: { heads: { lane: number; prob: number }[]; picks: { combo: string; prob: number; odds: number }[] } | null; alt5?: { score: number; tier: "S" | null; picks: { combo: string; prob: number; odds: number }[] } | null; hitProb?: number; arashi?: number; comb?: number; fixedAt?: string; tier: "S" | "A" | null; realOdds: boolean; reasons: string[]; picks: { combo: string; prob: number; odds: number; estOdds: number }[] };
export type BetTip = { key: string; label: string; combos: string[]; prob: number; histRoi: number; histHit: number; highlight: boolean };
const ML_URL = process.env.ML_URL || "http://127.0.0.1:5001/predict";
const numIn = (s: string | undefined | null) => { const m = String(s ?? "").match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
async function mlPredict(
  hd: string, jcd: string, E: B.Entry[], before: B.Before | null, courseOf: (l: number) => number, exTimes: (number | null)[],
  marketP: Record<string, number> | null, odds3?: Record<string, number> | null,
): Promise<{ modelP: Record<string, number>; finalP?: Record<string, number>; factors: { label: string; value: number }[][]; strategies?: BetTip[]; manshu?: Manshu | null; chuana?: Manshu | null } | null> {
  try {
    const body = {
      date: hd, jcd,
      wind: numIn(before?.weather?.wind), wave: numIn(before?.weather?.wave),
      boats: E.map((e, i) => ({
        lane: e.lane, toban: e.toban, course: courseOf(e.lane), ex: exTimes[i], natWin: e.natWin, nat2: e.nat2, locWin: e.locWin, loc2: e.loc2,
        motor2: e.motor2, boat2: e.boat2, cls: e.cls, age: e.age, weight: e.weight, motor: parseInt(e.motorNo) || null,
      })),
      market: marketP ? PERMS.map(([a, b, c]) => marketP[`${a}-${b}-${c}`]) : null,
      odds3: odds3 ? PERMS.map(([a, b, c]) => odds3[`${a}-${b}-${c}`] || 0) : null,
    };
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(ML_URL, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export function blendProbs(modelP: Record<string, number>, marketP: Record<string, number> | null, P: Params) {
  if (!marketP) return modelP;
  const base: Record<string, number> = {};
  const Wb = [0, 0, 0, 0, 0, 0], Wm = [0, 0, 0, 0, 0, 0], Wk = [0, 0, 0, 0, 0, 0];
  for (const [a, b, c] of PERMS) {
    const k = `${a}-${b}-${c}`;
    base[k] = (1 - P.blend) * modelP[k] + P.blend * marketP[k];
    Wb[a - 1] += base[k]; Wm[a - 1] += modelP[k]; Wk[a - 1] += marketP[k];
  }
  const out: Record<string, number> = {};
  let s = 0;
  for (const [a, b, c] of PERMS) {
    const k = `${a}-${b}-${c}`;
    const wt = (1 - P.blendWin) * Wm[a - 1] + P.blendWin * Wk[a - 1];
    out[k] = Wb[a - 1] > 0 ? (base[k] * wt) / Wb[a - 1] : 0;
    s += out[k];
  }
  for (const k in out) out[k] /= s;
  return out;
}

export async function analyze(jcd: string, rno: number, hd: string, opts: { withRacers?: boolean } = {}): Promise<Analysis> {
  const withRacers = opts.withRacers !== false;
  // 速度改善: 出走表が届いた時点で選手データを読み始める／締切後のレースは結果も同時に読み始める
  const cardP = B.getCard(jcd, rno, hd);
  const racersP = cardP.then((card) => withRacers
    ? Promise.all(card.entries.map((e) => B.getRacerCourse(e.toban, false).catch(() => null)))
    : card.entries.map(() => null)).catch(() => [] as any[]);
  const nowEarly = jstNowMin(hd);
  const dlsCached = await Promise.race([B.getDeadlines(jcd, hd).catch(() => [] as (string | null)[]), new Promise<(string | null)[]>((r) => setTimeout(() => r([]), 300))]);
  const dlEarly = dlsCached[rno - 1] ? toMin(dlsCached[rno - 1]!) : null;
  const resultP = (dlEarly !== null && nowEarly >= dlEarly) ? B.getResult(jcd, rno, hd).catch(() => null) : null;
  const [card, before, odds3, odds2, vstats, oddsTan, odds2f] = await Promise.all([
    cardP,
    B.getBefore(jcd, rno, hd).catch(() => null),
    B.getOdds3t(jcd, rno, hd).catch(() => ({} as Record<string, number>)),
    B.getOdds2t(jcd, rno, hd).catch(() => ({} as Record<string, number>)),
    B.getVenueStats(jcd),
    B.getOddsTan(jcd, rno, hd).catch(() => ({} as Record<string, number>)),
    B.getOdds2f(jcd, rno, hd).catch(() => ({} as Record<string, number>)),
  ]);
  if (card.entries.length < 6) throw new Error("出走表が取得できませんでした");
  const racers = await racersP;

  const deadline = card.deadlines[rno - 1] ?? null;
  const now = jstNowMin(hd);
  const dl = deadline ? toMin(deadline) : null;
  let status: Analysis["status"] = "upcoming";
  let result: B.Result | null = null;
  if (dl !== null && now >= dl) {
    status = "closed";
    result = await (resultP ?? B.getResult(jcd, rno, hd).catch(() => null));
    if (result?.finished) status = "finished";
  }

  const E = card.entries;
  const courseOf = (lane: number) => (before?.exCourse && Object.keys(before.exCourse).length === 6 && before.available ? before.exCourse[lane] : lane);
  const exTimes = E.map((e) => before?.exTime?.[e.lane] ?? null);
  const exAvail = exTimes.every((x) => x !== null && x > 0);
  const sortedEx = [...exTimes].filter((x): x is number => x !== null).sort((a, b) => a - b);
  const exRank = (v: number | null) => (exAvail && v !== null ? sortedEx.indexOf(v) + 1 : null);

  const feats = buildFeatures(E, courseOf, exTimes, racers, vstats);
  const { modelP, factorList } = computeModelP(feats, PARAMS);
  const place = vstats.place;
  const oddsAvailable = Object.keys(odds3).length >= 60;
  let marketP: Record<string, number> | null = null;
  if (oddsAvailable) {
    const inv = PERMS.map(([a, b, c]) => { const o = odds3[`${a}-${b}-${c}`]; return o ? 1 / o : 0; });
    const s = inv.reduce((x, y) => x + y, 0);
    marketP = {};
    PERMS.forEach(([a, b, c], k) => (marketP![`${a}-${b}-${c}`] = inv[k] / s));
  }
  // hybrid: 2nd/3rd structure mostly from market, winner probability corrected by the model (backtest-tuned)
  let finalP = blendProbs(modelP, marketP, PARAMS);
  let v2Factors: { label: string; value: number }[][] | null = null;
  let mlUsed = false;
  let betTips: BetTip[] = [];
  let manshuOut: Manshu | null = null; let chuanaOut: Manshu | null = null;
  const ml = await mlPredict(hd, jcd, E, before, courseOf, exTimes, marketP, odds3);
  if (ml) {
    mlUsed = true;
    for (const k in ml.modelP) modelP[k] = ml.modelP[k];
    finalP = ml.finalP ?? ml.modelP;
    v2Factors = ml.factors;
    betTips = ml.strategies ?? [];
    manshuOut = ml.manshu ?? null; chuanaOut = ml.chuana ?? null;
  }
  const trifecta: Combo[] = PERMS.map(([a, b, c]) => {
    const k = `${a}-${b}-${c}`;
    const mp = modelP[k];
    const mk = marketP ? marketP[k] : null;
    const prob = finalP[k];
    const o = odds3[k] ?? null;
    return { combo: k, prob, modelProb: mp, marketProb: mk, odds: o, ev: o ? prob * o : null };
  }).sort((x, y) => y.prob - x.prob);

  const exMap: Record<string, { p: number; mp: number; mk: number | null }> = {};
  for (const t of trifecta) {
    const k = t.combo.split("-").slice(0, 2).join("-");
    exMap[k] = exMap[k] || { p: 0, mp: 0, mk: t.marketProb === null ? null : 0 };
    exMap[k].p += t.prob;
    exMap[k].mp += t.modelProb;
    if (exMap[k].mk !== null && t.marketProb !== null) exMap[k].mk! += t.marketProb;
  }
  const exacta: Combo[] = Object.entries(exMap).map(([k, v]) => {
    const o = odds2[k] ?? null;
    return { combo: k, prob: v.p, modelProb: v.mp, marketProb: v.mk, odds: o, ev: o ? v.p * o : null };
  }).sort((x, y) => y.prob - x.prob);

  const winP = [0, 0, 0, 0, 0, 0], top2 = [0, 0, 0, 0, 0, 0], top3 = [0, 0, 0, 0, 0, 0];
  const modelWin = [0, 0, 0, 0, 0, 0];
  const marketWin = [0, 0, 0, 0, 0, 0];
  for (const t of trifecta) {
    const [a, b, c] = t.combo.split("-").map(Number);
    winP[a - 1] += t.prob; top2[a - 1] += t.prob; top2[b - 1] += t.prob;
    top3[a - 1] += t.prob; top3[b - 1] += t.prob; top3[c - 1] += t.prob;
    modelWin[a - 1] += t.modelProb;
    if (t.marketProb !== null) marketWin[a - 1] += t.marketProb;
  }
  const order = [0, 1, 2, 3, 4, 5].sort((x, y) => winP[y] - winP[x]);
  const marks: string[] = [];
  order.forEach((idx, rank) => (marks[idx] = MARKS[rank]));

  const entries: EntryOut[] = E.map((e, i) => ({
    ...e,
    course: courseOf(e.lane),
    exTime: exTimes[i],
    exST: before?.exST?.[e.lane] ?? null,
    tilt: before?.tilt?.[e.lane] ?? null,
    exRank: exRank(exTimes[i]),
    racer: racers[i],
    tags: buildTags(e, courseOf(e.lane), racers[i], exRank(exTimes[i]), E.length),
    winProb: winP[i], top2Prob: top2[i], top3Prob: top3[i],
    modelWin: modelWin[i], marketWin: oddsAvailable ? marketWin[i] : null,
    mark: marks[i],
    factors: v2Factors ? v2Factors[i] : factorList[i],
  }));

  // confidence
  const top6 = trifecta.slice(0, 6).reduce((a, b) => a + b.prob, 0);
  const pw = winP[order[0]];
  let conf = (0.55 * pw + 0.45 * top6) * 118;
  if (oddsAvailable) {
    const mFav = marketWin.indexOf(Math.max(...marketWin));
    const mdFav = modelWin.indexOf(Math.max(...modelWin));
    if (mFav === mdFav && mdFav === order[0]) conf += 4; else conf -= 6;
  } else conf -= 8;
  if (!exAvail) conf -= 3;
  conf = Math.max(5, Math.min(97, conf));
  const confidenceLabel = conf >= 75 ? "鉄板級" : conf >= 62 ? "自信あり" : conf >= 50 ? "やや自信" : conf >= 38 ? "混戦" : "大混戦";

  const main = trifecta.slice(0, 5);
  // 妙味: AI probability clearly above the market-implied probability
  const value = trifecta.filter((t) => t.prob >= 0.015 && t.marketProb && t.prob / t.marketProb >= 1.12 && !main.find((m) => m.combo === t.combo))
    .sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0)).slice(0, 3);

  // comment
  const fav = entries[order[0]], sec = entries[order[1]];
  const comment: string[] = [];
  const favReasons: string[] = [];
  const c1v = place[fav.course - 1][0];
  favReasons.push(`${fav.course}コース（当地1着率${c1v.toFixed(0)}%）`);
  const big = Array.from(new Set([...fav.factors].sort((a, b) => b.value - a.value).filter((f) => f.value > 0.08).map((f) => f.label))).slice(0, 3);
  if (big.length) favReasons.push(`${big.join("・")}が高評価`);
  comment.push(`◎${fav.lane}号艇 ${fav.name}（${fav.cls}）を本命。${favReasons.join("、")}。1着確率は約${(fav.winProb * 100).toFixed(0)}%。`);
  comment.push(`対抗は○${sec.lane}号艇 ${sec.name}。2着以内率 約${(sec.top2Prob * 100).toFixed(0)}%。`);
  const danger = entries.filter((e) => e.course >= 3 && e.course <= 4 && e.tags.some((t) => /攻め型|ST速い|展示1位/.test(t.label)) && e.lane !== fav.lane);
  if (danger.length) comment.push(`注意は${danger.map((d) => `${d.lane}号艇${d.name.split(" ")[0]}`).join("、")}。センターからの攻めがあれば波乱も。`);
  if (value.length) comment.push(`妙味は ${value.map((v) => v.combo).join(" / ")}。オッズの割にAIの評価が高い買い目。`);
  if (!oddsAvailable) comment.push("オッズ未発表のため、期待値は算出できません。");

  return {
    hd, jcd, venue: B.VENUES[jcd] || jcd, rno, raceTitle: card.raceTitle, deadline, status,
    entries, weather: before?.weather ?? null, beforeAvailable: exAvail, oddsAvailable,
    venueStats: { course1st: place.map((p) => p[0]), kimarite: vstats.kimarite, period: vstats.period },
    trifecta, exacta, confidence: Math.round(conf), confidenceLabel, main, value, comment, result, modelKind: mlUsed ? "ml" : "basic", betTips, manshu: manshuOut, chuana: chuanaOut, distortions: status === "upcoming" && mlUsed ? findDistortions(modelP, oddsTan, odds2f) : [],
    exEv: status === "upcoming" && mlUsed ? findExEv(exacta, odds2) : [],
    triEv: status === "upcoming" && mlUsed && exAvail && oddsAvailable ? findTriEv(trifecta) : [],
    updatedAt: new Date().toISOString(),
  };
}

function toMin(hhmm: string): number | null {
  const m = hhmm.match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
}
export function jstNowMin(hd: string): number {
  const today = B.todayHd();
  if (hd > today) return -9999;
  if (hd < today) return 99999;
  const d = B.jstNow();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
export { toMin };

// ---------- v2: extended features (residual on market, backtest-fitted) ----------
export const FEATURE_NAMES = [
  "全国勝率", "全国2連率", "当地勝率", "モーター2連率", "ボート2連率", "コース別ST", "展示タイム", "展示1位", "展示ST",
  "コース1着実績", "コース3連対実績", "コース別ST順", "A1級", "B級", "F持ち", "今節平均着順", "体重", "チルト",
  "風速×1コース", "波高×1コース", "前付け", "年齢",
] as const;

const num = (s: string | undefined | null) => { const m = String(s ?? "").match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
const NAT_TOP3 = [72, 52, 48, 42, 33, 22];

export function extFeatures(
  E: B.Entry[], before: B.Before | null, racers: (B.RacerCourse | null)[], courseOf: (lane: number) => number,
): number[][] {
  const exTimes = E.map((e) => before?.exTime?.[e.lane] ?? null);
  const exAvail = exTimes.every((x) => x !== null && x > 0);
  const exST = E.map((e) => { const v = before?.exST?.[e.lane]; return v === undefined || v === null ? null : v < 0 ? 0 : v; });
  const exSTAvail = exST.every((x) => x !== null);
  const wind = num(before?.weather?.wind), wave = num(before?.weather?.wave);
  const raw = E.map((e, i) => {
    const c = courseOf(e.lane);
    const r = racers[i];
    const n = ((r?.entryRate?.[c - 1] ?? 0) / 100) * 120;
    const rc = r?.place?.[c - 1];
    const c1 = rc ? (rc[0] * n + NAT_C1[c - 1] * 10) / (n + 10) : NAT_C1[c - 1];
    const t3v = r?.top3?.[c - 1];
    const t3 = t3v !== undefined && t3v !== null ? (t3v * n + NAT_TOP3[c - 1] * 10) / (n + 10) : NAT_TOP3[c - 1];
    const st = r?.courseST?.[c - 1] ?? e.avgST ?? 0.17;
    const so = r?.startOrder?.[c - 1] ?? 3.5;
    const ranks = (e.series || []).map((s) => parseInt(String(s.rank))).filter((x) => x >= 1 && x <= 6);
    const form = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 3.5;
    const formShr = (form * ranks.length + 3.5 * 2) / (ranks.length + 2);
    return [
      e.natWin ?? 4.5, e.nat2 ?? 30, e.locWin && e.locWin > 0 ? e.locWin : e.natWin ?? 4.5, e.motor2 ?? 33, e.boat2 ?? 33,
      st > 0 && st < 0.4 ? st : 0.17, exAvail ? (exTimes[i] as number) : 0, 0, exSTAvail ? Math.min(0.4, exST[i] as number) : 0,
      Math.log(Math.max(0.5, c1) / NAT_C1[c - 1]), Math.log(Math.max(1, t3) / NAT_TOP3[c - 1]), so,
      e.cls === "A1" ? 1 : 0, e.cls?.startsWith("B") ? 1 : 0, e.f >= 1 ? 1 : 0, formShr, e.weight ?? 52,
      before?.tilt?.[e.lane] ?? 0, c === 1 ? wind : 0, c === 1 ? wave / 10 : 0, c < e.lane ? 1 : 0, e.age ?? 35,
    ];
  });
  if (exAvail) { const mn = Math.min(...(exTimes as number[])); raw.forEach((x, i) => (x[7] = exTimes[i] === mn ? 1 : 0)); }
  // de-mean within race for continuous features (indices that are relative)
  const rel = [0, 1, 2, 3, 4, 5, 6, 8, 11, 15, 16, 17, 21];
  for (const k of rel) { const m = mean(raw.map((x) => x[k])); raw.forEach((x) => (x[k] -= m)); }
  // clip exhibition time deviation
  raw.forEach((x) => { x[6] = Math.max(-0.3, Math.min(0.3, x[6])); x[8] = Math.max(-0.2, Math.min(0.2, x[8])); });
  return raw;
}

let V2CACHE: V2 | null | undefined;
export function getV2(): V2 | null {
  if (V2CACHE !== undefined) return V2CACHE;
  try {
    const j = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "backtest/model_v2.json"), "utf8"));
    V2CACHE = { beta: j.beta, s2: j.s2, s3: j.s3, gamma: j.gamma, names: j.names };
  } catch { V2CACHE = null; }
  return V2CACHE;
}
export type V2 = { beta: number; s2: number; s3: number; gamma: number[]; names: string[] };
export function v2Probs(X: number[][], marketP: Record<string, number>, v: V2) {
  const u = X.map((x) => x.reduce((a, xi, k) => a + xi * (v.gamma[k] ?? 0), 0));
  const z: Record<string, number> = {};
  let mx = -Infinity;
  for (const [a, b, c] of PERMS) {
    const k = `${a}-${b}-${c}`;
    z[k] = v.beta * Math.log(Math.max(1e-6, marketP[k])) + u[a - 1] + v.s2 * u[b - 1] + v.s3 * u[c - 1];
    mx = Math.max(mx, z[k]);
  }
  let s = 0;
  for (const k in z) { z[k] = Math.exp(z[k] - mx); s += z[k]; }
  for (const k in z) z[k] /= s;
  return { probs: z, u };
}
