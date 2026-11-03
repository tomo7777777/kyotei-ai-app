// サーバーのAPI結果を静的JSONに書き出す（GitHub Pages用）
import fs from "node:fs"; import path from "node:path";
const BASE = process.env.BASE || "http://127.0.0.1:5000";
const OUT = path.resolve(process.argv[2] || "out");
const BUDGET_MS = parseInt(process.env.BUDGET_MS || "360000", 10);
const T0 = Date.now(); const left = () => BUDGET_MS - (Date.now() - T0);
const api = path.join(OUT, "api");
const w = (rel, obj) => { const f = path.join(api, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + ".tmp", JSON.stringify(obj)); fs.renameSync(f + ".tmp", f); };
const rd = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(api, rel), "utf8")); } catch { return null; } };
const age = (rel) => { try { return Date.now() - fs.statSync(path.join(api, rel)).mtimeMs; } catch { return Infinity; } };
async function get(u, ms = 120000) { const r = await fetch(BASE + u, { signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); }
async function save(u, rel, fix) { try { let d = await get(u); if (fix) d = fix(d); w(rel, d); return d; } catch (e) { console.log("skip", u, String(e.message || e).slice(0, 80)); return null; } }
async function pool(xs, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length && left() > 20000) { const x = xs[i++]; await fn(x); } })); }
const jstMin = () => { const d = new Date(Date.now() + 9 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const toMin = (t) => (t ? parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3, 5)) : null);

const meta = await save("/api/meta", "meta.json");
if (!meta) { console.log("server not ready"); process.exit(1); }
const hd = meta.today;
await save("/api/picks", "picks.json");
await save("/api/records", "records.json");
await save("/api/head2", "head2.json");
await save("/api/tenji", "tenji.json", (d) => ({ ...d, ntfyTopic: null }));
if (age("backtest.json") > 3600_000) await save("/api/backtest", "backtest.json");
await save("/api/favorites", "favorites.json", (d) => ({ favorites: d.favorites, appearances: {} }));
const av = await save("/api/ashi/venues", "ashi/venues.json");
for (const v of av || []) await save(`/api/ashi/venue?jcd=${v.jcd}`, `ashi/venue-${v.jcd}.json`);
const venues = await save(`/api/venues?hd=${hd}`, `venues/${hd}.json`) || [];
await save(`/api/venues?hd=${meta.tomorrow}`, `venues/${meta.tomorrow}.json`);
const h2 = rd("head2.json"); const h2set = new Set(((h2 && (h2.today?.races || h2.races)) || []).map((x) => `${x.jcd}-${x.rno}`));
const ORI = new Set(["01", "02", "04", "12", "14", "22"]);

// レース: 未取得・締切前後・結果待ちのものを優先して書き出す
const now = jstMin(); const races = [];
for (const v of venues) (v.deadlines || []).forEach((dl, i) => {
  const rno = i + 1, rel = `race/${hd}-${v.jcd}-${rno}.json`, m = toMin(dl) ?? 0, old = rd(rel);
  const fin = old && old.status === "finished" && old.result?.finished;
  let pri = null;
  if (!old) pri = 3 + Math.abs(m - now) / 1000;
  else if (!fin && m - now <= 120 && now - m <= 90) pri = 0 + Math.abs(m - now) / 1000;
  else if (!fin && age(rel) > 60 * 60_000) pri = 5;
  if (pri !== null) races.push({ jcd: v.jcd, rno, pri, m });
});
races.sort((a, b) => a.pri - b.pri);
await pool(races, 3, async (r) => {
  await save(`/api/race?hd=${hd}&jcd=${r.jcd}&rno=${r.rno}`, `race/${hd}-${r.jcd}-${r.rno}.json`);
  if (ORI.has(r.jcd) || h2set.has(`${r.jcd}-${r.rno}`)) await save(`/api/ashi?hd=${hd}&jcd=${r.jcd}&rno=${r.rno}`, `ashi/${hd}-${r.jcd}-${r.rno}.json`);
});
// 頭2艇の船足（締切前後は毎回）
for (const k of h2set) { const [jcd, rno] = k.split("-"); const m = toMin((venues.find((v) => v.jcd === jcd)?.deadlines || [])[+rno - 1]); if (m !== null && m - now <= 30 && now - m <= 60) await save(`/api/ashi?hd=${hd}&jcd=${jcd}&rno=${rno}`, `ashi/${hd}-${jcd}-${rno}.json`); }

// お気に入り用の出走表索引
const appear = {}; const tobans = new Set();
for (const v of venues) for (let rno = 1; rno <= (v.deadlines || []).length; rno++) {
  const a = rd(`race/${hd}-${v.jcd}-${rno}.json`); if (!a) continue;
  for (const e of a.entries || []) { tobans.add(e.toban); (appear[e.toban] ??= []).push({ hd, jcd: a.jcd, venue: a.venue, rno: a.rno, deadline: a.deadline, lane: e.lane, status: a.status, place: a.result?.finished && a.result.order?.length ? (a.result.order.indexOf(e.lane) + 1 || null) : null }); }
}
for (const k in appear) appear[k].sort((x, y) => (x.deadline ?? "").localeCompare(y.deadline ?? ""));
w("appear.json", appear);

// 選手ページ（重いので古いものから少しずつ）
const favT = (rd("favorites.json")?.favorites || []).map((f) => f.toban);
const need = [...new Set([...favT, ...tobans])].filter((t) => age(`racer/${t}.json`) > 3 * 86400_000);
await pool(need, 4, (t) => save(`/api/racer/${t}`, `racer/${t}.json`));
// 古いレースファイルは3日で削除
try { const lim = new Date(Date.now() + 9 * 3600_000 - 3 * 86400_000).toISOString().slice(0, 10).replace(/-/g, ""); for (const d of ["race", "ashi"]) for (const f of fs.readdirSync(path.join(api, d))) if (/^\d{8}-/.test(f) && f.slice(0, 8) < lim) fs.unlinkSync(path.join(api, d, f)); } catch {}
w("exported.json", { at: new Date().toISOString(), hd, racesDone: races.length, racersLeft: need.length });
console.log("export done", hd, "races", races.length, "racers need", need.length, "sec", Math.round((Date.now() - T0) / 1000));
