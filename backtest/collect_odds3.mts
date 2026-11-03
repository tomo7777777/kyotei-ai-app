// Collect final 3連単 odds for past races (boatrace.jp odds3t page). No caching; resumable.
import * as cheerio from "cheerio";
import fs from "node:fs";
const BASE = "https://www.boatrace.jp/owpc/pc";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const CONC = Number(process.argv[2] || 24);
const todo: { hd: string; jcd: string; rno: number }[] = JSON.parse(fs.readFileSync("backtest/odds3_todo.json", "utf8"));
const have = new Set<string>();
for (const f of fs.readdirSync("backtest/odds3_final")) for (const l of fs.readFileSync(`backtest/odds3_final/${f}`, "utf8").split("\n")) if (l) { const d = JSON.parse(l); have.add(`${d.hd}-${d.jcd}-${d.rno}`); }
const q = todo.filter((t) => !have.has(`${t.hd}-${t.jcd}-${t.rno}`));
console.log("todo", q.length, "have", have.size);
const num = (s: string) => { const v = parseFloat(s.replace(/[^0-9.]/g, "")); return isFinite(v) ? v : 0; };
function parse(html: string) {
  const $ = cheerio.load(html); const out: Record<string, number> = {};
  const table = $("div.table1 table").eq(1); const second = [0, 0, 0, 0, 0, 0];
  table.find("tbody tr").each((_, tr) => {
    const tds = $(tr).children("td").toArray(); let idx = 0;
    for (let col = 0; col < 6; col++) {
      const td = tds[idx]; if (!td) break;
      if ($(td).attr("rowspan")) { second[col] = num($(td).text()) || 0; idx++; }
      const third = num($(tds[idx]).text()); const odd = num($(tds[idx + 1]).text()); idx += 2;
      if (third && second[col] && odd && odd > 0) out[`${col + 1}-${second[col]}-${third}`] = odd;
    }
  });
  return out;
}
let i = 0, ok = 0, bad = 0; const t0 = Date.now();
async function worker() {
  while (i < q.length) {
    const t = q[i++];
    for (let k = 0; k < 3; k++) {
      try {
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 40000);
        const r = await fetch(`${BASE}/race/odds3t?rno=${t.rno}&jcd=${t.jcd}&hd=${t.hd}`, { headers: { "User-Agent": UA, "Accept-Language": "ja" }, signal: ctl.signal });
        clearTimeout(tm);
        if (!r.ok) throw new Error(String(r.status));
        const o = parse(await r.text());
        fs.appendFileSync(`backtest/odds3_final/${t.hd}.jsonl`, JSON.stringify({ ...t, n: Object.keys(o).length, odds3: o }) + "\n");
        ok++; break;
      } catch (e) { if (k === 2) bad++; await new Promise((s) => setTimeout(s, 3000 * (k + 1))); }
    }
    if ((ok + bad) % 200 === 0) console.log(new Date().toISOString(), "ok", ok, "bad", bad, "rate/min", Math.round(((ok + bad) / (Date.now() - t0)) * 60000));
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log("done ok", ok, "bad", bad);
