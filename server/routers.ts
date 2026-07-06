import { COOKIE_NAME } from "@shared/const";
import { canaisRotasRouter } from "./routers/canaisRotas";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createUploadSession,
  getUploadSessions,
  getAgentDayRecords,
  getReasonAgentRecords,
  getCampaignAgentRecords,
  getDispositionAgentRecords,
  insertAgentDayRecords,
  insertReasonAgentRecords,
  insertCampaignAgentRecords,
  insertDispositionAgentRecords,
  getDimensionamento,
  getDimensionamentoStats,
  insertDimensionamento,
  updateDimensionamento,
  deleteDimensionamento,
} from "./db";
import {
  detectReportType,
  parseAgentDay,
  parseReasonAgent,
  parseCampaignAgent,
  parseDispositionAgent,
} from "./parsers";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Carrega o dimensionamento (mapeamento agente -> turno/célula/skill)
function loadDimensionamento(): Record<string, { turno: string; celula: string; skill: string; supervisor: string; entrada: string; saida: string; uf: string }> {
  const dimPath = join(process.cwd(), "dimensionamento.json");
  if (!existsSync(dimPath)) return {};
  try {
    const data = JSON.parse(readFileSync(dimPath, "utf-8"));
    const map: Record<string, any> = {};
    for (const a of data.agents || []) {
      if (a.nome) {
        const key = a.nome.trim().toUpperCase();
        map[key] = { turno: a.turno || "", celula: a.celula || "", skill: a.skill || "", supervisor: a.supervisor || "", entrada: a.entrada || "", saida: a.saida || "", uf: a.uf || "" };
      }
      if (a.login) {
        const loginKey = `LOGIN:${a.login.trim().toLowerCase()}`;
        map[loginKey] = { turno: a.turno || "", celula: a.celula || "", skill: a.skill || "", supervisor: a.supervisor || "", entrada: a.entrada || "", saida: a.saida || "", uf: a.uf || "" };
      }
    }
    return map;
  } catch { return {}; }
}

// Helper para converter tempo HH:MM:SS em segundos
function timeToSeconds(t: string | null | undefined): number {
  if (!t) return 0;
  const parts = t.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export const appRouter = router({
  system: systemRouter,
  canaisRotas: canaisRotasRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Upload ────────────────────────────────────────────────────────────────
  dashboard: router({
    // Processa HTML de relatório e persiste no banco
    processReport: publicProcedure
      .input(z.object({
        htmlContent: z.string(),
        fileName: z.string(),
        reportType: z.enum(["AgentDay", "ReasonAgent", "CampaignAgent", "DispositionAgent"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { htmlContent, fileName } = input;

        // Detectar tipo se não informado
        const reportType = input.reportType || detectReportType(htmlContent);
        if (!reportType) throw new Error("Não foi possível detectar o tipo de relatório. Verifique o arquivo.");

        let parsed: { referenceDate: string; rows: any[] };

        switch (reportType) {
          case "AgentDay": parsed = parseAgentDay(htmlContent); break;
          case "ReasonAgent": parsed = parseReasonAgent(htmlContent); break;
          case "CampaignAgent": parsed = parseCampaignAgent(htmlContent); break;
          case "DispositionAgent": parsed = parseDispositionAgent(htmlContent); break;
          default: throw new Error("Tipo de relatório inválido");
        }

        const session = await createUploadSession({
          reportType,
          fileName,
          referenceDate: parsed.referenceDate,
          totalRows: parsed.rows.length,
          uploadedBy: ctx.user?.id,
        });

        const sessionId = session.id;

        switch (reportType) {
          case "AgentDay": await insertAgentDayRecords(sessionId, parsed.rows); break;
          case "ReasonAgent": await insertReasonAgentRecords(sessionId, parsed.rows); break;
          case "CampaignAgent": await insertCampaignAgentRecords(sessionId, parsed.rows); break;
          case "DispositionAgent": await insertDispositionAgentRecords(sessionId, parsed.rows); break;
        }

        return {
          sessionId,
          reportType,
          fileName,
          referenceDate: parsed.referenceDate,
          totalRows: parsed.rows.length,
        };
      }),

    // Lista histórico de uploads
    getSessions: publicProcedure
      .input(z.object({ reportType: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return await getUploadSessions(input?.reportType);
      }),

    // ─── Faixa 1: AgentDay ─────────────────────────────────────────────────
    getAgentDay: publicProcedure
      .input(z.object({
        sessionIds: z.array(z.number()).optional(),
        agente: z.string().optional(),
        uf: z.string().optional(),
        turno: z.string().optional(),
        celula: z.string().optional(),
        supervisor: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const rows = await getAgentDayRecords({
          sessionIds: input.sessionIds,
          agente: input.agente,
          uf: input.uf,
        });

        const dimMap = loadDimensionamento();

        // Enriquece cada linha com métricas calculadas e dados do dimensionamento
        const enriched = rows.map(row => {
          const tempoLogadoSeg = timeToSeconds(row.tempoLogado);
          const tempoOciosoSeg = timeToSeconds(row.tempoOcioso);
          const tempoPausaSeg = timeToSeconds(row.tempoPausa);
          const chamadas = row.chamadasAtendidas || 0;
          const cpc = row.contatoEfetivo || 0;
          const sucessoNeg = row.tabulacoesSucessoNegocio || 0;

          // Idle = Tempo Ocioso / Chamadas Atendidas (em segundos por chamada)
          const idleSeg = chamadas > 0 ? Math.round(tempoOciosoSeg / chamadas) : 0;
          // TMA = (Tempo Logado - Tempo Ocioso - Tempo Pausa) / Chamadas Atendidas
          const tempoFaladoSeg = Math.max(0, tempoLogadoSeg - tempoOciosoSeg - tempoPausaSeg);
          const tmaSeg = chamadas > 0 ? Math.round(tempoFaladoSeg / chamadas) : 0;
          // % CPC = CPC / Chamadas * 100
          const cpcPct = chamadas > 0 ? Math.round((cpc / chamadas) * 100 * 10) / 10 : 0;
          // % Sucesso Neg = Sucesso Neg / CPC * 100 (ou / chamadas se CPC = 0)
          const sucessoNegPct = cpc > 0 ? Math.round((sucessoNeg / cpc) * 100 * 10) / 10 : (chamadas > 0 ? Math.round((sucessoNeg / chamadas) * 100 * 10) / 10 : 0);
          // % Tempo Logado = Tempo Logado / Jornada padrão (8h = 28800s)
          const jornadaPadrao = 8 * 3600;
          const tempoLogadoPct = Math.min(100, Math.round((tempoLogadoSeg / jornadaPadrao) * 100 * 10) / 10);

          // Busca no dimensionamento por nome ou login
          const nomeKey = (row.agente || "").trim().toUpperCase();
          const loginKey = `LOGIN:${(row.login || "").trim().toLowerCase()}`;
          const dim = dimMap[nomeKey] || dimMap[loginKey] || null;

          return {
            ...row,
            // Métricas calculadas
            idleSeg,
            tmaSeg,
            cpcPct,
            sucessoNegPct,
            tempoLogadoPct,
            tempoFaladoSeg,
            // Dados do dimensionamento
            turno: dim?.turno || "",
            celula: dim?.celula || "",
            skill: dim?.skill || "",
            supervisorDim: dim?.supervisor || "",
            entradaPrevista: dim?.entrada || "",
            saidaPrevista: dim?.saida || "",
            // Flag: agente não encontrado no dimensionamento
            noDimensionamento: dim !== null,
          };
        });

        // Aplica filtros de turno/célula/supervisor (do dimensionamento)
        let filtered = enriched;
        if (input.turno) filtered = filtered.filter(r => r.turno === input.turno);
        if (input.celula) filtered = filtered.filter(r => r.celula === input.celula);
        if (input.supervisor) filtered = filtered.filter(r => r.supervisorDim === input.supervisor);

        return filtered;
      }),

    // ─── Faixa 2: TEMPOS (ReasonAgent) ─────────────────────────────────────────
    // Retorna as datas disponíveis para um tipo de relatório (histórico)
    getAvailableDates: publicProcedure
      .input(z.object({ reportType: z.enum(["AgentDay", "ReasonAgent", "CampaignAgent", "DispositionAgent"]) }))
      .query(async ({ input }) => {
        const sessions = await getUploadSessions(input.reportType);
        // Retorna datas únicas ordenadas do mais recente para o mais antigo
        const dates = Array.from(
          new Set(sessions.map(s => s.referenceDate).filter(Boolean))
        ).sort((a, b) => (b || "").localeCompare(a || ""));
        return dates as string[];
      }),

    getReasonAgent: publicProcedure
      .input(z.object({
        sessionIds: z.array(z.number()).optional(),
        agente: z.string().optional(),
        referenceDate: z.string().optional(), // filtro de data para histórico
      }))
      .query(async ({ input }) => {
        // Se referenceDate fornecida, busca sessionIds da data específica
        let sessionIds = input.sessionIds;
        if (input.referenceDate && !sessionIds) {
          const sessions = await getUploadSessions("ReasonAgent");
          const sessionsForDate = sessions.filter(s => s.referenceDate === input.referenceDate);
          sessionIds = sessionsForDate.map(s => s.id);
        }
        const rows = await getReasonAgentRecords({
          sessionIds,
          agente: input.agente,
        });

        // Carrega dimensionamento para cruzar turno
        const dimMap = loadDimensionamento();
        function getTurnoAgente(agente: string): string {
          const key = agente.toLowerCase().trim();
          for (const [k, v] of Object.entries(dimMap)) {
            if (k === key) return v.turno || "";
          }
          return "";
        }

        // Limites NR17 (obrigatórios) e outros
        const PAUSE_LIMITS: Record<string, number> = {
          "descanso 1": 10 * 60,
          "descanso 2": 10 * 60,
          "descanso 3": 10 * 60,
          "lanche": 20 * 60,
          "banheiro": 10 * 60,
          "pausa descanso 1": 10 * 60,
          "pausa descanso 2": 10 * 60,
          "pausa descanso 3": 10 * 60,
          "pausa lanche": 20 * 60,
          "pausa banheiro": 10 * 60,
        };

        function getLimiteSeg(motivo: string): number | null {
          const m = motivo.toLowerCase().trim();
          for (const [key, val] of Object.entries(PAUSE_LIMITS)) {
            if (m.includes(key)) return val;
          }
          return null;
        }

        // Classificação por categoria de pausa
        type PauseCategory = "nr17" | "banheiro" | "feedback" | "outros";
        function getCategoria(motivo: string): PauseCategory {
          const m = motivo.toLowerCase().trim();
          if (m.includes("descanso") || m.includes("lanche") || m.includes("pausa descanso") || m.includes("pausa lanche")) return "nr17";
          if (m.includes("banheiro")) return "banheiro";
          if (m.includes("feedback") || m.includes("treinamento") || m.includes("training")) return "feedback";
          return "outros";
        }

        function isImprodutiva(motivo: string): boolean {
          const m = motivo.toLowerCase().trim();
          if (m.includes("feedback") || m.includes("treinamento")) return false;
          if (m.includes("erro de sistema") || m.includes("erro sistema") || m === "erro") return false;
          if (m.includes("atendimento chat") || m === "chat") return false;
          return true;
        }

        // Estruturas de agrupamento
        const byAgenteMotivo: Record<string, {
          agente: string; motivo: string; categoria: PauseCategory;
          totalSegundos: number; totalPausas: number;
          limiteSegundos: number | null; excedeuLimite: boolean; excedidoSegundos: number;
        }> = {};
        const byMotivo: Record<string, { motivo: string; totalPausas: number; totalSegundos: number; agentes: Set<string>; improdutiva: boolean; categoria: PauseCategory }> = {};
        const byAgenteImprod: Record<string, { agente: string; totalSegundos: number; totalPausas: number; pausasExcedidas: number }> = {};
        const byAgente: Record<string, { agente: string; totalSegundos: number; totalPausas: number }> = {};

        // NR17: por agente + motivo NR17 (para ver quem estourou cada pausa obrigatória)
        const byAgenteNR17: Record<string, {
          agente: string; motivo: string; totalSegundos: number; totalPausas: number;
          limiteSegundos: number; excedeuLimite: boolean; excedidoSegundos: number; turno: string;
        }> = {};

        // Banheiro: por agente (tempo total + ocorrências)
        const byAgenteBanheiro: Record<string, { agente: string; totalSegundos: number; totalPausas: number }> = {};

        // Feedback/Treinamento: por agente
        const byAgenteFeedback: Record<string, { agente: string; motivo: string; totalSegundos: number; totalPausas: number }> = {};

        // Outros: por agente + motivo (tudo que não é NR17, banheiro, feedback)
        const byAgenteOutros: Record<string, { agente: string; motivo: string; totalSegundos: number; totalPausas: number }> = {};

        for (const row of rows) {
          const motivo = row.motivoDePausa || "Sem motivo";
          const segundos = timeToSeconds(row.tempoTotalDePausa);
          const pausas = row.pausasTotalizadoPorCampanha || 0;
          const improd = isImprodutiva(motivo);
          const limite = getLimiteSeg(motivo);
          // Regra: 11 min em pausa de 10 min já é estourado (excede o limite sem tolerância)
          const excedeu = limite !== null && segundos > limite;
          const excedidoSeg = excedeu && limite !== null ? Math.max(0, segundos - limite) : 0;
          const categoria = getCategoria(motivo);
          const agente = row.agente || "Desconhecido";

          // Por motivo (visão geral)
          if (!byMotivo[motivo]) byMotivo[motivo] = { motivo, totalPausas: 0, totalSegundos: 0, agentes: new Set(), improdutiva: improd, categoria };
          byMotivo[motivo].totalPausas += pausas;
          byMotivo[motivo].totalSegundos += segundos;
          if (row.agente) byMotivo[motivo].agentes.add(row.agente);

          // Por agente (geral)
          if (!byAgente[agente]) byAgente[agente] = { agente, totalSegundos: 0, totalPausas: 0 };
          byAgente[agente].totalSegundos += segundos;
          byAgente[agente].totalPausas += pausas;

          // Por agente (improdutivas)
          if (improd) {
            if (!byAgenteImprod[agente]) byAgenteImprod[agente] = { agente, totalSegundos: 0, totalPausas: 0, pausasExcedidas: 0 };
            byAgenteImprod[agente].totalSegundos += segundos;
            byAgenteImprod[agente].totalPausas += pausas;
            if (excedeu) byAgenteImprod[agente].pausasExcedidas += 1;
          }

          // Por agente + motivo (abusadores)
          const key = `${agente}||${motivo}`;
          if (!byAgenteMotivo[key]) {
            byAgenteMotivo[key] = { agente, motivo, categoria, totalSegundos: 0, totalPausas: 0, limiteSegundos: limite, excedeuLimite: false, excedidoSegundos: 0 };
          }
          byAgenteMotivo[key].totalSegundos += segundos;
          byAgenteMotivo[key].totalPausas += pausas;
          if (excedeu) { byAgenteMotivo[key].excedeuLimite = true; byAgenteMotivo[key].excedidoSegundos += excedidoSeg; }

          // NR17
          if (categoria === "nr17" && limite !== null) {
            const nr17Key = `${agente}||${motivo}`;
            if (!byAgenteNR17[nr17Key]) byAgenteNR17[nr17Key] = { agente, motivo, totalSegundos: 0, totalPausas: 0, limiteSegundos: limite, excedeuLimite: false, excedidoSegundos: 0, turno: getTurnoAgente(agente) };
            byAgenteNR17[nr17Key].totalSegundos += segundos;
            byAgenteNR17[nr17Key].totalPausas += pausas;
            if (excedeu) { byAgenteNR17[nr17Key].excedeuLimite = true; byAgenteNR17[nr17Key].excedidoSegundos += excedidoSeg; }
          }

          // Banheiro
          if (categoria === "banheiro") {
            if (!byAgenteBanheiro[agente]) byAgenteBanheiro[agente] = { agente, totalSegundos: 0, totalPausas: 0 };
            byAgenteBanheiro[agente].totalSegundos += segundos;
            byAgenteBanheiro[agente].totalPausas += pausas;
          }

          // Feedback/Treinamento
          if (categoria === "feedback") {
            const fbKey = `${agente}||${motivo}`;
            if (!byAgenteFeedback[fbKey]) byAgenteFeedback[fbKey] = { agente, motivo, totalSegundos: 0, totalPausas: 0 };
            byAgenteFeedback[fbKey].totalSegundos += segundos;
            byAgenteFeedback[fbKey].totalPausas += pausas;
          }

          // Outros
          if (categoria === "outros") {
            const outKey = `${agente}||${motivo}`;
            if (!byAgenteOutros[outKey]) byAgenteOutros[outKey] = { agente, motivo, totalSegundos: 0, totalPausas: 0 };
            byAgenteOutros[outKey].totalSegundos += segundos;
            byAgenteOutros[outKey].totalPausas += pausas;
          }
        }

        const motivoChart = Object.values(byMotivo)
          .map(m => ({ ...m, agentes: m.agentes.size }))
          .sort((a, b) => b.totalSegundos - a.totalSegundos);

        const motivoImprodChart = Object.values(byMotivo)
          .filter(m => m.improdutiva)
          .map(m => ({ ...m, agentes: m.agentes.size }))
          .sort((a, b) => b.totalSegundos - a.totalSegundos);

        const agenteRanking = Object.values(byAgenteImprod)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 20);

        const agenteRankingGeral = Object.values(byAgente)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 20);

        const abusadoresPausa = Object.values(byAgenteMotivo)
          .filter(r => r.excedeuLimite)
          .sort((a, b) => b.excedidoSegundos - a.excedidoSegundos)
          .slice(0, 30);

        // NR17: quem estourou pausas obrigatórias
        const nr17Abusadores = Object.values(byAgenteNR17)
          .filter(r => r.excedeuLimite)
          .sort((a, b) => b.excedidoSegundos - a.excedidoSegundos);

        // NR17: todos (incluindo quem não estourou, para visão completa)
        const nr17Todos = Object.values(byAgenteNR17)
          .sort((a, b) => b.totalSegundos - a.totalSegundos);

        // Banheiro: ranking por tempo total
        const banheiroRanking = Object.values(byAgenteBanheiro)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 20);

        // Feedback/Treinamento: ranking
        const feedbackRanking = Object.values(byAgenteFeedback)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 20);

        // Outros: ranking por agente + motivo
        const outrosRanking = Object.values(byAgenteOutros)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 30);

        // Motivos únicos da categoria "outros" para filtro
        const outrosMotivos = Array.from(new Set(Object.values(byAgenteOutros).map(r => r.motivo))).sort();

        // % pausa total por agente: totalPausas / tempoLogado (precisa cruzar com AgentDay)
        // Retornamos o total de segundos por agente para o frontend calcular
        const pausaTotalPorAgente = Object.values(byAgente)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 30);

        const pausaLimites = Object.entries(PAUSE_LIMITS).map(([motivo, seg]) => ({
          motivo, limiteMin: Math.round(seg / 60)
        }));

        return {
          rows, motivoChart, motivoImprodChart, agenteRanking, agenteRankingGeral,
          abusadoresPausa, pausaLimites,
          nr17Abusadores, nr17Todos,
          banheiroRanking, feedbackRanking, outrosRanking, outrosMotivos,
          pausaTotalPorAgente,
        };
      }),

    // ─── Faixa 3: CampaignAgent ────────────────────────────────────────────
    getCampaignAgent: publicProcedure
      .input(z.object({
        sessionIds: z.array(z.number()).optional(),
        campanha: z.string().optional(),
        supervisor: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const rows = await getCampaignAgentRecords({
          sessionIds: input.sessionIds,
          campanha: input.campanha,
          supervisor: input.supervisor,
        });

        // Agrupa por campanha
        const byCampanha: Record<string, {
          campanha: string;
          supervisores: Set<string>;
          totalChamadas: number;
          totalContatos: number;
          tabulacoesSucesso: number;
          tabulacoesSucessoNegocio: number;
          agentes: number;
        }> = {};

        for (const row of rows) {
          const camp = row.campanha || "Sem campanha";
          if (!byCampanha[camp]) {
            byCampanha[camp] = {
              campanha: camp,
              supervisores: new Set(),
              totalChamadas: 0,
              totalContatos: 0,
              tabulacoesSucesso: 0,
              tabulacoesSucessoNegocio: 0,
              agentes: 0,
            };
          }
          byCampanha[camp].totalChamadas += row.totalChamadas || 0;
          byCampanha[camp].totalContatos += row.totalContatos || 0;
          byCampanha[camp].tabulacoesSucesso += row.tabulacoesSucesso || 0;
          byCampanha[camp].tabulacoesSucessoNegocio += row.tabulacoesSucessoNegocio || 0;
          byCampanha[camp].agentes += 1;
          if (row.nomeSupervisor) byCampanha[camp].supervisores.add(row.nomeSupervisor);
        }

        const campanhaChart = Object.values(byCampanha)
          .map(c => ({ ...c, supervisores: Array.from(c.supervisores).filter(s => s && !/^\d+$/.test(s.trim())).join(", ") }))
          .sort((a, b) => b.totalChamadas - a.totalChamadas);

        // Visão por agente/célula: agrega chamadas e contatos por agente+campanha
        const byAgenteCampanha: Record<string, {
          agente: string; campanha: string; nomeSupervisor: string;
          totalChamadas: number; totalContatos: number;
          tabulacoesSucesso: number; tabulacoesSucessoNegocio: number;
        }> = {};
        for (const row of rows) {
          const key = `${row.agente}||${row.campanha}`;
          if (!byAgenteCampanha[key]) {
            byAgenteCampanha[key] = {
              agente: row.agente || "",
              campanha: row.campanha || "",
              nomeSupervisor: row.nomeSupervisor || "",
              totalChamadas: 0, totalContatos: 0,
              tabulacoesSucesso: 0, tabulacoesSucessoNegocio: 0,
            };
          }
          byAgenteCampanha[key].totalChamadas += row.totalChamadas || 0;
          byAgenteCampanha[key].totalContatos += row.totalContatos || 0;
          byAgenteCampanha[key].tabulacoesSucesso += row.tabulacoesSucesso || 0;
          byAgenteCampanha[key].tabulacoesSucessoNegocio += row.tabulacoesSucessoNegocio || 0;
        }
        const agenteCampanhaList = Object.values(byAgenteCampanha)
          .sort((a, b) => b.totalChamadas - a.totalChamadas);

        return { rows, campanhaChart, agenteCampanhaList };
      }),

    // ─── Faixa 4: DispositionAgent ─────────────────────────────────────────
    getDispositionAgent: publicProcedure
      .input(z.object({
        sessionIds: z.array(z.number()).optional(),
        supervisor: z.string().optional(),
        minTempoSeg: z.number().optional(),   // filtro: tempo mínimo em segundos
        minChamadas: z.number().optional(),    // filtro: mínimo de chamadas
      }))
      .query(async ({ input }) => {
        const rows = await getDispositionAgentRecords({
          sessionIds: input.sessionIds,
          supervisor: input.supervisor,
        });

        // Métrica principal: ocorrências (cada linha = 1 tabulação excedida)
        const byAgente: Record<string, {
          agente: string; supervisor: string;
          ocorrencias: number; totalSegundos: number; totalChamadas: number;
        }> = {};
        const bySupervisor: Record<string, {
          supervisor: string;
          ocorrencias: number; totalSegundos: number; totalChamadas: number; agentesSet: Set<string>;
        }> = {};
        // Por agente+tabulação para ranking unificado (excedidas + tempo segurado)
        const byAgenteTab: Record<string, {
          agente: string; supervisor: string; tabulacao: string;
          ocorrencias: number; totalSegundos: number; totalChamadas: number;
        }> = {};

        for (const row of rows) {
          const agente = row.agente || "Desconhecido";
          const supervisor = row.nomeSupervisor || "Sem supervisor";
          const segundos = timeToSeconds(row.tempoTabulacao);
          const tabulacao = row.tabulacao || "Sem tabulação";

          if (!byAgente[agente]) byAgente[agente] = { agente, supervisor, ocorrencias: 0, totalSegundos: 0, totalChamadas: 0 };
          byAgente[agente].ocorrencias += 1;
          byAgente[agente].totalSegundos += segundos;
          byAgente[agente].totalChamadas += row.totalChamadas || 0;

          if (!bySupervisor[supervisor]) bySupervisor[supervisor] = { supervisor, ocorrencias: 0, totalSegundos: 0, totalChamadas: 0, agentesSet: new Set() };
          bySupervisor[supervisor].ocorrencias += 1;
          bySupervisor[supervisor].totalSegundos += segundos;
          bySupervisor[supervisor].totalChamadas += row.totalChamadas || 0;
          bySupervisor[supervisor].agentesSet.add(agente);

          // Por agente + tabulação
          const keyAT = `${agente}||${tabulacao}`;
          if (!byAgenteTab[keyAT]) byAgenteTab[keyAT] = { agente, supervisor, tabulacao, ocorrencias: 0, totalSegundos: 0, totalChamadas: 0 };
          byAgenteTab[keyAT].ocorrencias += 1;
          byAgenteTab[keyAT].totalSegundos += segundos;
          byAgenteTab[keyAT].totalChamadas += row.totalChamadas || 0;
        }

        const secToHMS = (s: number) => {
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          const sec = s % 60;
          return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
        };

        let agenteRanking = Object.values(byAgente)
          .map(a => ({ ...a, tempoFormatado: secToHMS(a.totalSegundos) }))
          .sort((a, b) => b.ocorrencias - a.ocorrencias);

        // Aplica filtros opcionais
        if (input.minTempoSeg) agenteRanking = agenteRanking.filter(a => a.totalSegundos >= (input.minTempoSeg ?? 0));
        if (input.minChamadas) agenteRanking = agenteRanking.filter(a => a.totalChamadas >= (input.minChamadas ?? 0));

        const supervisorRanking = Object.values(bySupervisor)
          .map(s => ({ supervisor: s.supervisor, ocorrencias: s.ocorrencias, totalSegundos: s.totalSegundos, totalChamadas: s.totalChamadas, agentesCount: s.agentesSet.size, tempoFormatado: secToHMS(s.totalSegundos) }))
          .sort((a, b) => b.ocorrencias - a.ocorrencias)
          .slice(0, 10);

        // Ranking unificado por agente+tabulação (excedidas + tempo segurado)
        let agenteTabRanking = Object.values(byAgenteTab)
          .map(a => ({ ...a, tempoFormatado: secToHMS(a.totalSegundos) }))
          .sort((a, b) => b.ocorrencias - a.ocorrencias);
        if (input.minTempoSeg) agenteTabRanking = agenteTabRanking.filter(a => a.totalSegundos >= (input.minTempoSeg ?? 0));
        if (input.minChamadas) agenteTabRanking = agenteTabRanking.filter(a => a.totalChamadas >= (input.minChamadas ?? 0));

        return { rows, agenteRanking: agenteRanking.slice(0, 20), supervisorRanking, agenteTabRanking: agenteTabRanking.slice(0, 50) };
      }),

    // ─── Cards de Resumo Executivo ─────────────────────────────────────────
    getSummary: publicProcedure
      .input(z.object({ sessionIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const [agentDayRows, reasonRows, campaignRows, dispositionRows] = await Promise.all([
          getAgentDayRecords({ sessionIds: input.sessionIds }),
          getReasonAgentRecords({ sessionIds: input.sessionIds }),
          getCampaignAgentRecords({ sessionIds: input.sessionIds }),
          getDispositionAgentRecords({ sessionIds: input.sessionIds }),
        ]);

        const agentesLogados = Array.from(new Set(agentDayRows.map(r => r.agente).filter(Boolean))).length;
        const totalChamadas = agentDayRows.reduce((s, r) => s + (r.totalChamadas || 0), 0);
        const totalContatos = agentDayRows.reduce((s, r) => s + (r.totalContatos || 0), 0);
        const totalPausas = reasonRows.reduce((s, r) => s + (r.pausasTotalizadoPorCampanha || 0), 0);
        const totalTabulacoesSucesso = agentDayRows.reduce((s, r) => s + (r.tabulacoesSucesso || 0), 0);
        const totalTabulacoesExcedidas = dispositionRows.reduce((s, r) => s + (r.totalChamadas || 0), 0);
        const totalCampanhas = new Set(campaignRows.map(r => r.campanha).filter(Boolean)).size;

        return {
          agentesLogados,
          totalChamadas,
          totalContatos,
          totalPausas,
          totalTabulacoesSucesso,
          totalTabulacoesExcedidas,
          totalCampanhas,
        };
      }),

    // ─── Relatório Executivo Consolidado ─────────────────────────────────────
    getExecutiveReport: publicProcedure
      .input(z.object({ sessionIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const [agentDayRows, reasonRows, campaignRows, dispositionRows] = await Promise.all([
          getAgentDayRecords({ sessionIds: input.sessionIds }),
          getReasonAgentRecords({ sessionIds: input.sessionIds }),
          getCampaignAgentRecords({ sessionIds: input.sessionIds }),
          getDispositionAgentRecords({ sessionIds: input.sessionIds }),
        ]);

        // ── Faixa 1: Top/Bottom por chamadas atendidas (apenas agentes com login) ──
        const humanAgents = agentDayRows.filter(r => r.login && r.login.trim() !== "");
        const sortedByChamadas = [...humanAgents].sort((a, b) => (b.chamadasAtendidas ?? 0) - (a.chamadasAtendidas ?? 0));
        const top5Chamadas = sortedByChamadas.slice(0, 5).map(r => ({
          agente: r.agente ?? "",
          valor: r.chamadasAtendidas ?? 0,
          detalhe: `CPC: ${r.contatoEfetivo ?? 0}`,
        }));
        // "Baixa Produtividade" = muitas chamadas/tentativas mas poucos acordos ou CPC
        // Métrica: chamadas atendidas >= mediana, mas CPC + acordos abaixo da mediana
        // Ordenado por: maior razão (chamadas / (cpc + acordos + 1)) — esforço sem resultado
        const agentsWithActivity = humanAgents.filter(r => (r.chamadasAtendidas ?? 0) >= 5);
        const bottom5Chamadas = [...agentsWithActivity]
          .map(r => {
            const chamadas = r.chamadasAtendidas ?? 0;
            const cpc = r.contatoEfetivo ?? 0;
            const acordos = (r as any).tabulacoesSucessoNegocio ?? 0;
            const resultado = cpc + acordos;
            const esforcoSemResultado = chamadas / (resultado + 1); // +1 evita divisão por zero
            return { r, chamadas, cpc, acordos, resultado, esforcoSemResultado };
          })
          .sort((a, b) => b.esforcoSemResultado - a.esforcoSemResultado)
          .slice(0, 5)
          .map(({ r, chamadas, cpc, acordos }) => ({
            agente: r.agente ?? "",
            valor: chamadas,
            detalhe: `CPC: ${cpc} · Acordos: ${acordos}`,
          }));

        // ── Top 5 Suspeitos: alto CPC, baixo acordo (conversão suspeita) ──────────
        // Métrica: CPC >= 5 mas taxa de conversão CPC→Acordo muito baixa
        // Ordenado por: maior CPC com menor taxa de conversão
        const top5Suspeitos = [...humanAgents]
          .filter(r => (r.contatoEfetivo ?? 0) >= 5) // precisa ter CPC relevante
          .map(r => {
            const cpc = r.contatoEfetivo ?? 0;
            const acordos = (r as any).tabulacoesSucessoNegocio ?? 0;
            const taxaConversao = cpc > 0 ? (acordos / cpc) * 100 : 0;
            return { r, cpc, acordos, taxaConversao };
          })
          .sort((a, b) => {
            // Prioriza: mais CPC com menor conversão
            const scoreA = a.cpc * (1 - a.taxaConversao / 100);
            const scoreB = b.cpc * (1 - b.taxaConversao / 100);
            return scoreB - scoreA;
          })
          .slice(0, 5)
          .map(({ r, cpc, acordos, taxaConversao }) => ({
            agente: r.agente ?? "",
            valor: cpc,
            detalhe: `Acordos: ${acordos} · Conv: ${taxaConversao.toFixed(1)}%`,
          }));

        // ── Faixa 2: Top 5 por pausas improdutivas ──────────────────────────────
        function isImprodutiva(motivo: string): boolean {
          const m = motivo.toLowerCase().trim();
          if (m.includes("feedback")) return false;
          if (m.includes("erro de sistema") || m.includes("erro sistema") || m === "erro") return false;
          if (m.includes("atendimento chat") || m === "chat") return false;
          return true;
        }
        const byAgenteImprod: Record<string, { agente: string; totalSegundos: number; totalPausas: number }> = {};
        for (const row of reasonRows) {
          const motivo = row.motivoDePausa || "";
          if (!isImprodutiva(motivo)) continue;
          const agente = row.agente || "Desconhecido";
          const seg = timeToSeconds(row.tempoTotalDePausa);
          const pausas = row.pausasTotalizadoPorCampanha || 0;
          if (!byAgenteImprod[agente]) byAgenteImprod[agente] = { agente, totalSegundos: 0, totalPausas: 0 };
          byAgenteImprod[agente].totalSegundos += seg;
          byAgenteImprod[agente].totalPausas += pausas;
        }
        const secToHMS = (s: number) => {
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          const sec = s % 60;
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
        };
        const top5Pausas = Object.values(byAgenteImprod)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 5)
          .map(r => ({
            agente: r.agente,
            valor: r.totalSegundos,
            detalhe: secToHMS(r.totalSegundos),
          }));

        // ── Faixa 3: Top 5 campanhas por chamadas ──────────────────────────────
        const byCampanha: Record<string, { campanha: string; totalChamadas: number; totalContatos: number }> = {};
        for (const row of campaignRows) {
          const camp = row.campanha || "Sem campanha";
          if (!byCampanha[camp]) byCampanha[camp] = { campanha: camp, totalChamadas: 0, totalContatos: 0 };
          byCampanha[camp].totalChamadas += row.totalChamadas || 0;
          byCampanha[camp].totalContatos += row.totalContatos || 0;
        }
        const top5Campanhas = Object.values(byCampanha)
          .sort((a, b) => b.totalChamadas - a.totalChamadas)
          .slice(0, 5)
          .map(r => ({
            agente: r.campanha,
            valor: r.totalChamadas,
            detalhe: `Conv: ${r.totalChamadas > 0 ? ((r.totalContatos / r.totalChamadas) * 100).toFixed(1) : 0}%`,
          }));

        // ── Faixa 4: Top 5 por tabulações excedidas ────────────────────────────
        // Agrega por agente com mesma lógica do getDispositionAgent
        const byAgenteDisp: Record<string, { agente: string; ocorrencias: number; totalSegundos: number; totalChamadas: number; supervisor: string }> = {};
        for (const row of dispositionRows) {
          const agente = row.agente || "Desconhecido";
          const seg = timeToSeconds(row.tempoTabulacao);
          const chamadas = row.totalChamadas || 0;
          if (!byAgenteDisp[agente]) byAgenteDisp[agente] = { agente, ocorrencias: 0, totalSegundos: 0, totalChamadas: 0, supervisor: row.nomeSupervisor || "" };
          byAgenteDisp[agente].ocorrencias += 1;
          byAgenteDisp[agente].totalSegundos += seg;
          byAgenteDisp[agente].totalChamadas += chamadas;
        }
        const totalTabulacoesExcedidasExec = Object.values(byAgenteDisp).reduce((s, r) => s + r.ocorrencias, 0);
        const top5Tabulacoes = Object.values(byAgenteDisp)
          .sort((a, b) => b.ocorrencias - a.ocorrencias)
          .slice(0, 5)
          .map(r => ({
            agente: r.agente,
            valor: r.ocorrencias,
            totalChamadas: r.totalChamadas,
            tempoTabulado: secToHMS(r.totalSegundos),
            supervisor: r.supervisor || "—",
          }));

        return {
          top5Chamadas,
          bottom5Chamadas,
          top5Pausas,
          top5Campanhas,
          top5Tabulacoes,
          totalTabulacoesExcedidas: totalTabulacoesExcedidasExec,
          top5Suspeitos,
        };
      }),

    // ─── Filtros disponíveis ───────────────────────────────────────────────
    getFilters: publicProcedure
      .input(z.object({ sessionIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const [agentDayRows, campaignRows, dispositionRows] = await Promise.all([
          getAgentDayRecords({ sessionIds: input.sessionIds }),
          getCampaignAgentRecords({ sessionIds: input.sessionIds }),
          getDispositionAgentRecords({ sessionIds: input.sessionIds }),
        ]);

        const agentes = Array.from(new Set(agentDayRows.map(r => r.agente).filter(Boolean))).sort() as string[];
        const ufs = Array.from(new Set(agentDayRows.map(r => r.uf).filter(Boolean))).sort() as string[];
        const campanhas = Array.from(new Set(campaignRows.map(r => r.campanha).filter(Boolean))).sort() as string[];
        // Filtra supervisores: remove valores nulos, vazios e IDs numéricos
        const supervisores = Array.from(new Set([
          ...campaignRows.map(r => r.nomeSupervisor),
          ...dispositionRows.map(r => r.nomeSupervisor),
        ].filter(v => v && v.trim() && !/^\d+$/.test(v.trim())))).sort() as string[];

        return { agentes, ufs, campanhas, supervisores };
      }),
  }),

  // ─── Dimensionamento ────────────────────────────────────────────────────────
  dimensionamento: router({
    list: publicProcedure
      .input(z.object({
        celula: z.string().optional(),
        supervisor: z.string().optional(),
        turno: z.string().optional(),
        uf: z.string().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await getDimensionamento(input || {});
      }),

    stats: publicProcedure.query(async () => {
      return await getDimensionamentoStats();
    }),

    create: publicProcedure
      .input(z.object({
        nome: z.string().min(1),
        login: z.string().optional(),
        loginOlos: z.number().optional(),
        email: z.string().optional(),
        supervisor: z.string().optional(),
        admissao: z.string().optional(),
        nascimento: z.string().optional(),
        cpf: z.string().optional(),
        funcao: z.string().optional(),
        cargo: z.string().optional(),
        departamento: z.string().optional(),
        uf: z.string().optional(),
        status: z.string().optional(),
        discador: z.string().optional(),
        celula: z.string().optional(),
        skill: z.string().optional(),
        turno: z.string().optional(),
        escalaHora: z.string().optional(),
        escala: z.string().optional(),
        entrada: z.string().optional(),
        saida: z.string().optional(),
        entradaS: z.string().optional(),
        saidaS: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await insertDimensionamento(input);
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        login: z.string().optional(),
        loginOlos: z.number().optional(),
        email: z.string().optional(),
        supervisor: z.string().optional(),
        admissao: z.string().optional(),
        nascimento: z.string().optional(),
        cpf: z.string().optional(),
        funcao: z.string().optional(),
        cargo: z.string().optional(),
        departamento: z.string().optional(),
        uf: z.string().optional(),
        status: z.string().optional(),
        discador: z.string().optional(),
        celula: z.string().optional(),
        skill: z.string().optional(),
        turno: z.string().optional(),
        escalaHora: z.string().optional(),
        escala: z.string().optional(),
        entrada: z.string().optional(),
        saida: z.string().optional(),
        entradaS: z.string().optional(),
        saidaS: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateDimensionamento(id, data);
        return { success: true };
      }),

        delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteDimensionamento(input.id);
        return { success: true };
      }),
    // Cruzamento: quem está no AgentDay mas não no Dimensionamento
    crossCheck: publicProcedure
      .input(z.object({ sessionIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const [agentRows, dimRows] = await Promise.all([
          getAgentDayRecords({ sessionIds: input.sessionIds }),
          getDimensionamento({}),
        ]);
        // Nomes normalizados do dimensionamento
        const dimNomes = new Set(
          dimRows.map(d => (d.nome || "").trim().toUpperCase())
        );
        const dimLogins = new Set(
          dimRows.map(d => (d.login || "").trim().toLowerCase()).filter(Boolean)
        );
        // Agentes únicos do AgentDay
        const agentesMap = new Map<string, { agente: string; login: string; campanha: string; uf: string }>();
        for (const row of agentRows) {
          const nome = (row.agente || "").trim();
          if (!nome) continue;
          if (!agentesMap.has(nome)) {
            agentesMap.set(nome, {
              agente: nome,
              login: row.login || "",
              campanha: row.produto || "",
              uf: row.uf || "",
            });
          }
        }
        // Filtrar quem não está no dimensionamento
        const naoNoDimensionamento = Array.from(agentesMap.values()).filter(a => {
          const nomeUp = a.agente.toUpperCase();
          const loginLow = a.login.toLowerCase();
          return !dimNomes.has(nomeUp) && !(loginLow && dimLogins.has(loginLow));
        });
        return {
          totalAgentDay: agentesMap.size,
          totalDimensionamento: dimRows.length,
          naoNoDimensionamento,
        };
      }),
  }),
});
export type AppRouter = typeof appRouter;
