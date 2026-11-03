import * as B from "../server/boatrace.ts";
import fs from "node:fs";
const days = process.argv.slice(2);
for (const hd of days) {
  const out = `backtest/raw_${hd}.json`;
  const data: any[] = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : [];
  const have = new Set(data.map((d) => `${d.jcd}-${d.rno}`));
  const venues = await B.getVenues(hd);
  const tasks: { jcd: string; rno: number }[] = [];
  for (const v of venues) for (let r = 1; r <= 12; r++) if (!have.has(`${v.jcd}-${r}`)) tasks.push({ jcd: v.jcd, rno: r });
  console.log(hd, "venues", venues.length, "tasks", tasks.length);
  let i = 0, done = 0;
  const worker = async () => {
    while (i < tasks.length) {
      const t = tasks[i++];
      try {
        const [card, before, odds3, result, vs] = await Promise.all([
          B.getCard(t.jcd, t.rno, hd), B.getBefore(t.jcd, t.rno, hd).catch(() => null),
          B.getOdds3t(t.jcd, t.rno, hd).catch(() => ({})), B.getResult(t.jcd, t.rno, hd).catch(() => null), B.getVenueStats(t.jcd),
        ]);
        const racers = await Promise.all(card.entries.map((e) => B.getRacerCourse(e.toban, false).catch(() => null)));
        if (result?.finished && card.entries.length === 6) data.push({ hd, jcd: t.jcd, rno: t.rno, card, before, odds3, result, venueStats: vs, racers });
      } catch (e) { console.log("err", t, String(e)); }
      done++;
      if (done % 20 === 0) { console.log(hd, done, "/", tasks.length); fs.writeFileSync(out, JSON.stringify(data)); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  fs.writeFileSync(out, JSON.stringify(data));
  console.log("saved", hd, data.length);
}
