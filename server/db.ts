import { eq, desc, asc, and, or, like, inArray, isNotNull, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, InsertDimensionamento, users, uploadSessions, agentDayRecords, reasonAgentRecords, campaignAgentRecords, dispositionAgentRecords, dimensionamento } from "../drizzle/schema";
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

/**
 * Cria nova sessão de upload e apaga sessões antigas do mesmo tipo.
 * Comportamento "relatório diário": cada importação substitui a anterior do mesmo tipo.
 * Retorna o ID da nova sessão.
 */
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

  // 1. Buscar sessões antigas do mesmo tipo para deletar dados
  const oldSessions = await db
    .select({ id: uploadSessions.id })
    .from(uploadSessions)
    .where(eq(uploadSessions.reportType, data.reportType));

  if (oldSessions.length > 0) {
    const oldIds = oldSessions.map(s => s.id);
    // Deletar registros antigos do tipo correspondente
    switch (data.reportType) {
      case "AgentDay":
        await db.delete(agentDayRecords).where(inArray(agentDayRecords.sessionId, oldIds));
        break;
      case "ReasonAgent":
        await db.delete(reasonAgentRecords).where(inArray(reasonAgentRecords.sessionId, oldIds));
        break;
      case "CampaignAgent":
        await db.delete(campaignAgentRecords).where(inArray(campaignAgentRecords.sessionId, oldIds));
        break;
      case "DispositionAgent":
        await db.delete(dispositionAgentRecords).where(inArray(dispositionAgentRecords.sessionId, oldIds));
        break;
    }
    // Deletar sessões antigas
    await db.delete(uploadSessions).where(inArray(uploadSessions.id, oldIds));
  }

  // 2. Criar nova sessão
  const [result] = await db.insert(uploadSessions).values(data).$returningId();
  return result;
}

export async function getUploadSessions(reportType?: string) {
  const db = await getDb();
  if (!db) return [];
  if (reportType) {
    return await db.select().from(uploadSessions)
      .where(eq(uploadSessions.reportType, reportType as any))
      .orderBy(desc(uploadSessions.createdAt));
  }
  return await db.select().from(uploadSessions).orderBy(desc(uploadSessions.createdAt));
}

/**
 * Retorna o ID da sessão mais recente de um dado tipo.
 * Usado como fallback quando nenhuma sessão está selecionada.
 */
export async function getLatestSessionId(reportType: "AgentDay" | "ReasonAgent" | "CampaignAgent" | "DispositionAgent"): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ id: uploadSessions.id })
    .from(uploadSessions)
    .where(eq(uploadSessions.reportType, reportType))
    .orderBy(desc(uploadSessions.createdAt))
    .limit(1);
  return result.length > 0 ? result[0].id : null;
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

  // Se não há sessionIds, usa a sessão mais recente do tipo AgentDay
  let sessionIds = filters.sessionIds;
  if (!sessionIds || sessionIds.length === 0) {
    const latestId = await getLatestSessionId("AgentDay");
    if (latestId) sessionIds = [latestId];
  }

  const conditions = [];
  if (sessionIds?.length) conditions.push(inArray(agentDayRecords.sessionId, sessionIds));
  if (filters.agente) conditions.push(like(agentDayRecords.agente, `%${filters.agente}%`));
  if (filters.uf) conditions.push(eq(agentDayRecords.uf, filters.uf));
  // Exclui BOTs: agentes sem login são discadores automáticos, não devem aparecer no dashboard
  conditions.push(and(isNotNull(agentDayRecords.login), ne(agentDayRecords.login, "")));

  return await db.select().from(agentDayRecords).where(and(...conditions)).orderBy(desc(agentDayRecords.chamadasAtendidas));
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

  let sessionIds = filters.sessionIds;
  if (!sessionIds || sessionIds.length === 0) {
    const latestId = await getLatestSessionId("ReasonAgent");
    if (latestId) sessionIds = [latestId];
  }

  const conditions = [];
  if (sessionIds?.length) conditions.push(inArray(reasonAgentRecords.sessionId, sessionIds));
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

  let sessionIds = filters.sessionIds;
  if (!sessionIds || sessionIds.length === 0) {
    const latestId = await getLatestSessionId("CampaignAgent");
    if (latestId) sessionIds = [latestId];
  }

  const conditions = [];
  if (sessionIds?.length) conditions.push(inArray(campaignAgentRecords.sessionId, sessionIds));
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

  let sessionIds = filters.sessionIds;
  if (!sessionIds || sessionIds.length === 0) {
    const latestId = await getLatestSessionId("DispositionAgent");
    if (latestId) sessionIds = [latestId];
  }

  const conditions = [];
  if (sessionIds?.length) conditions.push(inArray(dispositionAgentRecords.sessionId, sessionIds));
  if (filters.supervisor) conditions.push(like(dispositionAgentRecords.nomeSupervisor, `%${filters.supervisor}%`));

  if (conditions.length > 0) return await db.select().from(dispositionAgentRecords).where(and(...conditions));
  return await db.select().from(dispositionAgentRecords);
}

// ─── Dimensionamento ──────────────────────────────────────────────────────────

export async function getDimensionamento(filters: {
  celula?: string;
  supervisor?: string;
  turno?: string;
  uf?: string;
  status?: string;
  search?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters.celula) conditions.push(eq(dimensionamento.celula, filters.celula));
  if (filters.supervisor) conditions.push(eq(dimensionamento.supervisor, filters.supervisor));
  if (filters.turno) conditions.push(eq(dimensionamento.turno, filters.turno));
  if (filters.uf) conditions.push(eq(dimensionamento.uf, filters.uf));
  if (filters.status) conditions.push(eq(dimensionamento.status, filters.status));
  if (filters.search) {
    conditions.push(
      or(
        like(dimensionamento.nome, `%${filters.search}%`),
        like(dimensionamento.login, `%${filters.search}%`)
      )
    );
  }
  if (conditions.length > 0) {
    return await db.select().from(dimensionamento).where(and(...conditions)).orderBy(asc(dimensionamento.nome));
  }
  return await db.select().from(dimensionamento).orderBy(asc(dimensionamento.nome));
}

export async function insertDimensionamento(data: InsertDimensionamento) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(dimensionamento).values(data).$returningId();
  return result;
}

export async function updateDimensionamento(id: number, data: Partial<InsertDimensionamento>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dimensionamento).set(data).where(eq(dimensionamento.id, id));
}

export async function deleteDimensionamento(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dimensionamento).where(eq(dimensionamento.id, id));
}

export async function getDimensionamentoById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dimensionamento).where(eq(dimensionamento.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getDimensionamentoStats() {
  const db = await getDb();
  if (!db) return { total: 0, ativos: 0, celulas: [], supervisores: [], turnos: [], ufs: [] };
  const all = await db.select().from(dimensionamento);
  const ativos = all.filter(r => r.status?.toUpperCase() === "ATIVO");
  const celulas = Array.from(new Set(all.map(r => r.celula).filter(Boolean))).sort() as string[];
  const supervisores = Array.from(new Set(all.map(r => r.supervisor).filter(Boolean))).sort() as string[];
  const turnos = Array.from(new Set(all.map(r => r.turno).filter(Boolean))).sort() as string[];
  const ufs = Array.from(new Set(all.map(r => r.uf).filter(Boolean))).sort() as string[];
  return { total: all.length, ativos: ativos.length, celulas, supervisores, turnos, ufs };
}
