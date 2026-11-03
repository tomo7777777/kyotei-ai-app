// オリジナル展示データ（一周・まわり足・直線など）を BOATCAST から取得し、選手ごとの「今節の足」を出す
import fs from "node:fs";
import path from "node:path";
import * as B from "./boatrace";
import { jstNowMin, toMin } from "./model";

export const ORI_V: Record<string, string> = { "01": "桐生", "02": "戸田", "04": "平和島", "12": "住之江", "14": "鳴門", "22": "福岡" };
const KEYMAP: Record<string, string> = { "一周": "lap", "半周ラップ": "half", "半周": "half", "まわり足": "turn", "直線": "straight" };
export const LABEL: Record<string, string> = { lap: "一周", half: "半周", turn: "まわり足", straight: "直線" };
const ORDER = ["straight", "turn", "lap", "half"];
type Lane = { lane: number; toban: string; name: string; t: Record<string, number | null> };
type Rec = { at: string; keys: string[]; lanes: Lane[] } | { miss: number; final?: boolean };
const DIR = path.resolve("data/oriten"); fs.mkdirSync(DIR, { recursive: true });
const days: Record<string, Record<string, Rec>> = {};
const load = (hd: string) => (days[hd] ??= (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${hd}.json`), "utf8")); } catch { return {}; } })());
const save = (hd: string) => { try { fs.writeFileSync(path.join(DIR, `${hd}.json`), JSON.stringify(days[hd])); } catch {} };
const isRec = (r: Rec | undefined): r is Extract<Rec, { keys: string[] }> => !!r && "keys" in r;

function hdShift(hd: string, d: number) {
  const t = Date.UTC(+hd.slice(0, 4), +hd.slice(4, 6) - 1, +hd.slice(6, 8)) + d * 86400_000;
  const x = new Date(t); return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, "0")}${String(x.getUTCDate()).padStart(2, "0")}`;
}

async function fetchTxt(jcd: string, hd: string, rno: number): Promise<{ keys: string[]; rows: { lane: number; name: string; t: Record<string, number | null> }[] } | null> {
  const url = `https://race.boatcast.jp/txt/${jcd}/bc_oriten_${hd}_${jcd}_${String(rno).padStart(2, "0")}.txt`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const rows = (await r.text()).split(/\r?\n/).map((l) => l.split("\t"));
    if (rows[0]?.[0]?.trim() !== "data=" || rows[1]?.[0]?.trim() !== "1") return null;
    const cnt = parseInt(rows[1][1]); const labels = (rows[2] || []).slice(0, cnt).map((s) => s.replace(/[\s　]/g, ""));
    const keys = labels.map((l) => KEYMAP[l] ?? "");
    const out = [];
    for (let i = 3; i < 9; i++) {
      const row = rows[i]; if (!row) continue; const lane = parseInt(row[0]); if (!(lane >= 1 && lane <= 6)) continue;
      const t: Record<string, number | null> = {};
      keys.forEach((k, j) => { if (!k) return; const v = parseFloat(row[j + 2]); t[k] = Number.isFinite(v) && v > 0 ? v : null; });
      out.push({ lane, name: (row[1] || "").replace(/[\s　]+/g, " ").trim(), t });
    }
    if (out.length < 6 || out.every((x) => Object.values(x.t).every((v) => v === null))) return null;
    return { keys: keys.filter(Boolean), rows: out };
  } catch { return null; }
}

// 1レース分を取得して保存（出走表から登録番号をひも付け）
async function grab(jcd: string, hd: string, rno: number, finalIfMissing = false): Promise<boolean> {
  const d = load(hd); const k = `${jcd}-${rno}`; if (isRec(d[k])) return true;
  const x = await fetchTxt(jcd, hd, rno);
  if (!x) { d[k] = { miss: Date.now(), final: finalIfMissing }; save(hd); return false; }
  const card = await B.getCard(jcd, rno, hd).catch(() => null);
  const lanes: Lane[] = x.rows.map((r) => ({ lane: r.lane, toban: card?.entries.find((e) => e.lane === r.lane)?.toban ?? "", name: r.name, t: r.t }));
  d[k] = { at: new Date().toISOString(), keys: x.keys, lanes }; save(hd); return true;
}

// 定期: 今日のレースは展示後に取得、開催中の過去日（今節）もさかのぼって取得
let busy = false;
export async function oriTick() {
  if (busy) return; busy = true;
  try {
    const hd = B.todayHd(); const now = jstNowMin(hd);
    const venues = (await B.getVenues(hd).catch(() => [] as any[])).filter((v: any) => ORI_V[v.jcd]);
    for (const v of venues) {
      const dls = await B.getDeadlines(v.jcd, hd).catch(() => [] as (string | null)[]);
      const d = load(hd);
      await Promise.all(dls.map(async (dl, i) => {
        if (!dl) return; const m = toMin(dl); if (m === null) return; const k = `${v.jcd}-${i + 1}`; const r = d[k];
        if (isRec(r) || now < m - 25) return;
        if (r && "miss" in r && (r.final || Date.now() - r.miss < 3 * 60_000)) return;
        await grab(v.jcd, hd, i + 1, now > m + 60);
      }));
      // 今節の過去日（最大6日前まで、データが無い日で止める）
      for (let back = 1; back <= 6; back++) {
        const ph = hdShift(hd, -back); const pd = load(ph);
        const done = Array.from({ length: 12 }, (_, i) => pd[`${v.jcd}-${i + 1}`]);
        if (done.every((r) => isRec(r) || (r && "miss" in r && r.final))) { if (done.every((r) => !isRec(r))) break; continue; }
        const ok = await Promise.all(Array.from({ length: 12 }, (_, i) => grab(v.jcd, ph, i + 1, true)));
        if (!ok.some(Boolean)) break;
      }
    }
  } catch (e: any) { console.log("oriten error", e?.message); } finally { busy = false; }
}

export type AshiLane = { lane: number; today: Record<string, { v: number | null; rank: number | null }> | null; series: Record<string, { n: number; avg: number; mark: string; srank?: number; stotal?: number }>; n: number; summary: string[] };
export type Ashi = { available: boolean; venue: string | null; keys: string[]; labels: Record<string, string>; lanes: AshiLane[] };

const rankIn = (lanes: Lane[], k: string) => {
  const vals = lanes.map((l) => l.t[k]).filter((v): v is number => v !== null && v !== undefined);
  return (v: number | null | undefined) => (v === null || v === undefined ? null : 1 + vals.filter((x) => x < v).length);
};

// レース画面用: その日の展示データと、選手ごとの今節（同じ場・直近7日）の順位平均
// 頭2艇に出したレースだけは、6場以外でも取得する（そのレースの展示データのみ）
export async function grabOne(jcd: string, hd: string, rno: number, finalIfMissing = false) {
  const d = load(hd); const r = d[`${jcd}-${rno}`];
  if (isRec(r) || (r && "miss" in r && (r.final || Date.now() - r.miss < 3 * 60_000))) return isRec(r);
  return grab(jcd, hd, rno, finalIfMissing);
}
export async function getAshi(jcd: string, hd: string, rno: number, entries: { lane: number; toban: string }[], allowAny = false, venueName: string | null = null): Promise<Ashi> {
  if (!ORI_V[jcd] && !allowAny) return { available: false, venue: null, keys: [], labels: LABEL, lanes: [] };
  const d = load(hd); const k = `${jcd}-${rno}`;
  const r0 = d[k];
  if (!isRec(r0) && (!r0 || ("miss" in r0 && !r0.final && Date.now() - r0.miss > 60_000))) await grab(jcd, hd, rno).catch(() => {});
  const cur = d[k];
  const keysSet = new Set<string>();
  const hist: Record<string, Record<string, number[]>> = {};
  const dev: Record<string, Record<string, number[]>> = {}; // 節間順位用: レース平均との差（小さいほど速い）
  for (let back = 0; back <= 6; back++) {
    const ph = hdShift(hd, -back); const pd = load(ph);
    // 開催がない日（前の節との切れ目）でさかのぼりを止める
    if (back > 0 && !Array.from({ length: 12 }, (_, i) => pd[`${jcd}-${i + 1}`]).some((x) => isRec(x))) break;
    for (let r = 1; r <= 12; r++) {
      if (back === 0 && r > rno) continue;
      const rec = pd[`${jcd}-${r}`]; if (!isRec(rec)) continue;
      rec.keys.forEach((x) => keysSet.add(x));
      for (const key of rec.keys) {
        const vs = rec.lanes.map((l) => l.t[key]).filter((v): v is number => typeof v === "number");
        if (vs.length < 4) continue; const mean = vs.reduce((p, q) => p + q, 0) / vs.length;
        for (const l of rec.lanes) { const v = l.t[key]; if (l.toban && typeof v === "number") ((dev[l.toban] ??= {})[key] ??= []).push(v - mean); }
      }
      for (const l of rec.lanes) {
        if (!l.toban) continue;
        for (const key of rec.keys) { const rk = rankIn(rec.lanes, key)(l.t[key]); if (rk !== null) ((hist[l.toban] ??= {})[key] ??= []).push(rk); }
      }
    }
  }
  const keys = ORDER.filter((x) => keysSet.has(x));
  // 節間（この場・今節）での順位: 平均の差が小さい順
  const srank: Record<string, Record<string, number>> = {}; const stotal: Record<string, number> = {};
  for (const key of keys) {
    const arr = Object.entries(dev).map(([t, m]) => [t, m[key]] as const).filter(([, a]) => a && a.length).map(([t, a]) => [t, a!.reduce((p, q) => p + q, 0) / a!.length] as const).sort((x, y) => x[1] - y[1]);
    stotal[key] = arr.length; arr.forEach(([t], i) => { (srank[t] ??= {})[key] = i + 1; });
  }
  const lanes: AshiLane[] = entries.map((e) => {
    const h = hist[e.toban] || {};
    const series: AshiLane["series"] = {};
    let n = 0;
    for (const key of keys) {
      const a = h[key] || []; if (!a.length) continue; n = Math.max(n, a.length);
      const avg = a.reduce((p, q) => p + q, 0) / a.length;
      const mark = a.length >= 2 ? (avg <= 2.0 ? "◎" : avg <= 2.8 ? "○" : avg >= 4.5 ? "△" : "") : "";
      series[key] = { n: a.length, avg: Math.round(avg * 10) / 10, mark, srank: srank[e.toban]?.[key], stotal: stotal[key] };
    }
    const today = isRec(cur) ? (() => { const l = cur.lanes.find((x) => x.lane === e.lane); if (!l) return null; const o: Record<string, { v: number | null; rank: number | null }> = {}; for (const key of cur.keys) o[key] = { v: l.t[key] ?? null, rank: rankIn(cur.lanes, key)(l.t[key]) }; return o; })() : null;
    const summary: string[] = [];
    if (series.straight?.mark === "◎") summary.push("伸び型");
    if (series.turn?.mark === "◎") summary.push("回り足型");
    if ((series.lap?.mark === "◎" || series.half?.mark === "◎") && !summary.length) summary.push("総合力上位");
    if (Object.values(series).length && Object.values(series).every((s) => s.mark === "△")) summary.push("足が弱め");
    return { lane: e.lane, today, series, n, summary };
  });
  return { available: keys.length > 0, venue: ORI_V[jcd] ?? venueName, keys, labels: LABEL, lanes };
}

// 船足タブ用: 場ごとの今節の全選手一覧
export type VenueAshiRow = { toban: string; name: string; n: number; lanes: number[]; m: Record<string, { avg: number; srank: number; stotal: number; mark: string; n: number }>; summary: string[] };
export type VenueAshi = { jcd: string; venue: string; from: string | null; to: string | null; days: number; races: number; keys: string[]; labels: Record<string, string>; rows: VenueAshiRow[] };
export function getVenueAshi(jcd: string, hd: string): VenueAshi {
  const empty: VenueAshi = { jcd, venue: ORI_V[jcd] ?? "", from: null, to: null, days: 0, races: 0, keys: [], labels: LABEL, rows: [] };
  if (!ORI_V[jcd]) return empty;
  const has = (h: string) => Array.from({ length: 12 }, (_, i) => load(h)[`${jcd}-${i + 1}`]).some((x) => isRec(x));
  let end: string | null = null;
  for (let b = 0; b <= 6; b++) { const h = hdShift(hd, -b); if (has(h)) { end = h; break; } }
  if (!end) return empty;
  const ds: string[] = [];
  for (let b = 0; b <= 6; b++) { const h = hdShift(end, -b); if (!has(h)) break; ds.push(h); }
  const rk: Record<string, Record<string, number[]>> = {}; const dv: Record<string, Record<string, number[]>> = {};
  const nm: Record<string, string> = {}; const lanes: Record<string, number[]> = {}; const keysSet = new Set<string>(); let races = 0;
  for (const h of ds) for (let r = 1; r <= 12; r++) {
    const rec = load(h)[`${jcd}-${r}`]; if (!isRec(rec)) continue; races++;
    rec.keys.forEach((k) => keysSet.add(k));
    for (const key of rec.keys) {
      const vs = rec.lanes.map((l) => l.t[key]).filter((v): v is number => typeof v === "number"); if (vs.length < 4) continue;
      const mean = vs.reduce((p, q) => p + q, 0) / vs.length; const rf = rankIn(rec.lanes, key);
      for (const l of rec.lanes) { const v = l.t[key]; if (!l.toban || typeof v !== "number") continue; ((dv[l.toban] ??= {})[key] ??= []).push(v - mean); ((rk[l.toban] ??= {})[key] ??= []).push(rf(v)!); }
    }
    for (const l of rec.lanes) if (l.toban) { nm[l.toban] = l.name; (lanes[l.toban] ??= []).push(l.lane); }
  }
  const keys = ORDER.filter((x) => keysSet.has(x));
  const sr: Record<string, Record<string, number>> = {}; const st: Record<string, number> = {};
  for (const key of keys) {
    const arr = Object.entries(dv).filter(([, m]) => m[key]?.length).map(([t, m]) => [t, m[key].reduce((p, q) => p + q, 0) / m[key].length] as const).sort((a, b) => a[1] - b[1]);
    st[key] = arr.length; arr.forEach(([t], i) => { (sr[t] ??= {})[key] = i + 1; });
  }
  const rows: VenueAshiRow[] = Object.keys(nm).map((t) => {
    const m: VenueAshiRow["m"] = {}; let n = 0;
    for (const key of keys) {
      const a = rk[t]?.[key]; if (!a?.length) continue; n = Math.max(n, a.length);
      const avg = a.reduce((p, q) => p + q, 0) / a.length;
      m[key] = { avg: Math.round(avg * 10) / 10, srank: sr[t]?.[key] ?? 0, stotal: st[key], n: a.length, mark: a.length >= 2 ? (avg <= 2.0 ? "◎" : avg <= 2.8 ? "○" : avg >= 4.5 ? "△" : "") : "" };
    }
    const summary: string[] = [];
    if (m.straight?.mark === "◎") summary.push("伸び型");
    if (m.turn?.mark === "◎") summary.push("回り足型");
    if ((m.lap?.mark === "◎" || m.half?.mark === "◎") && !summary.length) summary.push("総合力上位");
    if (Object.values(m).length && Object.values(m).every((x) => x.mark === "△")) summary.push("足が弱め");
    return { toban: t, name: nm[t], n, lanes: lanes[t], m, summary };
  });
  return { jcd, venue: ORI_V[jcd], from: ds[ds.length - 1], to: ds[0], days: ds.length, races, keys, labels: LABEL, rows };
}

// 頭2艇モデル用: このレースの各艇の偏差（レース平均との差）と、今節のそれまでの平均偏差
const MK4 = ["straight", "turn", "lap", "half"];
function devsOf(rec: Extract<Rec, { keys: string[] }>) {
  const out: Record<string, (number | null)[]> = {};
  for (const m of MK4) {
    const byLane = [1, 2, 3, 4, 5, 6].map((l) => { const v = rec.lanes.find((x) => x.lane === l)?.t[m]; return typeof v === "number" && v > 0 && rec.keys.includes(m) ? v : null; });
    const ok = byLane.filter((v): v is number => v !== null);
    if (ok.length < 4) { out[m] = [null, null, null, null, null, null]; continue; }
    const mu = ok.reduce((a, b) => a + b, 0) / ok.length; out[m] = byLane.map((v) => (v === null ? null : v - mu));
  }
  return out;
}
export function oriRaceFeat(hd: string, jcd: string, rno: number): { devs: Record<string, (number | null)[]>; ser: (number | null)[] } | null {
  const rec = load(hd)[`${jcd}-${rno}`]; if (!isRec(rec)) return null;
  const has = (h: string) => Array.from({ length: 12 }, (_, i) => load(h)[`${jcd}-${i + 1}`]).some((x) => isRec(x));
  // 今節のそれまでのレース（前日までの連続した開催日＋今日の前のレース）を古い順に
  const ds: string[] = [];
  for (let b = 1; b <= 6; b++) { const h = hdShift(hd, -b); if (!has(h)) break; ds.unshift(h); }
  const hist: Record<string, number[]> = {};
  const push = (r: Extract<Rec, { keys: string[] }>) => {
    const dv = devsOf(r);
    for (const l of r.lanes) {
      const xs = MK4.map((m) => dv[m][l.lane - 1]).filter((v): v is number => v !== null);
      if (xs.length) (hist[l.toban || l.name] ??= []).push(xs.reduce((a, b) => a + b, 0) / xs.length);
    }
  };
  for (const h of ds) for (let r = 1; r <= 12; r++) { const x = load(h)[`${jcd}-${r}`]; if (isRec(x)) push(x); }
  for (let r = 1; r < rno; r++) { const x = load(hd)[`${jcd}-${r}`]; if (isRec(x)) push(x); }
  const ser = [1, 2, 3, 4, 5, 6].map((l) => { const x = rec.lanes.find((z) => z.lane === l); const h = x ? hist[x.toban || x.name] : undefined; return h && h.length >= 2 ? h.reduce((a, b) => a + b, 0) / h.length : null; });
  return { devs: devsOf(rec), ser };
}
