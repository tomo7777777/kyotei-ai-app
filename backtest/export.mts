import { buildFeatures, extFeatures } from "../server/model.ts";
import fs from "node:fs";
const out: any[] = [];
for (const f of fs.readdirSync("backtest").filter((x) => /^raw_\d+\.json$/.test(x))) {
  for (const d of JSON.parse(fs.readFileSync("backtest/" + f, "utf8"))) {
    const E = d.card.entries, before = d.before;
    const courseOf = (lane: number) => (before?.exCourse && Object.keys(before.exCourse).length === 6 && before.available ? before.exCourse[lane] : lane);
    const exTimes = E.map((e: any) => before?.exTime?.[e.lane] ?? null);
    const feats = buildFeatures(E, courseOf, exTimes, d.racers, d.venueStats);
    out.push({ hd: d.hd, jcd: d.jcd, rno: d.rno, feats, X: extFeatures(E, before, d.racers, courseOf), exAvail: !!before?.available, odds3: d.odds3, trifecta: d.result.trifecta, pay: d.result.trifectaPay });
  }
}
fs.writeFileSync("backtest/feats.json", JSON.stringify(out));
console.log("races", out.length);
