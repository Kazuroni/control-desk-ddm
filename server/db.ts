import { eq, desc, and, like, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, uploadSessions, agentDayRecords, reasonAgentRecords, campaignAgentRecords, dispositionAgentRecords } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Upload Sessions ───────────────────────────────────────────────────────────
export async function createUploadSession(data: {
  reportType: "AgentDay" | "ReasonAgent" | "CampaignAgent" | "DispositionAgent";
  fileName: string;
  fileKey?: string;
  referenceDate?: string;
  totalRows?: number;
  uploadedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(uploadSessions).values(data).$returningId();
  return result;
}

export async function getUploadSessions(reportType?: string) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(uploadSessions).orderBy(desc(uploadSessions.createdAt));
  if (reportType) {
    return await db.select().from(uploadSessions)
      .where(eq(uploadSessions.reportType, reportType as any))
      .orderBy(desc(uploadSessions.createdAt));
  }
  return await query;
}

// ─── AgentDay Records ──────────────────────────────────────────────────────────
export async function insertAgentDayRecords(sessionId: number, rows: any[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (rows.length === 0) return;
  const chunks = [];
  for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
  for (const chunk of chunks) {
    await db.insert(agentDayRecords).values(chunk.map((r: any) => ({ ...r, sessionId })));
  }
}

export async function getAgentDayRecords(filters: {
  sessionIds?: number[];
  agente?: string;
  uf?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(agentDayRecords);
  const conditions = [];
  if (filters.sessionIds?.length) conditions.push(inArray(agentDayRecords.sessionId, filters.sessionIds));
  if (filters.agente) conditions.push(like(agentDayRecords.agente, `%${filters.agente}%`));
  if (filters.uf) conditions.push(eq(agentDayRecords.uf, filters.uf));
  if (conditions.length > 0) return await db.select().from(agentDayRecords).where(and(...conditions));
  return await db.select().from(agentDayRecords).orderBy(desc(agentDayRecords.chamadasAtendidas));
}

// ─── ReasonAgent Records ───────────────────────────────────────────────────────
export async function insertReasonAgentRecords(sessionId: number, rows: any[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (rows.length === 0) return;
  const chunks = [];
  for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
  for (const chunk of chunks) {
    await db.insert(reasonAgentRecords).values(chunk.map((r: any) => ({ ...r, sessionId })));
  }
}

export async function getReasonAgentRecords(filters: { sessionIds?: number[]; agente?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.sessionIds?.length) conditions.push(inArray(reasonAgentRecords.sessionId, filters.sessionIds));
  if (filters.agente) conditions.push(like(reasonAgentRecords.agente, `%${filters.agente}%`));
  if (conditions.length > 0) return await db.select().from(reasonAgentRecords).where(and(...conditions));
  return await db.select().from(reasonAgentRecords);
}

// ─── CampaignAgent Records ─────────────────────────────────────────────────────
export async function insertCampaignAgentRecords(sessionId: number, rows: any[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (rows.length === 0) return;
  const chunks = [];
  for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
  for (const chunk of chunks) {
    await db.insert(campaignAgentRecords).values(chunk.map((r: any) => ({ ...r, sessionId })));
  }
}

export async function getCampaignAgentRecords(filters: {
  sessionIds?: number[];
  campanha?: string;
  supervisor?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.sessionIds?.length) conditions.push(inArray(campaignAgentRecords.sessionId, filters.sessionIds));
  if (filters.campanha) conditions.push(like(campaignAgentRecords.campanha, `%${filters.campanha}%`));
  if (filters.supervisor) conditions.push(like(campaignAgentRecords.nomeSupervisor, `%${filters.supervisor}%`));
  if (conditions.length > 0) return await db.select().from(campaignAgentRecords).where(and(...conditions));
  return await db.select().from(campaignAgentRecords);
}

// ─── DispositionAgent Records ──────────────────────────────────────────────────
export async function insertDispositionAgentRecords(sessionId: number, rows: any[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (rows.length === 0) return;
  const chunks = [];
  for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
  for (const chunk of chunks) {
    await db.insert(dispositionAgentRecords).values(chunk.map((r: any) => ({ ...r, sessionId })));
  }
}

export async function getDispositionAgentRecords(filters: {
  sessionIds?: number[];
  supervisor?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.sessionIds?.length) conditions.push(inArray(dispositionAgentRecords.sessionId, filters.sessionIds));
  if (filters.supervisor) conditions.push(like(dispositionAgentRecords.nomeSupervisor, `%${filters.supervisor}%`));
  if (conditions.length > 0) return await db.select().from(dispositionAgentRecords).where(and(...conditions));
  return await db.select().from(dispositionAgentRecords);
}
