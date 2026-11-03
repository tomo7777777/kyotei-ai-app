import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import type * as z from "zod/mini";

export const myRaces = sqliteTable("my_races", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  hd: text("hd").notNull(),
  jcd: text("jcd").notNull(),
  rno: integer("rno").notNull(),
  memo: text("memo").notNull().default(""),
});
export const insertMyRaceSchema = createInsertSchema(myRaces).omit({ id: true });
export type InsertMyRace = z.infer<typeof insertMyRaceSchema>;
export type MyRace = typeof myRaces.$inferSelect;

export const myBets = sqliteTable("my_bets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  raceId: integer("race_id").notNull(),
  type: text("type").notNull(), // "3t" | "2t"
  combo: text("combo").notNull(),
  amount: integer("amount").notNull().default(100),
});
export const insertMyBetSchema = createInsertSchema(myBets).omit({ id: true });
export type InsertMyBet = z.infer<typeof insertMyBetSchema>;
export type MyBet = typeof myBets.$inferSelect;

export const aiPicks = sqliteTable("ai_picks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  hd: text("hd").notNull(),
  jcd: text("jcd").notNull(),
  rno: integer("rno").notNull(),
  confidence: real("confidence").notNull(),
  payload: text("payload").notNull(), // JSON snapshot of prediction
  deadline: text("deadline").notNull().default(""),
});
export const insertAiPickSchema = createInsertSchema(aiPicks).omit({ id: true });
export type InsertAiPick = z.infer<typeof insertAiPickSchema>;
export type AiPick = typeof aiPicks.$inferSelect;
