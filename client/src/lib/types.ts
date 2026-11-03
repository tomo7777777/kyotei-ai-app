export type Tag = { label: string; tone: "good" | "bad" | "info"; detail: string };
export type Combo = { combo: string; prob: number; modelProb: number; marketProb: number | null; odds: number | null; ev: number | null };
export type RacerCourse = {
  toban: string;
  entryRate: (number | null)[];
  place: (number[] | null)[];
  top3: (number | null)[];
  courseST: (number | null)[];
  startOrder: (number | null)[];
  season: { winRate: number | null; starts: number | null; firsts: number | null; avgST: number | null; ability: number | null; period: string; finishDist: number[] } | null;
};
export type SeriesRun = { frame: number | null; course: number | null; st: number | null; rank: string };
export type Entry = {
  lane: number; toban: string; name: string; cls: string; branch: string; age: number | null; weight: number | null;
  f: number; l: number; avgST: number | null;
  natWin: number | null; nat2: number | null; nat3: number | null;
  locWin: number | null; loc2: number | null; loc3: number | null;
  motorNo: string; motor2: number | null; motor3: number | null;
  boatNo: string; boat2: number | null; boat3: number | null;
  series: SeriesRun[];
  course: number; exTime: number | null; exST: number | null; tilt: number | null; exRank: number | null;
  racer: RacerCourse | null; tags: Tag[];
  winProb: number; top2Prob: number; top3Prob: number; modelWin: number; marketWin: number | null; mark: string;
  factors: { label: string; value: number }[];
};
export type Result = { finished: boolean; order: number[]; trifecta: string | null; trifectaPay: number | null; exacta: string | null; exactaPay: number | null; kimarite: string; win?: number | null; winPay?: number | null; quinella?: string | null; quinellaPay?: number | null };
export type Analysis = {
  hd: string; jcd: string; venue: string; rno: number; raceTitle: string; deadline: string | null;
  status: "upcoming" | "closed" | "finished";
  entries: Entry[];
  weather: { temp: string; weather: string; wind: string; windDir: string; water: string; wave: string } | null;
  beforeAvailable: boolean; oddsAvailable: boolean;
  venueStats: { course1st: number[]; kimarite: Record<string, number>[]; period: string };
  trifecta: Combo[]; exacta: Combo[];
  confidence: number; confidenceLabel: string;
  main: Combo[]; value: Combo[]; comment: string[]; modelKind?: "ml" | "basic"; betTips?: BetTip[]; distortions?: Distortion[]; manshu?: Manshu | null; chuana?: Manshu | null;
  plan?: { createdAt: string; tier: "S" | "other"; confidence: number; main: Combo[]; manshu?: Manshu | null; manshuFixed?: boolean; chuana?: Manshu | null; hon?: { fav: number; favProb: number; qu: { combo: string; prob: number }[] } | null; entries?: { lane: number; name: string; winProb: number }[] } | null;
  pre?: { at: string; confidence: number; main: { combo: string; prob: number; odds: number | null }[] } | null;
  result: Result | null; updatedAt: string;
};
export type Venue = {
  jcd: string; name: string; status: string; title: string; day: string; grade: string; timeZone: string; finished: boolean;
  deadlines: (string | null)[]; nextRace: number | null;
};
export type PickSummary = {
  hd: string; jcd: string; venue: string; rno: number; raceTitle: string; deadline: string | null;
  confidence: number; confidenceLabel: string;
  entries: { lane: number; name: string; cls: string; mark: string; winProb: number; tags: string[] }[];
  main: Combo[]; value: Combo[]; comment: string[]; oddsAvailable: boolean; beforeAvailable: boolean; betTips?: BetTip[]; distortions?: Distortion[]; manshu?: Manshu | null; chuana?: Manshu | null; hon?: { fav: number; favProb: number; qu: { combo: string; prob: number }[] } | null;
};
export type PlanItem = PickSummary & { tier: "S" | "other"; addedAt: string; late?: boolean; result?: Result | null; hit?: boolean; manshuHit?: boolean; manshuFinal?: Manshu | null; manshuFixedAt?: string; chuana?: Manshu | null; chuanaFinal?: Manshu | null; chuanaHit?: boolean; chuana5Hit?: boolean; chuanaMornHit?: boolean; manshuMornHit?: boolean; chuana5MornHit?: boolean; himoHit?: boolean; himo?: { lanes: { lane: number; n: number; avg: number }[]; picks: string[] } | null;
  live?: { confidence: number; favLane: number | null; favName: string; favChanged: boolean } | null };
export type PicksResponse = {
  plan?: { createdAt: string; items: PlanItem[] } | null;
  targets?: PickSummary[];
  distorted?: PickSummary[];
  status: { running: boolean; done: number; total: number; updatedAt: string | null; error?: string };
  picks: PickSummary[];
  others: PickSummary[];
  history: (PickSummary & { result: Result | null; hit: boolean; hitValue: boolean })[];
  exev?: ExEvResp;
  triev?: ExEvResp;
};
export type ExEvItem = { combo: string; odds: number; aiProb?: number; mixProb: number; ev: number };
export type ExStat = { races: number; bets: number; hits: number; inv: number; ret: number };
export type ExEvResp = {
  upcoming: { hd: string; jcd: string; rno: number; venue: string; deadline: string | null; entries: { lane: number; name: string; winProb: number }[]; exEv: ExEvItem[] }[];
  done: { jcd: string; rno: number; venue: string; deadline: string | null; combos: ExEvItem[]; lastSeen: string; result?: { exacta: string | null; exactaPay: number | null } | null }[];
  today: ExStat; all: { days: ({ hd: string } & ExStat)[]; total: ExStat }; updatedAt: string | null;
};
export type MyBetOut = { id: number; raceId: number; type: string; combo: string; amount: number; prob: number | null; odds: number | null; ev: number | null; hit: boolean | null; pay: number };
export type MyRaceOut = {
  id: number; hd: string; jcd: string; rno: number; memo: string; venue: string;
  raceTitle?: string; deadline?: string | null; status?: Analysis["status"]; confidence?: number; confidenceLabel?: string; oddsAvailable?: boolean;
  bestEv?: Combo[]; main?: Combo[]; result?: Result | null; bets: MyBetOut[]; stake?: number; expReturn?: number;
  entries?: { lane: number; name: string; mark: string; winProb: number }[];
  error?: string;
};
export type RacerResponse = { toban: string; name: string; kana: string; profile: Record<string, string>; course: RacerCourse };

export type BetTip = { key: string; label: string; combos: string[]; prob: number; histRoi: number; histHit: number; highlight: boolean };
export type Distortion = { bt: "単勝" | "2連複"; combo: string; odds: number; aiProb: number; mixProb: number; ev: number };
export type Manshu = { score: number; tenkai?: { lane: number; prob: number; shape: string; seconds: number[] }[]; picks10?: { combo: string; prob: number; odds: number; estOdds: number }[]; both?: { heads: { lane: number; prob: number }[]; picks: { combo: string; prob: number; odds: number }[] } | null; alt5?: { score: number; tier: "S" | null; picks: { combo: string; prob: number; odds: number }[] } | null; hitProb?: number; arashi?: number; comb?: number; fixedAt?: string; tier: "S" | "A" | null; realOdds: boolean; reasons: string[]; picks: { combo: string; prob: number; odds: number; estOdds: number }[] };
