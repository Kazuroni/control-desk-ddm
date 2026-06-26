import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  bigint,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Sessões de upload — cada arquivo importado gera uma sessão
export const uploadSessions = mysqlTable("upload_sessions", {
  id: int("id").autoincrement().primaryKey(),
  reportType: mysqlEnum("reportType", [
    "AgentDay",
    "ReasonAgent",
    "CampaignAgent",
    "DispositionAgent",
  ]).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }),
  referenceDate: varchar("referenceDate", { length: 32 }), // data de referência extraída do arquivo
  totalRows: int("totalRows").default(0),
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UploadSession = typeof uploadSessions.$inferSelect;

// Faixa 1 — Performance em Tempo Real (AgentDay)
export const agentDayRecords = mysqlTable("agent_day_records", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  referenceDate: varchar("referenceDate", { length: 32 }),
  agente: varchar("agente", { length: 255 }),
  login: varchar("login", { length: 128 }),
  agentesLogados: int("agentesLogados").default(0),
  chamadasAtendidas: int("chamadasAtendidas").default(0),
  chamadasManuais: int("chamadasManuais").default(0),
  contatoEfetivo: int("contatoEfetivo").default(0),
  logins: int("logins").default(0),
  idAgente: varchar("idAgente", { length: 64 }),
  tabulacoesTotal: int("tabulacoesTotal").default(0),
  totalChamadas: int("totalChamadas").default(0),
  totalContatos: int("totalContatos").default(0),
  primeiroLogin: varchar("primeiroLogin", { length: 32 }),
  tempoOcioso: varchar("tempoOcioso", { length: 32 }),
  tempoPausa: varchar("tempoPausa", { length: 32 }),
  ultimoLogout: varchar("ultimoLogout", { length: 32 }),
  pausas: int("pausas").default(0),
  tabulacoesSucesso: int("tabulacoesSucesso").default(0),
  tabulacoesSucessoNegocio: int("tabulacoesSucessoNegocio").default(0),
  tempoTabulacao: varchar("tempoTabulacao", { length: 32 }),
  tempoLogado: varchar("tempoLogado", { length: 32 }),
  pausasImprodutivas: int("pausasImprodutivas").default(0),
  uf: varchar("uf", { length: 8 }),
  produto: varchar("produto", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentDayRecord = typeof agentDayRecords.$inferSelect;

// Faixa 2 — Controle de Pausas (ReasonAgent)
export const reasonAgentRecords = mysqlTable("reason_agent_records", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  agente: varchar("agente", { length: 255 }),
  login: varchar("login", { length: 128 }),
  motivoDePausa: varchar("motivoDePausa", { length: 255 }),
  tempoTotalDePausa: varchar("tempoTotalDePausa", { length: 32 }),
  idAgente: varchar("idAgente", { length: 64 }),
  pausasTotalizadoPorCampanha: int("pausasTotalizadoPorCampanha").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReasonAgentRecord = typeof reasonAgentRecords.$inferSelect;

// Faixa 3 — Performance por Célula/Campanha (CampaignAgent)
export const campaignAgentRecords = mysqlTable("campaign_agent_records", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  agente: varchar("agente", { length: 255 }),
  login: varchar("login", { length: 128 }),
  campanha: varchar("campanha", { length: 255 }),
  logins: int("logins").default(0),
  nomeSupervisor: varchar("nomeSupervisor", { length: 255 }),
  totalChamadas: int("totalChamadas").default(0),
  totalContatos: int("totalContatos").default(0),
  tabulacoesSucessoNegocio: int("tabulacoesSucessoNegocio").default(0),
  tabulacoesSucesso: int("tabulacoesSucesso").default(0),
  uf: varchar("uf", { length: 8 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CampaignAgentRecord = typeof campaignAgentRecords.$inferSelect;

// Faixa 4 — Tabulações Excedidas (DispositionAgent)
export const dispositionAgentRecords = mysqlTable("disposition_agent_records", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  agente: varchar("agente", { length: 255 }),
  login: varchar("login", { length: 128 }),
  tabulacao: varchar("tabulacao", { length: 255 }),
  nomeSupervisor: varchar("nomeSupervisor", { length: 255 }),
  tempoTabulacao: varchar("tempoTabulacao", { length: 32 }),
  totalChamadas: int("totalChamadas").default(0),
  uf: varchar("uf", { length: 8 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DispositionAgentRecord = typeof dispositionAgentRecords.$inferSelect;
