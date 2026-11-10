// 頭2艇: 締切前のオッズを土台に、船足（オリジナル展示）・展示タイム・スタート展示・進入・今節の足・朝のAIで1着確率を補正し、
// 1号艇の1着率が市場より低いと見たレース（全レースの約1割）だけ、1号艇以外で1着になりやすい2艇を出す（3連単の買い目は出さない）
import fs from "node:fs";
import path from "node:path";
import * as B from "./boatrace";
import { jstNowMin, toMin } from "./model";
import { ORI_V, oriRaceFeat, grabOne } from "./oriten";

type Model = { features: string[]; w: number[]; mu: number[]; sd: number[]; fill: Record<string, Record<string, number>>; threshold: number };
const M: Model = JSON.parse(fs.readFileSync(path.resolve("server/head2_model.json"), "utf8"));
const DIR = path.resolve("data/head2"); fs.mkdirSync(DIR, { recursive: true });

export type Head2Rec = {
  jcd: string; venue: string; rno: number; deadline: string | null;
  sel: boolean; p1: number; p1mkt: number; ratio: number;
  heads: { lane: number; name: string; p: number; pmkt: number }[];
  firstSeen: string; lastSeen: string; mode?: "live" | "morning";
  result?: { first: number | null; second: number | null; trifecta: string | null; trifectaPay: number | null } | null;
  cands?: string[]; // 朝に決めた買い目16点（頭2艇から始まる3連単・AIの確率順）
  bet?: { at: string; odds: Record<string, number>; buy: string[] } | null; // 締切前のオッズで決めた買い目（30倍以上）
};
export const BET_MIN_ODDS = 0; // オッズ条件なし（朝の16点をすべて買う）
const cache: Record<string, Head2Rec[]> = {};
export function isHead2Race(hd: string, jcd: string, rno: number) { return loadH2(hd).some((x) => x.sel && x.jcd === jcd && x.rno === rno); }
export function loadH2(hd: string): Head2Rec[] {
  if (cache[hd]) return cache[hd];
  try { cache[hd] = JSON.parse(fs.readFileSync(path.join(DIR, `${hd}.json`), "utf8")); } catch { cache[hd] = []; }
  return cache[hd];
}
const saveH2 = (hd: string) => { try { fs.writeFileSync(path.join(DIR, `${hd}.json`), JSON.stringify(cache[hd])); } catch {} };

const KEYS: string[] = (() => { const k: string[] = []; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) if (a !== b && b !== c && a !== c) k.push(`${a}-${b}-${c}`); return k; })();
const nanmean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// 特徴量（backtest/ashi_ds.py と同じ定義）
export function features(inp: { ex: (number | null)[]; st: (number | null)[]; course: (number | null)[]; devs: Record<string, (number | null)[]>; ser: (number | null)[]; pf: (number | null)[] }) {
  const exm = nanmean(inp.ex); const exd = inp.ex.map((v) => (v === null || exm === null ? null : v - exm));
  const out: Record<string, number | null>[] = [];
  for (let i = 0; i < 6; i++) {
    const l = i + 1; const f: Record<string, number | null> = {};
    const d = (a: number | null | undefined, b: number | null | undefined) => (a === null || a === undefined || b === null || b === undefined ? null : a - b);
    f.exd = exd[i]; f.ex_in = i > 0 ? d(exd[i], exd[i - 1]) : null;
    f.st = inp.st[i]; f.st_in = i > 0 ? d(inp.st[i], inp.st[i - 1]) : null;
    const inner = inp.st.slice(0, i).filter((x): x is number => x !== null); f.st_in2 = i > 0 && inner.length && inp.st[i] !== null ? inp.st[i]! - Math.min(...inner) : null;
    f.st_out = i < 5 ? d(inp.st[i], inp.st[i + 1]) : null;
    f.comv = (inp.course[i] ?? l) - l;
    for (const m of ["straight", "turn", "lap", "half"]) { const v = inp.devs[m] ?? []; f[m] = v[i] ?? null; f[m + "_in"] = i > 0 ? d(v[i], v[i - 1]) : null; }
    f.ser = inp.ser[i]; f.pf = inp.pf[i];
    out.push(f);
  }
  return out;
}
export function score(qf: number[], feats: Record<string, number | null>[]) {
  const F = M.features.length; const s: number[] = [];
  for (let i = 0; i < 6; i++) {
    const l = i + 1; const g = l === 1 ? 0 : l <= 3 ? 1 : 2; let v = Math.log(qf[i] + 1e-6);
    for (let gi = 0; gi < 3; gi++) for (let j = 0; j < F; j++) {
      const k = gi * F + j; const c = M.features[j];
      let x = feats[i][c]; if (x === null || x === undefined || !Number.isFinite(x)) x = M.fill[c]?.[String(l)] ?? 0;
      const xv = gi === g ? x : 0; v += ((xv - M.mu[k]) / M.sd[k]) * M.w[k];
    }
    s.push(v);
  }
  const mx = Math.max(...s); const e = s.map((x) => Math.exp(x - mx)); const z = e.reduce((a, b) => a + b, 0); return e.map((x) => x / z);
}
export function marketFirst(odds: Record<string, number>) {
  const q = KEYS.map((k) => { const o = odds[k]; return o && o > 0 ? 1 / o : 0; }); const z = q.reduce((a, b) => a + b, 0) || 1;
  const qf = [0, 0, 0, 0, 0, 0]; KEYS.forEach((k, i) => { qf[+k[0] - 1] += q[i] / z; });
  return { qf, n: KEYS.filter((k) => odds[k] > 0).length };
}

// 朝の予想（固定）の1着率を使う
let pfOf: (hd: string, jcd: string, rno: number) => { pf: (number | null)[]; names: string[] } | null = () => null;
export function setPfSource(f: typeof pfOf) { pfOf = f; }

async function evalRace(hd: string, jcd: string, rno: number) {
  const ori = oriRaceFeat(hd, jcd, rno); if (!ori) return null;
  const [b, odds] = await Promise.all([B.getBefore(jcd, rno, hd).catch(() => null), B.getOdds3t(jcd, rno, hd).catch(() => ({} as Record<string, number>))]);
  if (!b) return null;
  const { qf, n } = marketFirst(odds); if (n < 110) return null;
  const L = [1, 2, 3, 4, 5, 6];
  const ex = L.map((l) => (b.exTime[l] && b.exTime[l]! > 0 ? b.exTime[l]! : null));
  if (ex.filter((x) => x !== null).length < 4) return null;
  const st = L.map((l) => (typeof b.exST[l] === "number" ? b.exST[l]! : null));
  const course = L.map((l) => b.exCourse[l] ?? null);
  const pfx = pfOf(hd, jcd, rno);
  const P = score(qf, features({ ex, st, course, devs: ori.devs, ser: ori.ser, pf: pfx?.pf ?? [null, null, null, null, null, null] }));
  return { P, qf, names: pfx?.names ?? [] };
}

// 10/17からは朝の予想（固定）だけで選ぶ: 朝のAIで1号艇の1着率が21%以下のレース（全場）で、1号艇以外で1着率が高い2艇
// 検証（6〜10月・全場999レース）: 1号艇が負け85%、頭2艇のどちらかが1着63.5%（締切直前のオッズで選ぶ方式とほぼ同じ）
export const MORNING_FROM = "20261017"; const TH_M = 0.21;
type PlanRace = { jcd: string; venue: string; rno: number; deadline: string | null; addedAt: string; h2c?: string[] | null; entries: { lane: number; name: string; winProb: number }[] };
let planOf: (hd: string) => PlanRace[] | null = () => null;
export function setPlanSource(f: typeof planOf) { planOf = f; }
export function morningBuild(hd: string, xs: Head2Rec[]) {
  const items = planOf(hd); if (!items) return false; let ch = false;
  for (const it of items) {
    if (xs.find((x) => x.jcd === it.jcd && x.rno === it.rno)) continue;
    const dl = it.deadline ? toMin(it.deadline) : null; if (dl === null) continue;
    const a = new Date(new Date(it.addedAt).getTime() + 9 * 3600_000); const ah = a.toISOString().slice(0, 10).replace(/-/g, "");
    if (!(ah < hd || (ah === hd && a.getUTCHours() * 60 + a.getUTCMinutes() < dl))) continue; // 締切前に決まっていた予想だけ
    const e1 = it.entries.find((e) => e.lane === 1); if (!e1 || it.entries.length < 6 || e1.winProb > TH_M) continue;
    const heads = it.entries.filter((e) => e.lane !== 1).sort((a, b) => b.winProb - a.winProb).slice(0, 2).map((e) => ({ lane: e.lane, name: e.name, p: e.winProb, pmkt: -1 }));
    xs.push({ jcd: it.jcd, venue: it.venue, rno: it.rno, deadline: it.deadline, sel: true, p1: e1.winProb, p1mkt: -1, ratio: -1, heads, firstSeen: it.addedAt, lastSeen: it.addedAt, mode: "morning", ...(it.h2c?.length ? { cands: it.h2c } : {}) }); ch = true;
  }
  return ch;
}

let busy = false;
export async function head2Tick() {
  if (busy) return; busy = true;
  try {
    const hd = B.todayHd(); const now = jstNowMin(hd); const xs = loadH2(hd); let ch = false;
    if (hd >= MORNING_FROM) {
      ch = morningBuild(hd, xs);
      // 朝の頭2艇に出したレースだけ、6場以外でも船足（オリジナル展示）を展示の後に取りに行く（予想は変えない）
      for (const x of xs) { const m = toMin(x.deadline || ""); if (m === null || ORI_V[x.jcd] || now < m - 25 || now > m + 60) continue; await grabOne(x.jcd, hd, x.rno, now > m + 30).catch(() => false); }
      // 締切8分前〜1分前のオッズを記録（買い目は朝の16点のまま）
      for (const x of xs) {
        const m = toMin(x.deadline || ""); if (m === null || !x.cands?.length || x.bet || m - now > 8 || m - now < 1) continue;
        const o = await B.getOdds3t(x.jcd, x.rno, hd).catch(() => ({} as Record<string, number>)); if (!Object.keys(o).length) continue;
        const odds: Record<string, number> = {}; for (const c of x.cands) if (o[c]) odds[c] = o[c];
        x.bet = { at: new Date().toISOString(), odds, buy: x.cands.filter((c) => (o[c] ?? 0) >= BET_MIN_ODDS) }; ch = true;
      }
    }
    const venues = hd >= MORNING_FROM ? [] : (await B.getVenues(hd).catch(() => [] as any[])).filter((v: any) => ORI_V[v.jcd]);
    for (const v of venues) {
      const dls = await B.getDeadlines(v.jcd, hd).catch(() => [] as (string | null)[]);
      await Promise.all(dls.map(async (dl, i) => {
        const m = dl ? toMin(dl) : null; if (m === null || !(m - now <= 20 && m - now > 0)) return;
        const r = await evalRace(hd, v.jcd, i + 1).catch(() => null); if (!r) return;
        const p1 = r.P[0], p1mkt = r.qf[0], ratio = p1mkt > 0 ? p1 / p1mkt : 1;
        const heads = [1, 2, 3, 4, 5].map((j) => ({ lane: j + 1, name: r.names[j] ?? "", p: r.P[j], pmkt: r.qf[j] })).sort((a, b) => b.p - a.p).slice(0, 2);
        const t = new Date().toISOString(); const old = xs.find((x) => x.jcd === v.jcd && x.rno === i + 1);
        const rec: Head2Rec = { jcd: v.jcd, venue: ORI_V[v.jcd], rno: i + 1, deadline: dl, sel: ratio < M.threshold, p1, p1mkt, ratio, heads, firstSeen: old?.firstSeen ?? t, lastSeen: t };
        if (old) Object.assign(old, rec); else xs.push(rec); ch = true;
      }));
    }
    // 結果
    for (const x of xs) {
      if (x.result?.first || !x.sel || (toMin(x.deadline || "") ?? 9999) + 3 > now) continue;
      const r = await B.getResult(x.jcd, x.rno, hd).catch(() => null);
      if (r?.finished) { x.result = { first: r.order[0] ?? null, second: r.order[1] ?? null, trifecta: r.trifecta, trifectaPay: r.trifectaPay }; ch = true; }
    }
    if (ch) saveH2(hd);
  } catch (e: any) { console.log("head2 error", e?.message); } finally { busy = false; }
}

// 参考: 朝から動かしていたら（締切後に、確定オッズと直前情報で後から計算。正式な記録には入れない）
const retroCache: Record<string, Head2Rec[]> = {}; const retroBusy: Record<string, boolean> = {};
function loadRetro(hd: string): Head2Rec[] {
  if (retroCache[hd]) return retroCache[hd];
  try { retroCache[hd] = JSON.parse(fs.readFileSync(path.join(DIR, `${hd}_retro.json`), "utf8")); } catch { retroCache[hd] = []; }
  return retroCache[hd];
}
export async function head2Retro(hd: string) {
  if (hd >= MORNING_FROM || retroBusy[hd]) return; retroBusy[hd] = true;
  try {
    const now = jstNowMin(hd); const xs = loadRetro(hd); const live = loadH2(hd);
    const venues = (await B.getVenues(hd).catch(() => [] as any[])).filter((v: any) => ORI_V[v.jcd]);
    for (const v of venues) {
      const dls = await B.getDeadlines(v.jcd, hd).catch(() => [] as (string | null)[]);
      await Promise.all(dls.map(async (dl, i) => {
        const m = dl ? toMin(dl) : null; if (m === null || m + 5 > now) return;
        const rno = i + 1; if (xs.find((x) => x.jcd === v.jcd && x.rno === rno) || live.find((x) => x.jcd === v.jcd && x.rno === rno)) return;
        const r = await evalRace(hd, v.jcd, rno).catch(() => null); if (!r) return;
        const res = await B.getResult(v.jcd, rno, hd).catch(() => null); if (!res?.finished) return;
        const p1 = r.P[0], p1mkt = r.qf[0], ratio = p1mkt > 0 ? p1 / p1mkt : 1;
        const heads = [1, 2, 3, 4, 5].map((j) => ({ lane: j + 1, name: r.names[j] ?? "", p: r.P[j], pmkt: r.qf[j] })).sort((a, b) => b.p - a.p).slice(0, 2);
        const t = new Date().toISOString();
        xs.push({ jcd: v.jcd, venue: ORI_V[v.jcd], rno, deadline: dl, sel: ratio < M.threshold, p1, p1mkt, ratio, heads, firstSeen: t, lastSeen: t,
          result: { first: res.order[0] ?? null, second: res.order[1] ?? null, trifecta: res.trifecta, trifectaPay: res.trifectaPay } });
      }));
    }
    retroCache[hd] = xs; fs.writeFileSync(path.join(DIR, `${hd}_retro.json`), JSON.stringify(xs));
  } catch (e: any) { console.log("head2 retro error", e?.message); } finally { retroBusy[hd] = false; }
}

function stats(xs: Head2Rec[]) {
  let n = 0, hit = 0, both = 0, lose1 = 0;
  for (const x of xs) { if (!x.sel || !x.result?.first) continue; n++; const hs = x.heads.map((h) => h.lane); hit += hs.includes(x.result.first) ? 1 : 0; both += x.result.second && hs.includes(x.result.first) && hs.includes(x.result.second) ? 1 : 0; lose1 += x.result.first !== 1 ? 1 : 0; }
  return { n, hit, both, lose1 };
}
function betStats(xs: Head2Rec[]) {
  let n = 0, hit = 0, pts = 0, ret = 0;
  for (const x of xs) { const buy = x.cands ?? []; if (!x.sel || !buy.length || !x.result?.trifecta) continue; n++; pts += buy.length; if (buy.includes(x.result.trifecta)) { hit++; ret += x.result.trifectaPay ?? 0; } }
  return { n, hit, pts, inv: pts * 100, ret };
}
export function head2Resp(hd: string) {
  const xs = loadH2(hd).filter((x) => x.sel).sort((a, b) => (toMin(a.deadline || "") ?? 0) - (toMin(b.deadline || "") ?? 0));
  const files = fs.readdirSync(DIR).filter((f) => /^\d{8}\.json$/.test(f)).sort();
  const allDays = files.map((f) => ({ hd: f.slice(0, 8), ...stats(loadH2(f.slice(0, 8))) })).filter((d) => d.n > 0);
  const sum = (ds: typeof allDays) => ds.reduce((a, d) => ({ n: a.n + d.n, hit: a.hit + d.hit, both: a.both + d.both, lose1: a.lose1 + d.lose1 }), { n: 0, hit: 0, both: 0, lose1: 0 });
  const liveDays = allDays.filter((d) => d.hd < MORNING_FROM); const allLive = { days: liveDays, total: sum(liveDays) };
  const days = hd >= MORNING_FROM ? allDays.filter((d) => d.hd >= MORNING_FROM) : liveDays;
  const total = days.reduce((a, d) => ({ n: a.n + d.n, hit: a.hit + d.hit, both: a.both + d.both, lose1: a.lose1 + d.lose1 }), { n: 0, hit: 0, both: 0, lose1: 0 });
  const retro = loadRetro(hd).map((x) => ({ ...x, sel: x.ratio < M.threshold })).filter((x) => x.sel).sort((a, b) => (toMin(a.deadline || "") ?? 0) - (toMin(b.deadline || "") ?? 0));
  return { hd, mode: hd >= MORNING_FROM ? "morning" : "live", morningFrom: MORNING_FROM, threshold: M.threshold, venues: ORI_V, races: xs, today: stats(xs), all: { days, total }, allLive: hd >= MORNING_FROM ? allLive : null, retro, retroStat: stats(retro), betMin: BET_MIN_ODDS, betToday: betStats(xs), betAll: (() => { const ds = files.map((f) => ({ hd: f.slice(0, 8), ...betStats(loadH2(f.slice(0, 8))) })).filter((d) => d.n > 0); return { days: ds, total: ds.reduce((a, d) => ({ n: a.n + d.n, hit: a.hit + d.hit, pts: a.pts + d.pts, inv: a.inv + d.inv, ret: a.ret + d.ret }), { n: 0, hit: 0, pts: 0, inv: 0, ret: 0 }) }; })() };
}
