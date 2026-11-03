import * as B from "../server/boatrace.ts";
import fs from "node:fs";
const keys: [string, string, number][] = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = "backtest/before_hist.json";
const data: Record<string, any> = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
const todo = keys.filter(([hd, j, r]) => !data[`${hd}-${j}-${r}`]);
console.log("todo", todo.length);
let i = 0, n = 0;
const worker = async () => {
  while (i < todo.length) {
    const [hd, j, r] = todo[i++];
    const b = await B.getBefore(j, r, hd).catch(() => null);
    if (b) data[`${hd}-${j}-${r}`] = { ex: b.exTime, st: b.exST, course: b.exCourse, tilt: b.tilt, w: b.weather };
    if (++n % 200 === 0) { fs.writeFileSync(out, JSON.stringify(data)); console.log(n); }
  }
};
await Promise.all(Array.from({ length: 6 }, worker));
fs.writeFileSync(out, JSON.stringify(data)); console.log("done", Object.keys(data).length);
