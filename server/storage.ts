import { myRaces, myBets, aiPicks } from "@shared/schema";
import type { MyRace, InsertMyRace, MyBet, InsertMyBet, AiPick, InsertAiPick } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
sqlite.exec(`
CREATE TABLE IF NOT EXISTS my_races (id INTEGER PRIMARY KEY AUTOINCREMENT, hd TEXT NOT NULL, jcd TEXT NOT NULL, rno INTEGER NOT NULL, memo TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS my_bets (id INTEGER PRIMARY KEY AUTOINCREMENT, race_id INTEGER NOT NULL, type TEXT NOT NULL, combo TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 100);
CREATE TABLE IF NOT EXISTS ai_picks (id INTEGER PRIMARY KEY AUTOINCREMENT, hd TEXT NOT NULL, jcd TEXT NOT NULL, rno INTEGER NOT NULL, confidence REAL NOT NULL, payload TEXT NOT NULL, deadline TEXT NOT NULL DEFAULT '');
`);

export const db = drizzle(sqlite);

export interface IStorage {
  listMyRaces(): MyRace[];
  addMyRace(r: InsertMyRace): MyRace;
  deleteMyRace(id: number): void;
  listBets(raceId: number): MyBet[];
  addBet(b: InsertMyBet): MyBet;
  deleteBet(id: number): void;
  listPicks(hd: string): AiPick[];
  upsertPick(p: InsertAiPick): void;
  deletePick(id: number): void;
}

export class DatabaseStorage implements IStorage {
  listMyRaces() { return db.select().from(myRaces).all(); }
  addMyRace(r: InsertMyRace) {
    const ex = db.select().from(myRaces).where(and(eq(myRaces.hd, r.hd), eq(myRaces.jcd, r.jcd), eq(myRaces.rno, r.rno))).get();
    return ex ?? db.insert(myRaces).values(r).returning().get();
  }
  deleteMyRace(id: number) {
    db.delete(myBets).where(eq(myBets.raceId, id)).run();
    db.delete(myRaces).where(eq(myRaces.id, id)).run();
  }
  listBets(raceId: number) { return db.select().from(myBets).where(eq(myBets.raceId, raceId)).all(); }
  addBet(b: InsertMyBet) { return db.insert(myBets).values(b).returning().get(); }
  deleteBet(id: number) { db.delete(myBets).where(eq(myBets.id, id)).run(); }
  listPicks(hd: string) { return db.select().from(aiPicks).where(eq(aiPicks.hd, hd)).all(); }
  upsertPick(p: InsertAiPick) {
    const ex = db.select().from(aiPicks).where(and(eq(aiPicks.hd, p.hd), eq(aiPicks.jcd, p.jcd), eq(aiPicks.rno, p.rno))).get();
    if (ex) db.update(aiPicks).set({ confidence: p.confidence, payload: p.payload, deadline: p.deadline }).where(eq(aiPicks.id, ex.id)).run();
    else db.insert(aiPicks).values(p).run();
  }
  deletePick(id: number) { db.delete(aiPicks).where(eq(aiPicks.id, id)).run(); }
}

export const storage = new DatabaseStorage();
