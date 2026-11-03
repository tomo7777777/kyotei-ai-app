import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const DISK_DIR = path.resolve(process.cwd(), ".htmlcache");
try { fs.mkdirSync(DISK_DIR, { recursive: true }); } catch {}
function diskGet(url: string, ttl: number): string | null {
  try {
    const f = path.join(DISK_DIR, crypto.createHash("md5").update(url).digest("hex"));
    const st = fs.statSync(f);
    if (Date.now() - st.mtimeMs < ttl) return fs.readFileSync(f, "utf8");
  } catch {}
  return null;
}
function diskPut(url: string, body: string) {
  try { fs.writeFileSync(path.join(DISK_DIR, crypto.createHash("md5").update(url).digest("hex")), body); } catch {}
}

const BASE = "https://www.boatrace.jp/owpc/pc";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// ---------- fetch with cache + concurrency limit ----------
type CacheEntry = { at: number; ttl: number; body: string };
const htmlCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();
let active = 0, bgActive = 0;
const queue: (() => void)[] = [];   // requests from people opening the app (served first)
const bgQueue: (() => void)[] = []; // background analysis of all races
const MAX_CONC = 48, BG_MAX = 36;   // boatrace.jp answers each request in ~10s but handles many in parallel; keep 12 slots for app users
const bgCtx = new AsyncLocalStorage<boolean>();
export function runBg<T>(fn: () => Promise<T>): Promise<T> { return bgCtx.run(true, fn); }
function acquire(): Promise<boolean> {
  const bg = bgCtx.getStore() === true;
  return new Promise((res) => {
    if (active < MAX_CONC && (!bg || bgActive < BG_MAX)) { active++; if (bg) bgActive++; res(bg); }
    else (bg ? bgQueue : queue).push(() => res(bg));
  });
}
function release(bg: boolean) {
  active--; if (bg) bgActive--;
  const next = queue.shift();
  if (next) { active++; next(); return; }
  if (bgActive < BG_MAX) { const n2 = bgQueue.shift(); if (n2) { active++; bgActive++; n2(); } }
}

export async function fetchHtml(url: string, ttlMs: number): Promise<string> {
  const c = htmlCache.get(url);
  if (c && Date.now() - c.at < c.ttl) return c.body;
  if (ttlMs >= 3600_000) {
    const d = diskGet(url, ttlMs);
    if (d) { htmlCache.set(url, { at: Date.now(), ttl: ttlMs, body: d }); return d; }
  }
  if (inflight.has(url)) return inflight.get(url)!;
  const p = (async () => {
    const isBg = await acquire();
    try {
      let lastErr: unknown;
      for (let i = 0; i < 2; i++) {
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 30000);
          const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" }, signal: ctl.signal });
          clearTimeout(t);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const body = await r.text();
          htmlCache.set(url, { at: Date.now(), ttl: ttlMs, body });
          if (ttlMs >= 3600_000) diskPut(url, body);
          return body;
        } catch (e) {
          lastErr = e;
        }
      }
      if (c) return c.body; // stale fallback
      throw lastErr;
    } finally {
      release(isBg);
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

// ---------- helpers ----------
const z2h = (s: string) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
const clean = (s: string) => z2h(s.replace(/\s+/g, " ").trim());
const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const v = parseFloat(z2h(s).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
};

export function jstNow(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000); // use getUTC* for JST fields
}
export function todayHd(): string {
  const d = jstNow();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function jstMinutesNow(hd: string): number {
  const today = todayHd();
  if (hd > today) return -9999;
  if (hd < today) return 99999;
  const d = jstNow();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
const toMin = (hhmm: string) => {
  const m = hhmm.match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
};

export const VENUES: Record<string, string> = {
  "01": "桐生", "02": "戸田", "03": "江戸川", "04": "平和島", "05": "多摩川", "06": "浜名湖",
  "07": "蒲郡", "08": "常滑", "09": "津", "10": "三国", "11": "びわこ", "12": "住之江",
  "13": "尼崎", "14": "鳴門", "15": "丸亀", "16": "児島", "17": "宮島", "18": "徳山",
  "19": "下関", "20": "若松", "21": "芦屋", "22": "福岡", "23": "唐津", "24": "大村",
};

// ---------- venues of the day ----------
export type Venue = {
  jcd: string; name: string; status: string; title: string; day: string; grade: string; timeZone: string; finished: boolean;
};
export async function getVenues(hd: string): Promise<Venue[]> {
  const html = await fetchHtml(`${BASE}/race/index?hd=${hd}`, 60_000);
  const $ = cheerio.load(html);
  const out: Venue[] = [];
  $("div.table1 table tbody").each((_, tb) => {
    const a = $(tb).find("a[href*='raceindex']").first();
    const m = (a.attr("href") || "").match(/jcd=(\d{2})/);
    if (!m) return;
    const tds = $(tb).find("tr").first().children("td");
    const status = clean($(tds[1]).text());
    const cls = tds.map((_, td) => $(td).attr("class") || "").get().join(" ");
    let grade = "一般";
    if (/is-SGa|is-SG/.test(cls)) grade = "SG";
    else if (/is-G1/.test(cls)) grade = "G1";
    else if (/is-G2/.test(cls)) grade = "G2";
    else if (/is-G3/.test(cls)) grade = "G3";
    let timeZone = "";
    if (/is-nighter/.test(cls)) timeZone = "ナイター";
    else if (/is-morning/.test(cls)) timeZone = "モーニング";
    else if (/is-midnight/.test(cls)) timeZone = "ミッドナイト";
    else if (/is-summer/.test(cls)) timeZone = "サマー";
    let dayCell = "";
    tds.each((_, td) => {
      const h = $(td).html() || "";
      if (!dayCell && /\d+\/\d+-\d+\/\d+/.test(h) && /<br/i.test(h)) {
        dayCell = h.split(/<br\s*\/?>/i).map((x) => clean(cheerio.load(x).text())).join(" ");
      }
    });
    out.push({
      jcd: m[1],
      name: VENUES[m[1]] || $(tb).find("img").first().attr("alt") || m[1],
      status,
      title: clean(a.text()),
      day: dayCell,
      grade: /venus/.test(cls) ? grade + "・女子" : grade,
      timeZone,
      finished: /最終Ｒ発売終了|最終R発売終了|中止/.test(status),
    });
  });
  return out;
}

// ---------- race card ----------
export type SeriesRun = { frame: number | null; course: number | null; st: number | null; rank: string };
export type Entry = {
  lane: number; toban: string; name: string; cls: string; branch: string; age: number | null; weight: number | null;
  f: number; l: number; avgST: number | null;
  natWin: number | null; nat2: number | null; nat3: number | null;
  locWin: number | null; loc2: number | null; loc3: number | null;
  motorNo: string; motor2: number | null; motor3: number | null;
  boatNo: string; boat2: number | null; boat3: number | null;
  series: SeriesRun[];
};
export type Card = { jcd: string; rno: number; hd: string; raceTitle: string; deadlines: (string | null)[]; entries: Entry[] };

function parseDeadlines($: cheerio.CheerioAPI): (string | null)[] {
  const out: (string | null)[] = [];
  $("div.table1").first().find("tbody tr").first().children("td").each((i, td) => {
    if (i === 0) return;
    const t = clean($(td).text());
    out.push(/\d+:\d+/.test(t) ? t : null);
  });
  return out;
}

export async function getCard(jcd: string, rno: number, hd: string): Promise<Card> {
  const html = await fetchHtml(`${BASE}/race/racelist?rno=${rno}&jcd=${jcd}&hd=${hd}`, 10 * 60_000);
  const $ = cheerio.load(html);
  const deadlines = parseDeadlines($);
  const raceTitle = clean($(".title16_titleDetail__add2020").first().text());
  const entries: Entry[] = [];
  $("div.table1.is-tableFixed__3rdadd table tbody").each((_, tb) => {
    const trs = $(tb).children("tr");
    const tds = $(trs[0]).children("td");
    if (tds.length < 9) return;
    const lane = num($(tds[0]).text()) || entries.length + 1;
    const info = $(tds[2]);
    const divs = info.find("div");
    const first = clean($(divs[0]).text()); // 4357 / A1
    const toban = (first.match(/\d{4}/) || [""])[0];
    const cls = clean($(divs[0]).find("span").text());
    const name = clean($(divs[1]).text()).replace(/\s+/g, " ");
    const third = $(divs[2]).html() || "";
    const [branchPart, agePart] = third.split(/<br\s*\/?>/i).map((s) => clean(cheerio.load(s).text()));
    const ageM = (agePart || "").match(/(\d+)歳\/([\d.]+)kg/);
    const sp = (i: number) => ($(tds[i]).html() || "").split(/<br\s*\/?>/i).map((s) => clean(cheerio.load(s).text()));
    const fl = sp(3), nat = sp(4), loc = sp(5), mot = sp(6), bt = sp(7);
    // series
    const rows = [0, 1, 2, 3].map((r) => {
      const cells = $(trs[r]).children("td");
      const start = r === 0 ? 9 : 0;
      const arr: { text: string; cls: string }[] = [];
      cells.each((i, td) => {
        if (i < start) return;
        if (r === 0 && i === cells.length - 1) return; // next race link
        arr.push({ text: clean($(td).text()), cls: $(td).attr("class") || "" });
      });
      return arr;
    });
    const series: SeriesRun[] = [];
    for (let k = 0; k < rows[0].length; k++) {
      const rnoTxt = rows[0][k]?.text;
      if (!rnoTxt) continue;
      const fm = (rows[0][k].cls.match(/is-boatColor(\d)/) || [])[1];
      series.push({
        frame: fm ? parseInt(fm) : null,
        course: num(rows[1][k]?.text),
        st: num(rows[2][k]?.text),
        rank: rows[3][k]?.text || "",
      });
    }
    entries.push({
      lane, toban, name, cls, branch: branchPart || "",
      age: ageM ? parseInt(ageM[1]) : null, weight: ageM ? parseFloat(ageM[2]) : null,
      f: num(fl[0]) || 0, l: num(fl[1]) || 0, avgST: num(fl[2]),
      natWin: num(nat[0]), nat2: num(nat[1]), nat3: num(nat[2]),
      locWin: num(loc[0]), loc2: num(loc[1]), loc3: num(loc[2]),
      motorNo: mot[0] || "", motor2: num(mot[1]), motor3: num(mot[2]),
      boatNo: bt[0] || "", boat2: num(bt[1]), boat3: num(bt[2]),
      series,
    });
  });
  return { jcd, rno, hd, raceTitle, deadlines, entries };
}

const dlCache = new Map<string, { at: number; v: (string | null)[] }>();
export async function getDeadlines(jcd: string, hd: string): Promise<(string | null)[]> {
  const k = `${hd}-${jcd}`; const c = dlCache.get(k);
  if (c && c.v.length && Date.now() - c.at < 2 * 3600_000) return c.v; // deadlines rarely change; keep 2h
  const card = await getCard(jcd, 1, hd);
  if (card.deadlines.length) dlCache.set(k, { at: Date.now(), v: card.deadlines });
  return card.deadlines;
}

// ---------- odds ----------
export async function getOdds3t(jcd: string, rno: number, hd: string): Promise<Record<string, number>> {
  const html = await fetchHtml(`${BASE}/race/odds3t?rno=${rno}&jcd=${jcd}&hd=${hd}`, 60_000);
  const $ = cheerio.load(html);
  const out: Record<string, number> = {};
  const table = $("div.table1 table").eq(1);
  const second: number[] = [0, 0, 0, 0, 0, 0];
  table.find("tbody tr").each((_, tr) => {
    const tds = $(tr).children("td").toArray();
    let idx = 0;
    for (let col = 0; col < 6; col++) {
      const td = tds[idx];
      if (!td) break;
      if ($(td).attr("rowspan")) {
        second[col] = num($(td).text()) || 0;
        idx++;
      }
      const third = num($(tds[idx]).text());
      const odd = num($(tds[idx + 1]).text());
      idx += 2;
      if (third && second[col] && odd && odd > 0) out[`${col + 1}-${second[col]}-${third}`] = odd;
    }
  });
  return out;
}

export async function getOdds2t(jcd: string, rno: number, hd: string): Promise<Record<string, number>> {
  const html = await fetchHtml(`${BASE}/race/odds2tf?rno=${rno}&jcd=${jcd}&hd=${hd}`, 60_000);
  const $ = cheerio.load(html);
  const out: Record<string, number> = {};
  const table = $("div.table1 table").eq(1);
  table.find("tbody tr").each((_, tr) => {
    const tds = $(tr).children("td").toArray();
    for (let col = 0; col < 6; col++) {
      const sec = num($(tds[col * 2]).text());
      const odd = num($(tds[col * 2 + 1]).text());
      if (sec && odd && odd > 0) out[`${col + 1}-${sec}`] = odd;
    }
  });
  return out;
}

export async function getOdds2f(jcd: string, rno: number, hd: string): Promise<Record<string, number>> {
  const html = await fetchHtml(`${BASE}/race/odds2tf?rno=${rno}&jcd=${jcd}&hd=${hd}`, 60_000);
  const $ = cheerio.load(html);
  const out: Record<string, number> = {};
  $("div.table1 table").eq(2).find("tbody tr").each((_, tr) => {
    const tds = $(tr).children("td").toArray();
    for (let col = 0; col < 6; col++) {
      const sec = num($(tds[col * 2]).text());
      const odd = num($(tds[col * 2 + 1]).text());
      if (sec && odd && odd > 0) out[[col + 1, sec].sort((a, b) => a - b).join("-")] = odd;
    }
  });
  return out;
}
export async function getOddsTan(jcd: string, rno: number, hd: string): Promise<Record<string, number>> {
  const html = await fetchHtml(`${BASE}/race/oddstf?rno=${rno}&jcd=${jcd}&hd=${hd}`, 60_000);
  const $ = cheerio.load(html);
  const out: Record<string, number> = {};
  $("div.table1 table").eq(1).find("tbody tr").each((_, tr) => {
    const tds = $(tr).children("td").toArray().map((td) => clean($(td).text()));
    const lane = num(tds[0]); const o = num(tds[2]);
    if (lane && o) out[String(lane)] = o;
  });
  return out;
}

// ---------- before info ----------
export type Before = {
  available: boolean;
  exTime: Record<number, number | null>;
  tilt: Record<number, number | null>;
  exCourse: Record<number, number>; // lane -> course
  exST: Record<number, number | null>;
  extra?: Record<number, { weight: number | null; adjust: number | null; propeller: string; parts: string }>;
  weather: { temp: string; weather: string; wind: string; windDir: string; water: string; wave: string } | null;
};
export async function getBefore(jcd: string, rno: number, hd: string): Promise<Before> {
  const html = await fetchHtml(`${BASE}/race/beforeinfo?rno=${rno}&jcd=${jcd}&hd=${hd}`, 60_000);
  const $ = cheerio.load(html);
  const exTime: Record<number, number | null> = {};
  const tilt: Record<number, number | null> = {};
  const exCourse: Record<number, number> = {};
  const exST: Record<number, number | null> = {};
  let available = false;
  const extra: NonNullable<Before["extra"]> = {};
  $("div.table1 table.is-w748 tbody").each((_, tb) => {
    const trs = $(tb).find("tr").toArray();
    const tds = $(trs[0]).children("td").toArray().map((td) => clean($(td).text()));
    const lane = num(tds[0]);
    if (!lane) return;
    const adjTxt = trs[2] ? clean($(trs[2]).children("td").first().text()) : "";
    extra[lane] = { weight: num((tds[3] || "").replace("kg", "")), adjust: num(adjTxt), propeller: tds[6] || "", parts: tds[7] || "" };
    exTime[lane] = num(tds[4]);
    tilt[lane] = num(tds[5]);
    if (exTime[lane]) available = true;
  });
  $("div.table1 table.is-w238 tbody tr").each((i, tr) => {
    const lane = num($(tr).find(".table1_boatImage1Number").text());
    const stTxt = clean($(tr).find(".table1_boatImage1Time").text());
    if (!lane) return;
    exCourse[lane] = i + 1;
    const f = /F/.test(stTxt);
    const v = num(stTxt.replace("F", ""));
    exST[lane] = v === null ? null : f ? -v : v;
  });
  let weather: Before["weather"] = null;
  const w = $(".weather1");
  if (w.length) {
    const g = (c: string) => clean(w.find(`.weather1_bodyUnit.${c}`).text());
    const dirCls = w.find(".weather1_bodyUnit.is-windDirection p").attr("class") || "";
    weather = {
      temp: g("is-direction").replace("気温", "").trim(),
      weather: g("is-weather"),
      wind: g("is-wind").replace("風速", "").trim(),
      windDir: (dirCls.match(/is-wind(\d+)/) || [])[1] || "",
      water: g("is-waterTemperature").replace("水温", "").trim(),
      wave: g("is-wave").replace("波高", "").trim(),
    };
  }
  return { available, exTime, tilt, exCourse, exST, extra, weather };
}

// ---------- result ----------
export type Result = { finished: boolean; order: number[]; trifecta: string | null; trifectaPay: number | null; exacta: string | null; exactaPay: number | null; kimarite: string; win?: number | null; winPay?: number | null; quinella?: string | null; quinellaPay?: number | null };
export async function getResult(jcd: string, rno: number, hd: string): Promise<Result> {
  const html = await fetchHtml(`${BASE}/race/raceresult?rno=${rno}&jcd=${jcd}&hd=${hd}`, 3 * 60_000);
  const $ = cheerio.load(html);
  const tables = $("div.table1 table");
  const order: number[] = [];
  let trifecta: string | null = null, trifectaPay: number | null = null, exacta: string | null = null, exactaPay: number | null = null;
  let kimarite = "";
  let win: number | null = null, winPay: number | null = null, quinella: string | null = null, quinellaPay: number | null = null;
  tables.each((_, t) => {
    const head = clean($(t).find("thead").text());
    if (/着\s*枠/.test(head) || /^着/.test(head)) {
      $(t).find("tbody").each((_, tb) => {
        const tds = $(tb).find("tr").first().children("td");
        const lane = num($(tds[1]).text());
        if (lane) order.push(lane);
      });
    }
    if (/勝式/.test(head)) {
      $(t).find("tbody").each((_, tb) => {
        const tds = $(tb).find("tr").first().children("td").toArray().map((td) => clean($(td).text()));
        if (tds[0] === "3連単") { trifecta = tds[1].replace(/\s/g, ""); trifectaPay = num(tds[2]); }
        if (tds[0] === "2連単") { exacta = tds[1].replace(/\s/g, ""); exactaPay = num(tds[2]); }
        if (tds[0] === "単勝" && win == null) { win = num(tds[1]); winPay = num(tds[2]); }
        if (tds[0] === "2連複" && quinella == null) { const d = (tds[1].match(/\d/g) || []).map(Number).sort(); if (d.length === 2) { quinella = d.join("-"); quinellaPay = num(tds[2]); } }
      });
    }
    if (/決まり手/.test(head)) kimarite = clean($(t).find("tbody").text());
  });
  return { finished: !!trifecta, order, trifecta, trifectaPay, exacta, exactaPay, kimarite, win, winPay, quinella, quinellaPay };
}

// ---------- venue stats ----------
export type VenueStats = { place: number[][]; kimarite: Record<string, number>[]; period: string };
const KIMARITE = ["逃げ", "捲り", "差し", "捲り差し", "抜き", "恵まれ"];
export const NATIONAL_PLACE = [
  [55.0, 16.5, 7.5, 6.0, 7.0, 8.0],
  [14.0, 25.0, 19.5, 16.0, 13.5, 12.0],
  [12.5, 21.0, 20.5, 17.5, 15.0, 13.5],
  [10.5, 18.5, 20.5, 19.5, 16.5, 14.5],
  [6.0, 13.0, 18.0, 21.5, 22.0, 19.5],
  [2.0, 6.5, 13.5, 19.5, 26.0, 32.5],
];
export async function getVenueStats(jcd: string): Promise<VenueStats> {
  try {
    const html = await fetchHtml(`${BASE}/data/stadium?jcd=${jcd}`, 12 * 3600_000);
    const $ = cheerio.load(html);
    const txt = clean($("body").text());
    const i = txt.indexOf("コース別入着率");
    const seg = txt.slice(i, i + 1200);
    const nums = seg.split(/\s+/);
    const place: number[][] = [];
    const kim: Record<string, number>[] = [];
    // find pattern: course c followed by 12 numbers
    for (let k = 0; k < nums.length && place.length < 6; k++) {
      if (nums[k] === String(place.length + 1) && nums.slice(k + 1, k + 13).every((x) => /^\d+(\.\d+)?$/.test(x))) {
        const v = nums.slice(k + 1, k + 13).map(Number);
        if (v.slice(0, 6).reduce((a, b) => a + b, 0) > 80) {
          place.push(v.slice(0, 6));
          const kk: Record<string, number> = {};
          KIMARITE.forEach((n, j) => (kk[n] = v[6 + j]));
          kim.push(kk);
          k += 12;
        }
      }
    }
    const period = ((txt.match(/集計期間：([^）)]+)/) || [])[1] || "").replace(/\s*単位.*$/, "").trim();
    if (place.length === 6) return { place, kimarite: kim, period };
  } catch {}
  return { place: NATIONAL_PLACE, kimarite: [], period: "全国平均" };
}

// ---------- racer course stats ----------
export type RacerCourse = {
  toban: string;
  entryRate: (number | null)[]; // % by course
  place: (number[] | null)[]; // [1st,2nd,3rd]% by course
  top3: (number | null)[];
  courseST: (number | null)[];
  startOrder: (number | null)[];
  season: { winRate: number | null; starts: number | null; firsts: number | null; avgST: number | null; ability: number | null; period: string; finishDist: number[] } | null;
};
export async function getRacerCourse(toban: string, withSeason = true): Promise<RacerCourse> {
  const html = await fetchHtml(`${BASE}/data/racersearch/course?toban=${toban}`, 12 * 3600_000);
  const $ = cheerio.load(html);
  const tables = $("table").toArray();
  const entryRate: (number | null)[] = [], top3: (number | null)[] = [], courseST: (number | null)[] = [], startOrder: (number | null)[] = [];
  const place: (number[] | null)[] = [];
  for (const t of tables) {
    const head = clean($(t).find("thead").text());
    const rows = $(t).find("tbody tr").toArray();
    if (/進入率/.test(head)) rows.forEach((r) => entryRate.push(num($(r).find(".table1_progress2Label, td").last().text())));
    else if (/3連対率/.test(head))
      rows.forEach((r) => {
        top3.push(num($(r).find(".table1_progress2Label").text()));
        const w = [0, 0, 0];
        let any = false;
        $(r).find("span.is-progress").each((_, s) => {
          const inner = $(s).find("span").attr("class") || "";
          const k = (inner.match(/is-progress(\d)/) || [])[1];
          const v = num(($(s).attr("style") || "").replace("width:", ""));
          if (k && v !== null) { w[parseInt(k) - 1] = v; any = true; }
        });
        place.push(any || top3[top3.length - 1] === 0 ? w : null);
      });
    else if (/平均スタート/.test(head)) rows.forEach((r) => courseST.push(num($(r).find(".table1_progress2Label, td").last().text())));
    else if (/スタート順/.test(head)) rows.forEach((r) => startOrder.push(num($(r).find(".table1_progress2Label, td").last().text())));
  }
  let season: RacerCourse["season"] = null;
  if (withSeason) try {
    const sh = await fetchHtml(`${BASE}/data/racersearch/season?toban=${toban}`, 12 * 3600_000);
    const t = clean(cheerio.load(sh)("body").text());
    const g = (re: RegExp) => { const m = t.match(re); return m ? parseFloat(m[1]) : null; };
    const dist = [1, 2, 3, 4, 5, 6].map((k) => g(new RegExp(`${k}着 ([\\d.]+)%`)) || 0);
    season = {
      winRate: g(/勝率 ([\d.]+)/), starts: g(/出走回数 (\d+)回/), firsts: g(/優勝回数 (\d+)回/),
      avgST: g(/平均スタートタイミング ([\d.]+)/), ability: g(/能力指数 (\d+)/),
      period: (t.match(/集計期間：(\S+)/) || [])[1] || "", finishDist: dist,
    };
  } catch {}
  return { toban, entryRate, place, top3, courseST, startOrder, season };
}
