import path from "node:path";
import type { Express } from "express";
import type { Server } from "node:http";
import * as cheerio from "cheerio";
import fs from "node:fs";
import { storage } from "./storage";
import * as B from "./boatrace";
import { analyze, jstNowMin, toMin, type Analysis } from "./model";
import { oriTick, getAshi, getVenueAshi, ORI_V } from "./oriten";
import { head2Tick, head2Resp, setPfSource, head2Retro, setPlanSource, isHead2Race, loadH2 } from "./head2";
setInterval(() => B.runBg(oriTick).catch(() => {}), 3 * 60_000);
setTimeout(() => B.runBg(oriTick).catch(() => {}), 20_000);


import { insertMyBetSchema, insertMyRaceSchema } from "@shared/schema";

// ---------- analysis cache ----------
const anaCache = new Map<string, { at: number; data: Analysis }>();
const anaInflight = new Map<string, Promise<Analysis>>();
// 終わったレースの分析はディスクにも保存（サーバー再起動後もすぐ開ける）
const ANA_DIR = path.resolve("data/anacache"); fs.mkdirSync(ANA_DIR, { recursive: true });
function anaDiskGet(key: string): Analysis | null { try { return JSON.parse(fs.readFileSync(path.join(ANA_DIR, `${key}.json`), "utf8")); } catch { return null; } }
function anaDiskPut(key: string, a: Analysis) { if (a.status === "finished" && a.result?.finished) { try { fs.writeFileSync(path.join(ANA_DIR, `${key}.json`), JSON.stringify(a)); } catch {} } }
async function getAnalysis(jcd: string, rno: number, hd: string, maxAgeMs = 60_000): Promise<Analysis> {
  const key = `${hd}-${jcd}-${rno}`;
  if (!anaCache.has(key) && maxAgeMs > 0) { const d = anaDiskGet(key); if (d) anaCache.set(key, { at: Date.now(), data: d }); }
  const c = anaCache.get(key);
  if (c && Date.now() - c.at < maxAgeMs) return c.data;
  // finished races never change: keep them as long as the server runs (unless a fresh reload is requested)
  if (c && maxAgeMs > 0 && c.data.status === "finished" && c.data.result?.finished) return c.data;
  const run = () => {
    let p = anaInflight.get(key);
    if (!p) {
      p = analyze(jcd, rno, hd).then((data) => { anaCache.set(key, { at: Date.now(), data }); anaDiskPut(key, data); return data; }).finally(() => anaInflight.delete(key));
      anaInflight.set(key, p);
    }
    return p;
  };
  // serve a cached copy instantly (up to 30 min old) and refresh in the background;
  // the race page re-polls every 60s, so the fresh version appears shortly after
  if (c && maxAgeMs > 0 && Date.now() - c.at < 30 * 60_000) { run().catch(() => {}); return c.data; }
  return run();
}

function hdOffset(days: number): string {
  const d = new Date(Date.now() + 9 * 3600_000 + days * 86400_000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ---------- venues with schedules ----------
async function venuesWithSchedule(hd: string) {
  const venues = await B.getVenues(hd);
  const withDl = await Promise.all(
    venues.map(async (v) => {
      const deadlines = await B.getDeadlines(v.jcd, hd).catch(() => [] as (string | null)[]);
      const now = jstNowMin(hd);
      const nextIdx = deadlines.findIndex((d) => d && (toMin(d) ?? 0) > now);
      return { ...v, deadlines, nextRace: nextIdx >= 0 ? nextIdx + 1 : null, finished: v.finished || (deadlines.length > 0 && nextIdx < 0) };
    }),
  );
  return withDl;
}

// ---------- AI picks background job ----------
type PickSummary = {
  hd: string; jcd: string; venue: string; rno: number; raceTitle: string; deadline: string | null;
  confidence: number; confidenceLabel: string;
  entries: { lane: number; name: string; cls: string; mark: string; winProb: number; tags: string[] }[];
  main: Analysis["main"]; value: Analysis["value"]; comment: string[];
  oddsAvailable: boolean; beforeAvailable: boolean; betTips?: Analysis["betTips"]; distortions?: Analysis["distortions"]; manshu?: Analysis["manshu"]; chuana?: Analysis["chuana"];
  hon?: { fav: number; favProb: number; qu: { combo: string; prob: number }[] } | null;
  exEv?: Analysis["exEv"];
  triEv?: Analysis["triEv"];
  himo?: Himo | null;
  h2c?: string[] | null;
};
// 今節好調の紐: 朝のAIで1号艇1着率80%以上のレースで、今節3走以上・平均着順2.5以内の選手（2〜6号艇）を2・3着に
type Himo = { lanes: { lane: number; n: number; avg: number }[]; picks: string[] };
const himoOf = (a: Analysis): Himo | null => {
  const e1 = a.entries.find((e) => e.lane === 1); if (!e1 || e1.winProb < 0.8) return null;
  const good = a.entries.filter((e) => e.lane >= 2).map((e) => { const r = (e.series || []).map((x) => parseInt(String(x.rank))).filter((x) => x >= 1 && x <= 6); return { lane: e.lane, n: r.length, avg: r.length ? r.reduce((p, q) => p + q, 0) / r.length : 9 }; }).filter((x) => x.n >= 3 && x.avg <= 2.5);
  if (good.length < 2 || good.length > 3) return null; // 好調4人以上は点数が多すぎるので対象外（最大6点）
  const picks: string[] = []; for (const b of good) for (const c of good) if (b.lane !== c.lane) picks.push(`1-${b.lane}-${c.lane}`);
  return { lanes: good.map((g) => ({ ...g, avg: Math.round(g.avg * 100) / 100 })), picks };
};
const honOf = (a: Analysis) => {
  const fav = [...a.entries].sort((x, y) => y.winProb - x.winProb)[0];
  const q = new Map<string, number>();
  for (const c of a.trifecta) { const d = c.combo.split("-").slice(0, 2).map(Number).sort(); const k = d.join("-"); q.set(k, (q.get(k) ?? 0) + c.prob); }
  const qu = Array.from(q.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([combo, prob]) => ({ combo, prob }));
  return fav ? { fav: fav.lane, favProb: fav.winProb, qu } : null;
};
// 頭2艇の中穴候補: 朝のAIで1号艇1着率が低いレースだけ、頭2艇（1号艇以外の1着率上位2艇）から始まる3連単をAIの確率順に16点
const h2cOf = (a: Analysis): string[] | null => {
  const e1 = a.entries.find((e) => e.lane === 1); if (!e1 || a.entries.length < 6 || e1.winProb > 0.25) return null;
  const heads = a.entries.filter((e) => e.lane !== 1).sort((x, y) => y.winProb - x.winProb).slice(0, 2).map((e) => e.lane);
  return a.trifecta.filter((c) => heads.includes(+c.combo[0])).sort((x, y) => (y.modelProb ?? y.prob) - (x.modelProb ?? x.prob)).slice(0, 16).map((c) => c.combo);
};
const summarize = (a: Analysis): PickSummary => ({
  hd: a.hd, jcd: a.jcd, venue: a.venue, rno: a.rno, raceTitle: a.raceTitle, deadline: a.deadline,
  confidence: a.confidence, confidenceLabel: a.confidenceLabel,
  entries: a.entries.map((e) => ({ lane: e.lane, name: e.name, cls: e.cls, mark: e.mark, winProb: e.winProb, tags: e.tags.slice(0, 3).map((t) => t.label) })),
  hon: honOf(a), exEv: a.exEv ?? [], triEv: a.triEv ?? [], himo: himoOf(a), h2c: h2cOf(a),
  main: a.main, value: a.value, comment: a.comment, betTips: a.betTips, distortions: a.distortions, manshu: a.manshu, chuana: a.chuana, oddsAvailable: a.oddsAvailable, beforeAvailable: a.beforeAvailable,
});

const jobState: Record<string, { running: boolean; done: number; total: number; updatedAt: string | null; ranked: PickSummary[]; error?: string }> = {};
const PICK_N = 5;
const S_TH = 0.947; // AI favourite win probability (morning), top 5% of races
const favP = (p: { entries: { winProb: number }[] }) => Math.max(0, ...p.entries.map((e) => e.winProb));

// ---------- morning plan (fixed for the whole day) ----------
type PlanItem = PickSummary & { tier: "S" | "other"; addedAt: string; late?: boolean; result?: B.Result | null; hit?: boolean; manshuHit?: boolean;
  manshuFinal?: Analysis["manshu"]; manshuFixedAt?: string; chuanaFinal?: Analysis["chuana"]; chuanaHit?: boolean; chuana5Hit?: boolean; chuanaMornHit?: boolean; manshuMornHit?: boolean; chuana5MornHit?: boolean; himoHit?: boolean };
type Plan = { hd: string; createdAt: string; items: PlanItem[] };
const PLAN_DIR = path.resolve("data/plans");
fs.mkdirSync(PLAN_DIR, { recursive: true });
const plans: Record<string, Plan> = {};
function loadPlan(hd: string): Plan | null {
  if (plans[hd]) return plans[hd];
  const f = path.join(PLAN_DIR, `${hd}.json`);
  if (fs.existsSync(f)) { try {
    const p: Plan = JSON.parse(fs.readFileSync(f, "utf8"));
    // tier always follows the morning (fixed) confidence and the current threshold
    for (const it of p.items) it.tier = favP(it) >= S_TH ? "S" : "other";
    plans[hd] = p; return p;
  } catch {} }
  return null;
}
// ---------- 2連単 期待値狙いの記録（締切前に最後に見えた買い目で成績を計算） ----------
const EX_DIR = path.resolve("data/exev"); fs.mkdirSync(EX_DIR, { recursive: true });
type ExRec = { jcd: string; rno: number; venue: string; deadline: string | null; combos: { combo: string; odds: number; ev: number; mixProb: number }[]; firstSeen: string; lastSeen: string; result?: { exacta: string | null; exactaPay: number | null } | null };
const exCache: Record<string, ExRec[]> = {};
function loadEx(hd: string): ExRec[] {
  if (exCache[hd]) return exCache[hd];
  const f = path.join(EX_DIR, `${hd}.json`);
  try { exCache[hd] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []; } catch { exCache[hd] = []; }
  return exCache[hd];
}
function saveEx(hd: string, xs: ExRec[]) { exCache[hd] = xs; fs.writeFileSync(path.join(EX_DIR, `${hd}.json`), JSON.stringify(xs)); }
function updateEx(hd: string, ranked: PickSummary[]) {
  const xs = loadEx(hd); const now = new Date().toISOString(); const nowMin = jstNowMin(hd); let ch = false;
  for (const p of ranked) {
    const dl = toMin(p.deadline || "") ?? 0; if (dl <= nowMin) continue;
    const combos = (p.exEv ?? []).map((e) => ({ combo: e.combo, odds: e.odds, ev: e.ev, mixProb: e.mixProb }));
    const r = xs.find((x) => x.jcd === p.jcd && x.rno === p.rno);
    if (combos.length) { if (r) { r.combos = combos; r.lastSeen = now; } else xs.push({ jcd: p.jcd, rno: p.rno, venue: p.venue, deadline: p.deadline, combos, firstSeen: now, lastSeen: now }); ch = true; }
    else if (r && !r.result) { r.combos = []; r.lastSeen = now; ch = true; } // 直前で条件から外れたら買わない
  }
  if (ch) saveEx(hd, xs);
}
async function settleEx(hd: string) {
  const xs = loadEx(hd); const nowMin = jstNowMin(hd); let ch = false;
  for (const x of xs) {
    if (x.result || !x.combos.length || (toMin(x.deadline || "") ?? 9999) + 3 > nowMin) continue;
    const r = await B.getResult(x.jcd, x.rno, hd).catch(() => null);
    if (r?.finished) { x.result = { exacta: r.exacta, exactaPay: r.exactaPay }; ch = true; }
  }
  if (ch) saveEx(hd, xs);
}
function exStats(xs: ExRec[]) {
  let bets = 0, hits = 0, ret = 0, races = 0, hitRaces = 0;
  for (const x of xs) { if (!x.result || !x.combos.length) continue; races++; bets += x.combos.length; const h = x.combos.some((c) => c.combo === x.result!.exacta); if (h) { hits++; hitRaces++; ret += x.result.exactaPay ?? 0; } }
  return { races, bets, hits, inv: bets * 100, ret };
}
function exAll() {
  const fs_ = fs.readdirSync(EX_DIR).filter((f) => f.endsWith(".json")).sort();
  const days = fs_.map((f) => { const hd = f.slice(0, 8); return { hd, ...exStats(loadEx(hd)) }; }).filter((d) => d.races > 0);
  const t = days.reduce((a, d) => ({ races: a.races + d.races, bets: a.bets + d.bets, hits: a.hits + d.hits, inv: a.inv + d.inv, ret: a.ret + d.ret }), { races: 0, bets: 0, hits: 0, inv: 0, ret: 0 });
  return { days, total: t };
}
// ---------- 3連単 期待値狙い（中穴）の記録（result.exacta/exactaPay に3連単の着順と払戻を入れる）（締切前に最後に見えた買い目で成績を計算） ----------
const TRI_DIR = path.resolve("data/triev"); fs.mkdirSync(TRI_DIR, { recursive: true });
type TriRec = { jcd: string; rno: number; venue: string; deadline: string | null; combos: { combo: string; odds: number; ev: number; mixProb: number }[]; firstSeen: string; lastSeen: string; result?: { exacta: string | null; exactaPay: number | null } | null };
const triCache: Record<string, TriRec[]> = {};
function loadTri(hd: string): TriRec[] {
  if (triCache[hd]) return triCache[hd];
  const f = path.join(TRI_DIR, `${hd}.json`);
  try { triCache[hd] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []; } catch { triCache[hd] = []; }
  return triCache[hd];
}
function saveTri(hd: string, xs: TriRec[]) { triCache[hd] = xs; fs.writeFileSync(path.join(TRI_DIR, `${hd}.json`), JSON.stringify(xs)); }
function updateTri(hd: string, ranked: PickSummary[]) {
  const xs = loadTri(hd); const now = new Date().toISOString(); const nowMin = jstNowMin(hd); let ch = false;
  for (const p of ranked) {
    const dl = toMin(p.deadline || "") ?? 0; if (dl <= nowMin) continue;
    const combos = (p.triEv ?? []).map((e) => ({ combo: e.combo, odds: e.odds, ev: e.ev, mixProb: e.mixProb }));
    const r = xs.find((x) => x.jcd === p.jcd && x.rno === p.rno);
    if (combos.length) { if (r) { r.combos = combos; r.lastSeen = now; } else xs.push({ jcd: p.jcd, rno: p.rno, venue: p.venue, deadline: p.deadline, combos, firstSeen: now, lastSeen: now }); ch = true; }
    else if (r && !r.result) { r.combos = []; r.lastSeen = now; ch = true; } // 直前で条件から外れたら買わない
  }
  if (ch) saveTri(hd, xs);
}
async function settleTri(hd: string) {
  const xs = loadTri(hd); const nowMin = jstNowMin(hd); let ch = false;
  for (const x of xs) {
    if (x.result || !x.combos.length || (toMin(x.deadline || "") ?? 9999) + 3 > nowMin) continue;
    const r = await B.getResult(x.jcd, x.rno, hd).catch(() => null);
    if (r?.finished) { x.result = { exacta: r.trifecta, exactaPay: r.trifectaPay }; ch = true; }
  }
  if (ch) saveTri(hd, xs);
}
function triStats(xs: TriRec[]) {
  let bets = 0, hits = 0, ret = 0, races = 0, hitRaces = 0;
  for (const x of xs) { if (!x.result || !x.combos.length) continue; races++; bets += x.combos.length; const h = x.combos.some((c) => c.combo === x.result!.exacta); if (h) { hits++; hitRaces++; ret += x.result.exactaPay ?? 0; } }
  return { races, bets, hits, inv: bets * 100, ret };
}
function triAll() {
  const fs_ = fs.readdirSync(TRI_DIR).filter((f) => f.endsWith(".json")).sort();
  const days = fs_.map((f) => { const hd = f.slice(0, 8); return { hd, ...triStats(loadTri(hd)) }; }).filter((d) => d.races > 0);
  const t = days.reduce((a, d) => ({ races: a.races + d.races, bets: a.bets + d.bets, hits: a.hits + d.hits, inv: a.inv + d.inv, ret: a.ret + d.ret }), { races: 0, bets: 0, hits: 0, inv: 0, ret: 0 });
  return { days, total: t };
}

// ---------- 展示タイム監視（桐生・戸田・江戸川・平和島・鳴門・福岡）: 3・4・5号艇が展示タイム1番ならお知らせ ----------
const TENJI_V: Record<string, string> = { "01": "桐生", "02": "戸田", "03": "江戸川", "04": "平和島", "14": "鳴門", "22": "福岡", "12": "住之江" };
const TENJI_DIR = path.resolve("data/tenji"); fs.mkdirSync(TENJI_DIR, { recursive: true });
type TenjiRec = { jcd: string; venue: string; rno: number; deadline: string | null; ex: (number | null)[] | null; st: (number | null)[] | null; course: number[] | null; best: number[]; center: boolean; at: string | null; tried?: boolean; pushed?: boolean; result?: { trifecta: string | null; trifectaPay: number | null; first: number | null } | null };
const tenjiCache: Record<string, TenjiRec[]> = {};
function loadTenji(hd: string): TenjiRec[] {
  if (tenjiCache[hd]) return tenjiCache[hd];
  const f = path.join(TENJI_DIR, `${hd}.json`);
  try { tenjiCache[hd] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []; } catch { tenjiCache[hd] = []; }
  return tenjiCache[hd];
}
function saveTenji(hd: string, xs: TenjiRec[]) { tenjiCache[hd] = xs; fs.writeFileSync(path.join(TENJI_DIR, `${hd}.json`), JSON.stringify(xs)); }
let tenjiUpdatedAt: string | null = null; let tenjiBusy = false;
// スマホ通知（無料の ntfy.sh）。チャンネル名は data/ntfy_topic.txt
const NTFY_TOPIC = (() => { try { return fs.readFileSync("data/ntfy_topic.txt", "utf8").trim(); } catch { return ""; } })();
const APP_URL = process.env.APP_URL || "https://www.perplexity.ai/computer/a/jing-ting-airaho-YInMlghkRPe8ipYp2GD3NQ";
async function pushTenji(x: TenjiRec) {
  if (!NTFY_TOPIC || !x.ex) return false;
  const lanes = x.best.filter((l) => l >= 3 && l <= 5);
  const times = x.ex.map((t, i) => `${i + 1}号艇 ${t ? t.toFixed(2) : "-"}${x.best.includes(i + 1) ? "（1番）" : ""}`).join("\n");
  // GitHub側が先に送っていれば送らない（ntfyの履歴で確認）
  try {
    const h = await fetch(`https://ntfy.sh/${NTFY_TOPIC}/json?poll=1&since=12h`, { signal: AbortSignal.timeout(15000) });
    const head = `${x.venue}${x.rno}R 展示1番`;
    if ((await h.text()).split("\n").filter(Boolean).some((l) => { try { return (JSON.parse(l).title || "").startsWith(head); } catch { return false; } })) return true;
  } catch {}
  try {
    const r = await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      topic: NTFY_TOPIC, priority: 4, tags: ["boat"], click: APP_URL,
      title: `${x.venue}${x.rno}R 展示1番は${lanes.join("・")}号艇（締切${x.deadline}）`,
      message: times,
    }) });
    return r.ok;
  } catch { return false; }
}
async function tenjiTick() {
  if (tenjiBusy) return; tenjiBusy = true;
  try {
    const hd = B.todayHd(); const now = jstNowMin(hd); const xs = loadTenji(hd); let ch = false;
    const venues = (await B.getVenues(hd).catch(() => [] as any[])).filter((v: any) => TENJI_V[v.jcd]);
    for (const v of venues) {
      const dls = await B.getDeadlines(v.jcd, hd).catch(() => [] as (string | null)[]);
      dls.forEach((d, i) => {
        if (!xs.find((x) => x.jcd === v.jcd && x.rno === i + 1)) { xs.push({ jcd: v.jcd, venue: TENJI_V[v.jcd], rno: i + 1, deadline: d, ex: null, st: null, course: null, best: [], center: false, at: null }); ch = true; }
      });
    }
    // 締切35分前〜締切の間で、展示タイムがまだ揃っていないレースを確認
    const due = xs.filter((x) => { const m = toMin(x.deadline || "") ?? -1; return (m - now <= 35 && m - now >= -1 && !(x.ex && x.ex.every((t) => t))) || (m - now < -1 && !x.ex && !x.tried); });
    due.forEach((x) => { if ((toMin(x.deadline || "") ?? 0) < now) x.tried = true; });
    await Promise.all(due.map(async (x) => {
      const b = await B.getBefore(x.jcd, x.rno, hd).catch(() => null);
      if (!b) return;
      const ex = [1, 2, 3, 4, 5, 6].map((l) => b.exTime[l] ?? null);
      if (!ex.some((t) => t)) return;
      x.ex = ex; x.st = [1, 2, 3, 4, 5, 6].map((l) => b.exST[l] ?? null); x.course = [1, 2, 3, 4, 5, 6].map((l) => b.exCourse[l] ?? l);
      const vals = ex.filter((t): t is number => !!t); const mn = Math.min(...vals);
      x.best = vals.length >= 5 ? ex.map((t, i) => (t === mn ? i + 1 : 0)).filter(Boolean) : [];
      x.center = x.best.some((l) => l >= 3 && l <= 5); x.at = new Date().toISOString(); ch = true;
      if (x.center && !x.pushed && (toMin(x.deadline || "") ?? 0) > jstNowMin(hd) && x.ex.every((t) => t)) x.pushed = await pushTenji(x);
    }));
    // 結果（センター1番のレースだけ）
    for (const x of xs) {
      if (!x.center || x.result || (toMin(x.deadline || "") ?? 9999) + 3 > now) continue;
      const r = await B.getResult(x.jcd, x.rno, hd).catch(() => null);
      if (r?.finished) { x.result = { trifecta: r.trifecta, trifectaPay: r.trifectaPay, first: r.trifecta ? Number(r.trifecta.split("-")[0]) : null }; ch = true; }
    }
    if (ch) saveTenji(hd, xs);
    tenjiUpdatedAt = new Date().toISOString();
  } catch (e: any) { console.log("tenji error", e?.message); } finally { tenjiBusy = false; }
}
setInterval(() => B.runBg(tenjiTick).catch(() => {}), 60_000);
// 頭2艇: 朝の予想（固定）の1着率を使う
setPfSource((hd, jcd, rno) => { const it = loadPlan(hd)?.items.find((x) => x.jcd === jcd && x.rno === rno); if (!it) return null; return { pf: [1, 2, 3, 4, 5, 6].map((l) => it.entries.find((e) => e.lane === l)?.winProb ?? null), names: [1, 2, 3, 4, 5, 6].map((l) => it.entries.find((e) => e.lane === l)?.name ?? "") }; });
setPlanSource((hd) => { const p = loadPlan(hd); if (!p) return null; return p.items.map((it) => ({ jcd: it.jcd, venue: it.venue, rno: it.rno, deadline: it.deadline, addedAt: it.addedAt, h2c: it.h2c ?? null, entries: it.entries.map((e) => ({ lane: e.lane, name: e.name, winProb: e.winProb })) })); });
setInterval(() => B.runBg(head2Tick).catch(() => {}), 2 * 60_000);
setTimeout(() => B.runBg(tenjiTick).catch(() => {}), 5_000);
function tenjiAll() {
  const out: { races: number; win: number; wins: Record<string, number> } = { races: 0, win: 0, wins: {} };
  for (const f of fs.readdirSync(TENJI_DIR).filter((f) => f.endsWith(".json"))) for (const x of loadTenji(f.slice(0, 8))) {
    if (!x.center || !x.result?.first) continue; out.races++;
    if (x.best.includes(x.result.first)) out.win++;
    const k = String(x.result.first); out.wins[k] = (out.wins[k] ?? 0) + 1;
  }
  return out;
}

// ---------- 先読み: 今日の終わったレースと、夕方以降は翌日のレースを裏で分析しておく ----------
let warmBusy = false;
async function warmTick() {
  if (warmBusy) return; warmBusy = true;
  try {
    const hd = B.todayHd(); const now = jstNowMin(hd);
    const targets: { hd: string; jcd: string; rno: number }[] = [];
    const vs = await venuesWithSchedule(hd).catch(() => [] as any[]);
    for (const v of vs) (v.deadlines as (string | null)[]).forEach((d, i) => {
      const m = d ? toMin(d) : null; const key = `${hd}-${v.jcd}-${i + 1}`;
      if (m !== null && now >= m + 3) { const c = anaCache.get(key); if (!(c && c.data.status === "finished") && !fs.existsSync(path.join(ANA_DIR, `${key}.json`))) targets.push({ hd, jcd: v.jcd, rno: i + 1 }); }
    });
    if (now >= 18 * 60) {
      const t = hdOffset(1);
      const tv = await B.getVenues(t).catch(() => [] as any[]);
      for (const v of tv) for (let r = 1; r <= 12; r++) { const c = anaCache.get(`${t}-${v.jcd}-${r}`); if (!c || Date.now() - c.at > 3 * 3600_000) targets.push({ hd: t, jcd: v.jcd, rno: r }); }
    }
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => { while (i < targets.length) { const x = targets[i++]; await getAnalysis(x.jcd, x.rno, x.hd, 3 * 3600_000).catch(() => {}); } }));
  } catch (e: any) { console.log("warm error", e?.message); } finally { warmBusy = false; }
}
setInterval(() => B.runBg(warmTick).catch(() => {}), 10 * 60_000);
setTimeout(() => B.runBg(warmTick).catch(() => {}), 60_000);

// ---------- お気に入り選手（メモ付き） ----------
const FAV_FILE = path.resolve("data/favorites.json");
type Fav = { toban: string; name: string; cls: string; branch: string; memo: string; addedAt: string; updatedAt: string };
let favs: Fav[] = (() => { try { return JSON.parse(fs.readFileSync(FAV_FILE, "utf8")); } catch { return []; } })();
const saveFavs = () => fs.writeFileSync(FAV_FILE, JSON.stringify(favs, null, 1));
function favAppearances() {
  const set = new Set(favs.map((f) => f.toban)); const out: Record<string, { hd: string; jcd: string; venue: string; rno: number; deadline: string | null; lane: number; status: string; place: number | null }[]> = {};
  const days = new Set([B.todayHd(), hdOffset(1)]);
  for (const [key, c] of Array.from(anaCache.entries())) {
    const hd = key.slice(0, 8); if (!days.has(hd)) continue; const a = c.data;
    for (const e of a.entries) if (set.has(e.toban)) (out[e.toban] ??= []).push({ hd, jcd: a.jcd, venue: a.venue, rno: a.rno, deadline: a.deadline, lane: e.lane, status: a.status, place: a.result?.finished && a.result.order?.length ? (a.result.order.indexOf(e.lane) + 1 || null) : null });
  }
  for (const k in out) out[k].sort((x, y) => (x.hd + (x.deadline ?? "")).localeCompare(y.hd + (y.deadline ?? "")));
  return out;
}

// ---------- 記録開始からの成績（本命S・好調の紐） ----------
type RecDay = { hd: string; n: number; hit: number; inv: number; ret: number };
type RecOut = { from: string | null; days: RecDay[]; total: { n: number; hit: number; inv: number; ret: number }; pending: number };
let recFillBusy = false;
function records() {
  const files = fs.readdirSync(PLAN_DIR).filter((f) => /^\d{8}\.json$/.test(f)).map((f) => f.slice(0, 8)).sort();
  const today = B.todayHd();
  const mk = (): RecOut => ({ from: null, days: [], total: { n: 0, hit: 0, inv: 0, ret: 0 }, pending: 0 });
  const out = { honS: mk(), himo: mk(), honS90: mk(), honS90all: mk() };
  const missing: { hd: string; it: PlanItem }[] = [];
  for (const hd of files) {
    const p = loadPlan(hd); if (!p) continue;
    // 締切前に決まっていた予想だけを数える
    const before = (it: PlanItem) => { const a = new Date(new Date(it.addedAt).getTime() + 9 * 3600_000); const ah = a.toISOString().slice(0, 10).replace(/-/g, ""); const dl = it.deadline ? toMin(it.deadline) : null; return ah < hd || (ah === hd && dl !== null && a.getUTCHours() * 60 + a.getUTCMinutes() < dl); };
    const add = (o: RecOut, it: PlanItem, picks: string[]) => {
      if (!before(it)) return;
      const r = it.result;
      if (!r?.finished) { if (hd < today || (it.deadline && jstNowMin(hd) > (toMin(it.deadline) ?? 0) + 15)) { o.pending++; missing.push({ hd, it }); } return; }
      let d = o.days.find((x) => x.hd === hd); if (!d) { d = { hd, n: 0, hit: 0, inv: 0, ret: 0 }; o.days.push(d); o.from ??= hd; }
      const h = !!r.trifecta && picks.includes(r.trifecta);
      d.n++; d.inv += picks.length * 100; if (h) { d.hit++; d.ret += r.trifectaPay ?? 0; }
    };
    for (const it of p.items) {
      if (it.tier === "S") add(out.honS, it, it.main.slice(0, 5).map((m) => m.combo));
      if (it.himo && it.himo.picks.length <= 6) add(out.himo, it, it.himo.picks);
      // 本命Sで自信度90以上のレースの、推奨5点のうち確率20%以上の目だけ
      if (it.tier === "S" && it.confidence >= 90) add(out.honS90all, it, it.main.slice(0, 5).map((m) => m.combo));
      if (it.tier === "S" && it.confidence >= 90) { const pk = it.main.slice(0, 5).filter((m) => m.prob >= 0.2).map((m) => m.combo); if (pk.length) add(out.honS90, it, pk); }
    }
  }
  for (const o of [out.honS, out.himo, out.honS90, out.honS90all]) for (const d of o.days) { o.total.n += d.n; o.total.hit += d.hit; o.total.inv += d.inv; o.total.ret += d.ret; }
  // 結果が入っていない過去のレースは裏で取りに行く
  if (missing.length && !recFillBusy) {
    recFillBusy = true;
    B.runBg(async () => {
      const touched = new Set<string>();
      for (const m of missing.slice(0, 60)) { const r = await B.getResult(m.it.jcd, m.it.rno, m.hd).catch(() => null); if (r?.finished) { m.it.result = r; touched.add(m.hd); } }
      for (const hd of Array.from(touched)) { const p = loadPlan(hd); if (p) savePlan(p); }
    }).catch(() => {}).finally(() => { recFillBusy = false; });
  }
  return out;
}
function savePlan(p: Plan) { plans[p.hd] = p; fs.writeFileSync(path.join(PLAN_DIR, `${p.hd}.json`), JSON.stringify(p)); }
function updatePlan(hd: string, ranked: PickSummary[]) {
  const now = new Date().toISOString();
  let plan = loadPlan(hd); let changed = false;
  if (!plan && ranked.length === 0) return;
  if (!plan) { plan = { hd, createdAt: now, items: [] }; changed = true; }
  const have = new Set(plan.items.map((i) => `${i.jcd}-${i.rno}`));
  for (const p of ranked) {
    if (have.has(`${p.jcd}-${p.rno}`)) continue;
    plan.items.push({ ...p, tier: favP(p) >= S_TH ? "S" : "other", addedAt: now, late: plan.items.length > 0 });
    changed = true;
  }
  if (changed) savePlan(plan);
}
async function settlePlan(hd: string) {
  const plan = loadPlan(hd); if (!plan) return;
  const nowMin = jstNowMin(hd); let changed = false;
  const due = plan.items.filter((i) => (!i.result?.finished || i.result.winPay === undefined) && (toMin(i.deadline || "") ?? 9999) + 3 <= nowMin);
  const batch = due.slice(0, 40); if (due.length) console.log("settle due", due.length);
  for (let k = 0; k < batch.length; k += 6) await Promise.all(batch.slice(k, k + 6).map(async (i) => {
    const r = await B.getResult(i.jcd, i.rno, hd).catch(() => null);
    if (r?.finished) { i.result = r; i.hit = !!(r.trifecta && i.main.slice(0, 5).some((m) => m.combo === r.trifecta)); i.manshuHit = !!(r.trifecta && i.manshuFinal?.picks.some((m) => m.combo === r.trifecta)); i.chuanaHit = !!(r.trifecta && i.chuanaFinal?.picks.some((m) => m.combo === r.trifecta)); i.chuana5Hit = !!(r.trifecta && i.chuanaFinal?.alt5?.picks.some((m) => m.combo === r.trifecta)); i.chuanaMornHit = !!(r.trifecta && i.chuana?.picks.some((m) => m.combo === r.trifecta)); i.manshuMornHit = !!(r.trifecta && i.manshu?.picks.some((m) => m.combo === r.trifecta)); i.chuana5MornHit = !!(r.trifecta && i.chuana?.alt5?.picks.some((m) => m.combo === r.trifecta)); i.himoHit = !!(r.trifecta && i.himo?.picks.includes(r.trifecta)); changed = true; }
  }));
  if (changed) savePlan(plan);
}
export function getPlanItem(hd: string, jcd: string, rno: number) {
  const p = loadPlan(hd); const it = p?.items.find((i) => i.jcd === jcd && i.rno === rno);
  return it ? { createdAt: it.addedAt, tier: it.tier, confidence: it.confidence, main: it.main.slice(0, 5), entries: it.entries, manshu: it.manshu ?? null, manshuFixed: true, chuana: it.chuana ?? null, hon: it.hon ?? null } : null;
}
function getPreDeadline(hd: string, jcd: string, rno: number) {
  const f = path.join(LOG_DIR, `${hd}.jsonl`); if (!fs.existsSync(f)) return null;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line) continue;
    try { const d = JSON.parse(line); if (d.jcd === jcd && d.rno === rno && (d.stage ?? 5) === 5) {
      const top = Object.entries(d.finalP as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([combo, prob]) => ({ combo, prob, odds: d.odds3?.[combo] ?? null }));
      return { at: d.at, main: top, confidence: d.confidence };
    } } catch {}
  }
  return null;
}

function runPickJob(hd: string) { return B.runBg(() => runPickJobInner(hd)); }
async function runPickJobInner(hd: string) {
  const st = (jobState[hd] = jobState[hd] || { running: false, done: 0, total: 0, updatedAt: null, ranked: [] });
  if (st.running) return;
  st.running = true;
  try {
    const venues = await venuesWithSchedule(hd);
    const now = jstNowMin(hd);
    const targets: { jcd: string; rno: number }[] = [];
    for (const v of venues) {
      if (v.finished) continue;
      v.deadlines.forEach((d, i) => {
        const m = d ? toMin(d) : null;
        if (m !== null && m > now + 1) targets.push({ jcd: v.jcd, rno: i + 1 });
      });
    }
    st.total = targets.length;
    st.done = 0;
    const results: Analysis[] = [];
    let idx = 0;
    const worker = async () => {
      while (idx < targets.length) {
        const t = targets[idx++];
        try {
          results.push(await getAnalysis(t.jcd, t.rno, hd, 4 * 60_000));
        } catch {}
        st.done++;
      }
    };
    await Promise.all(Array.from({ length: 16 }, () => worker())); // boatrace.jp is slow per page (~10s) but fine in parallel
    const ranked = results
      .filter((a) => a.status === "upcoming")
      .sort((a, b) => (b.oddsAvailable ? 1 : 0) - (a.oddsAvailable ? 1 : 0) || b.confidence - a.confidence)
      .map(summarize);
    st.ranked = ranked;
    st.updatedAt = new Date().toISOString();
    updatePlan(hd, ranked);
    try { updateEx(hd, ranked); } catch {}
    try { updateTri(hd, ranked); } catch {}
    // persist current top picks; drop upcoming picks that fell out of the top list
    const top = ranked.slice(0, PICK_N);
    for (const p of top) storage.upsertPick({ hd, jcd: p.jcd, rno: p.rno, confidence: p.confidence, payload: JSON.stringify(p), deadline: p.deadline || "" });
    const nowMin = jstNowMin(hd);
    for (const p of storage.listPicks(hd)) {
      const m = toMin(p.deadline) ?? 0;
      if (m > nowMin + 1 && !top.find((t) => t.jcd === p.jcd && t.rno === p.rno)) storage.deletePick(p.id);
    }
    st.error = undefined;
  } catch (e: any) {
    st.error = String(e?.message || e);
  } finally {
    st.running = false;
  }
}

// ---------- pre-deadline odds logger (for honest ROI validation at purchase time) ----------
const LOG_DIR = path.resolve("data/oddslog");
fs.mkdirSync(LOG_DIR, { recursive: true });
const logged = new Set<string>();
for (const f of fs.readdirSync(LOG_DIR)) for (const line of fs.readFileSync(path.join(LOG_DIR, f), "utf8").split("\n")) {
  if (!line) continue; try { const d = JSON.parse(line); logged.add(`${d.hd}-${d.jcd}-${d.rno}-${d.stage ?? 5}`); } catch {}
}
let logRunning = false;
async function logTick() {
  if (logRunning) return; logRunning = true;
  try {
    const hd = B.todayHd(); const now = jstNowMin(hd);
    const venues = await venuesWithSchedule(hd);
    const due: { jcd: string; rno: number; deadline: string; stage: number }[] = [];
    const STAGES = [10, 5, 2];
    for (const v of venues) v.deadlines.forEach((d, i) => {
      const m = d ? toMin(d) : null;
      if (m === null) return;
      const left = m - now;
      STAGES.forEach((st, k) => {
        const lower = STAGES[k + 1] ?? 0;
        if (left <= st && left > lower && !logged.has(`${hd}-${v.jcd}-${i + 1}-${st}`)) due.push({ jcd: v.jcd, rno: i + 1, deadline: d!, stage: st });
      });
    });
    // 万舟狙い: fix the 10 points ~10 minutes before the deadline (exhibition + odds known)
    const plan = loadPlan(hd);
    if (plan) {
      const fix = plan.items.filter((i) => !i.manshuFixedAt && i.deadline && (toMin(i.deadline) ?? 0) - now <= 10 && (toMin(i.deadline) ?? 0) - now > 0);
      let changed = false;
      await Promise.all(fix.map(async (i) => {
        try {
          const a = await getAnalysis(i.jcd, i.rno, hd, 0);
          if (a.status !== "upcoming") return;
          i.manshuFinal = a.manshu ? { ...a.manshu, fixedAt: new Date().toISOString() } : null;
          i.chuanaFinal = a.chuana ? { ...a.chuana, fixedAt: new Date().toISOString() } : null;
          i.manshuFixedAt = new Date().toISOString(); changed = true;
        } catch {}
      }));
      if (changed) savePlan(plan);
    }
    await Promise.all(due.map(async (t) => {
      try {
        const [a, tan, ex, qu, before] = await Promise.all([
          getAnalysis(t.jcd, t.rno, hd, 0), B.getOddsTan(t.jcd, t.rno, hd), B.getOdds2t(t.jcd, t.rno, hd), B.getOdds2f(t.jcd, t.rno, hd), B.getBefore(t.jcd, t.rno, hd).catch(() => null),
        ]);
        if (!Object.keys(tan).length) return;
        const r5 = (x: number) => Math.round(x * 1e6) / 1e6;
        const modelP: Record<string, number> = {}; const finalP: Record<string, number> = {}; const odds3: Record<string, number> = {};
        for (const c of a.trifecta) { modelP[c.combo] = r5(c.modelProb); finalP[c.combo] = r5(c.prob); if (c.odds) odds3[c.combo] = c.odds; }
        const rec = { hd, jcd: t.jcd, rno: t.rno, deadline: t.deadline, stage: t.stage, at: new Date().toISOString(), modelKind: a.modelKind, confidence: a.confidence, tan, ex, qu, odds3, modelP, finalP, extra: before?.extra ?? null, betTips: a.betTips };
        fs.appendFileSync(path.join(LOG_DIR, `${hd}.jsonl`), JSON.stringify(rec) + "\n");
        logged.add(`${hd}-${t.jcd}-${t.rno}-${t.stage}`);
      } catch {}
    }));
  } catch {} finally { logRunning = false; }
}
setInterval(() => B.runBg(logTick), 60_000);
export function oddsLogStats() {
  const files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith(".jsonl")).sort();
  const seen = new Set<string>();
  for (const f of files) for (const l of fs.readFileSync(path.join(LOG_DIR, f), "utf8").split("\n")) { if (!l) continue; try { const d = JSON.parse(l); seen.add(`${d.hd}-${d.jcd}-${d.rno}`); } catch {} }
  const races = seen.size;
  return { days: files.map((f) => f.slice(0, 8)), races };
}

setTimeout(() => runPickJob(B.todayHd()), 2000);
setInterval(() => B.runBg(() => settlePlan(B.todayHd())).catch((e) => console.log("settle error", e?.message)), 3 * 60_000);
setInterval(() => B.runBg(() => settleEx(B.todayHd())).catch(() => {}), 3 * 60_000);
setInterval(() => B.runBg(() => settleTri(B.todayHd())).catch(() => {}), 3 * 60_000);
setTimeout(() => settlePlan(B.todayHd()).catch((e) => console.log("settle error", e?.message)), 15_000);
setInterval(() => runPickJob(B.todayHd()), 5 * 60_000);

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/meta", (_req, res) => {
    res.json({ today: hdOffset(0), tomorrow: hdOffset(1), nowMin: jstNowMin(hdOffset(0)) });
  });

  app.get("/api/venues", async (req, res) => {
    const hd = String(req.query.hd || B.todayHd());
    try {
      res.json(await venuesWithSchedule(hd));
    } catch (e: any) {
      res.status(502).json({ message: "レース場情報の取得に失敗しました: " + e.message });
    }
  });

  app.get("/api/ashi/venues", (req, res) => {
    const hd = String(req.query.hd || B.todayHd());
    res.json(Object.keys(ORI_V).map((j) => { const v = getVenueAshi(j, hd); return { jcd: j, venue: ORI_V[j], from: v.from, to: v.to, days: v.days, racers: v.rows.length }; }));
  });
  app.get("/api/ashi/venue", (req, res) => {
    const jcd = String(req.query.jcd || ""); if (!ORI_V[jcd]) return res.status(400).json({ message: "対象外の場です" });
    res.json(getVenueAshi(jcd, String(req.query.hd || B.todayHd())));
  });
  app.get("/api/ashi", async (req, res) => {
    const hd = String(req.query.hd || B.todayHd()); const jcd = String(req.query.jcd || ""); const rno = parseInt(String(req.query.rno || "0"));
    if (!/^\d{2}$/.test(jcd) || !(rno >= 1 && rno <= 12)) return res.status(400).json({ message: "パラメータが不正です" });
    try {
      const c = anaCache.get(`${hd}-${jcd}-${rno}`)?.data;
      const entries = c ? c.entries.map((e) => ({ lane: e.lane, toban: e.toban })) : (await B.getCard(jcd, rno, hd)).entries.map((e) => ({ lane: e.lane, toban: e.toban }));
      const h2 = isHead2Race(hd, jcd, rno); const vn = h2 ? loadH2(hd).find((x) => x.jcd === jcd && x.rno === rno)?.venue ?? null : null;
      res.json(await getAshi(jcd, hd, rno, entries, h2, vn));
    } catch (e: any) { res.status(500).json({ message: e?.message || "取得に失敗しました" }); }
  });
  app.get("/api/race", async (req, res) => {
    const hd = String(req.query.hd || B.todayHd());
    const jcd = String(req.query.jcd || "");
    const rno = parseInt(String(req.query.rno || "0"));
    if (!/^\d{2}$/.test(jcd) || !(rno >= 1 && rno <= 12)) return res.status(400).json({ message: "パラメータが不正です" });
    try {
      const a = await getAnalysis(jcd, rno, hd, req.query.fresh ? 0 : 60_000);
      res.json({ ...a, plan: getPlanItem(hd, jcd, rno), pre: a.status !== "upcoming" ? getPreDeadline(hd, jcd, rno) : null });
    } catch (e: any) {
      res.status(502).json({ message: "レース情報の取得に失敗しました: " + e.message });
    }
  });

  app.get("/api/racer/:toban", async (req, res) => {
    const toban = req.params.toban;
    if (!/^\d{4}$/.test(toban)) return res.status(400).json({ message: "登録番号は4桁です" });
    try {
      const [course, prof] = await Promise.all([
        B.getRacerCourse(toban),
        B.fetchHtml(`https://www.boatrace.jp/owpc/pc/data/racersearch/profile?toban=${toban}`, 12 * 3600_000),
      ]);
      const $ = cheerio.load(prof);
      const dl: Record<string, string> = {};
      $("dl dt").each((_, dt) => { dl[$(dt).text().trim()] = $(dt).next("dd").text().replace(/\s+/g, " ").trim(); });
      const name = $(".racer1_bodyName").text().replace(/\s+/g, " ").trim();
      if (!name) return res.status(404).json({ message: "選手が見つかりません" });
      res.json({ toban, name, kana: $(".racer1_bodyKana").text().trim(), profile: dl, course });
    } catch (e: any) {
      res.status(502).json({ message: "選手情報の取得に失敗しました: " + e.message });
    }
  });

  app.get("/api/head2", (req, res) => { try { B.runBg(() => head2Retro(String(req.query.hd || B.todayHd()))).catch(() => {}); res.json(head2Resp(String(req.query.hd || B.todayHd()))); } catch (e: any) { res.status(500).json({ message: e?.message }); } });
  app.get("/api/records", (_req, res) => { try { res.json(records()); } catch (e: any) { res.status(500).json({ message: e?.message }); } });
  app.get("/api/picks", async (req, res) => {
    const hd = String(req.query.hd || B.todayHd());
    const st = jobState[hd];
    if (!st || (!st.running && (!st.updatedAt || Date.now() - Date.parse(st.updatedAt) > 5 * 60_000))) runPickJob(hd);
    const s = jobState[hd];
    const nowMin = jstNowMin(hd);
    const history: any[] = [];
    const plan = loadPlan(hd);
    res.json({
      plan: plan ? { createdAt: plan.createdAt, items: plan.items.map(({ entries, ...rest }) => {
        const live = (s?.ranked || []).find((r) => r.jcd === rest.jcd && r.rno === rest.rno);
        const fav = entries.slice().sort((a, b) => b.winProb - a.winProb)[0];
        const lfav = live ? live.entries.slice().sort((a, b) => b.winProb - a.winProb)[0] : null;
        return { ...rest, entries: entries.slice().sort((a, b) => b.winProb - a.winProb).slice(0, 2),
          live: live ? { confidence: live.confidence, favLane: lfav?.lane ?? null, favName: lfav?.name ?? "", favChanged: !!(lfav && fav && lfav.lane !== fav.lane) } : null };
      }) } : null,
      status: { running: s?.running ?? true, done: s?.done ?? 0, total: s?.total ?? 0, updatedAt: s?.updatedAt ?? null, error: s?.error },
      picks: (s?.ranked || []).filter((p) => (toMin(p.deadline || "") ?? 0) > nowMin).slice(0, PICK_N),
      others: (s?.ranked || []).filter((p) => (toMin(p.deadline || "") ?? 0) > nowMin).slice(PICK_N, PICK_N + 10),
      distorted: (s?.ranked || [])
        .filter((p) => (toMin(p.deadline || "") ?? 0) > nowMin && (p.distortions?.length ?? 0) > 0)
        .sort((a, b) => (toMin(a.deadline || "") ?? 0) - (toMin(b.deadline || "") ?? 0))
        .slice(0, 15),
      targets: (s?.ranked || [])
        .filter((p) => (toMin(p.deadline || "") ?? 0) > nowMin && p.betTips?.some((t) => t.highlight))
        .sort((a, b) => (toMin(a.deadline || "") ?? 0) - (toMin(b.deadline || "") ?? 0))
        .slice(0, 12),
      exev: (() => {
        const xs = loadEx(hd);
        const up = (s?.ranked || []).filter((p) => (toMin(p.deadline || "") ?? 0) > nowMin && (p.exEv?.length ?? 0) > 0)
          .sort((a, b) => (toMin(a.deadline || "") ?? 0) - (toMin(b.deadline || "") ?? 0))
          .map((p) => ({ hd: p.hd, jcd: p.jcd, rno: p.rno, venue: p.venue, deadline: p.deadline, entries: p.entries.slice().sort((a, b) => b.winProb - a.winProb).slice(0, 2), exEv: p.exEv }));
        const done = xs.filter((x) => (toMin(x.deadline || "") ?? 0) <= nowMin && x.combos.length).sort((a, b) => (toMin(b.deadline || "") ?? 0) - (toMin(a.deadline || "") ?? 0));
        return { upcoming: up, done, today: exStats(xs), all: exAll(), updatedAt: s?.updatedAt ?? null };
      })(),
      triev: (() => {
        const xs = loadTri(hd);
        const up = (s?.ranked || []).filter((p) => (toMin(p.deadline || "") ?? 0) > nowMin && (p.triEv?.length ?? 0) > 0)
          .sort((a, b) => (toMin(a.deadline || "") ?? 0) - (toMin(b.deadline || "") ?? 0))
          .map((p) => ({ hd: p.hd, jcd: p.jcd, rno: p.rno, venue: p.venue, deadline: p.deadline, entries: p.entries.slice().sort((a, b) => b.winProb - a.winProb).slice(0, 2), exEv: p.triEv! }));
        const done = xs.filter((x) => (toMin(x.deadline || "") ?? 0) <= nowMin && x.combos.length).sort((a, b) => (toMin(b.deadline || "") ?? 0) - (toMin(a.deadline || "") ?? 0));
        return { upcoming: up, done, today: triStats(xs), all: triAll(), updatedAt: s?.updatedAt ?? null };
      })(),
      history,
    });
  });

  app.get("/api/favorites", (_req, res) => { res.json({ favorites: favs, appearances: favAppearances() }); });
  app.put("/api/favorites/:toban", (req, res) => {
    const t = String(req.params.toban); if (!/^\d{4}$/.test(t)) return res.status(400).json({ message: "登録番号が不正です" });
    const b = req.body || {}; const now = new Date().toISOString(); const f = favs.find((x) => x.toban === t);
    if (f) { f.name = b.name || f.name; f.cls = b.cls || f.cls; f.branch = b.branch || f.branch; f.updatedAt = now; }
    else favs.unshift({ toban: t, name: String(b.name || ""), cls: String(b.cls || ""), branch: String(b.branch || ""), memo: "", addedAt: now, updatedAt: now });
    saveFavs(); res.json({ ok: true });
  });
  app.patch("/api/favorites/:toban", (req, res) => {
    const f = favs.find((x) => x.toban === String(req.params.toban)); if (!f) return res.status(404).json({ message: "お気に入りにありません" });
    f.memo = String(req.body?.memo ?? "").slice(0, 2000); f.updatedAt = new Date().toISOString(); saveFavs(); res.json({ ok: true });
  });
  app.delete("/api/favorites/:toban", (req, res) => { favs = favs.filter((x) => x.toban !== String(req.params.toban)); saveFavs(); res.json({ ok: true }); });

  app.get("/api/tenji", (_req, res) => {
    const hd = B.todayHd(); const xs = loadTenji(hd);
    res.json({ hd, venues: TENJI_V, races: [...xs].sort((a, b) => (toMin(a.deadline || "") ?? 0) - (toMin(b.deadline || "") ?? 0)), updatedAt: tenjiUpdatedAt, all: tenjiAll(), ntfyTopic: NTFY_TOPIC || null });
  });

  app.get("/api/backtest", (_req, res) => {
    try {
      const rep = JSON.parse(fs.readFileSync("backtest/report.json", "utf8"));
      let live = null; try { live = JSON.parse(fs.readFileSync("backtest/live_eval.json", "utf8")); } catch {}
      let evChoice = null; try { evChoice = JSON.parse(fs.readFileSync("backtest/ev_choice.json", "utf8")); } catch {}
      let manshu = null; try { manshu = JSON.parse(fs.readFileSync("backtest/manshu_summary.json", "utf8")); } catch {}
      res.json({ ...rep, liveLog: oddsLogStats(), live, evChoice, manshu });
    } catch {
      res.status(404).json({ message: "検証データはまだありません" });
    }
  });

  app.post("/api/picks/refresh", (req, res) => {
    const hd = String(req.body?.hd || B.todayHd());
    runPickJob(hd);
    res.json({ ok: true });
  });

  // ---------- My races ----------
  app.get("/api/myraces", async (_req, res) => {
    const races = storage.listMyRaces().sort((a, b) => (a.hd + a.jcd + String(a.rno).padStart(2, "0")).localeCompare(b.hd + b.jcd + String(b.rno).padStart(2, "0")));
    const out = await Promise.all(
      races.map(async (r) => {
        const bets = storage.listBets(r.id);
        try {
          const a = await getAnalysis(r.jcd, r.rno, r.hd, 90_000);
          const evBets = bets.map((b) => {
            const list = b.type === "2t" ? a.exacta : a.trifecta;
            const c = list.find((x) => x.combo === b.combo);
            const hit = a.result?.finished ? (b.type === "2t" ? a.result.exacta === b.combo : a.result.trifecta === b.combo) : null;
            const pay = hit ? ((b.type === "2t" ? a.result!.exactaPay : a.result!.trifectaPay) ?? 0) * (b.amount / 100) : 0;
            return { ...b, prob: c?.prob ?? null, odds: c?.odds ?? null, ev: c?.ev ?? null, hit, pay };
          });
          const stake = evBets.reduce((s, b) => s + b.amount, 0);
          const expReturn = evBets.reduce((s, b) => s + (b.ev ?? 0) * b.amount, 0);
          return {
            ...r, venue: a.venue, raceTitle: a.raceTitle, deadline: a.deadline, status: a.status,
            confidence: a.confidence, confidenceLabel: a.confidenceLabel, oddsAvailable: a.oddsAvailable,
            bestEv: a.trifecta.filter((t) => t.prob >= 0.01 && t.ev !== null).sort((x, y) => (y.ev ?? 0) - (x.ev ?? 0)).slice(0, 5),
            main: a.main, result: a.result, bets: evBets, stake, expReturn,
            entries: a.entries.map((e) => ({ lane: e.lane, name: e.name, mark: e.mark, winProb: e.winProb })),
          };
        } catch (e: any) {
          return { ...r, venue: B.VENUES[r.jcd], error: e.message, bets };
        }
      }),
    );
    res.json(out);
  });

  app.post("/api/myraces", (req, res) => {
    const parsed = insertMyRaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "入力が不正です" });
    res.json(storage.addMyRace(parsed.data));
  });
  app.delete("/api/myraces/:id", (req, res) => {
    storage.deleteMyRace(parseInt(req.params.id));
    res.json({ ok: true });
  });
  app.post("/api/bets", (req, res) => {
    const parsed = insertMyBetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "入力が不正です" });
    const b = parsed.data;
    const ok = b.type === "3t" ? /^[1-6]-[1-6]-[1-6]$/.test(b.combo) && new Set(b.combo.split("-")).size === 3 : /^[1-6]-[1-6]$/.test(b.combo) && new Set(b.combo.split("-")).size === 2;
    if (!ok) return res.status(400).json({ message: "買い目の形式が不正です（例: 1-2-3）" });
    res.json(storage.addBet(b));
  });
  app.delete("/api/bets/:id", (req, res) => {
    storage.deleteBet(parseInt(req.params.id));
    res.json({ ok: true });
  });

  return httpServer;
}
