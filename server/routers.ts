import { COOKIE_NAME } from "@shared/const";
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
} from "./db";
import {
  detectReportType,
  parseAgentDay,
  parseReasonAgent,
  parseCampaignAgent,
  parseDispositionAgent,
} from "./parsers";

// Helper para converter tempo HH:MM:SS em segundos
function timeToSeconds(t: string | null | undefined): number {
  if (!t) return 0;
  const parts = t.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export const appRouter = router({
  system: systemRouter,
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
      }))
      .query(async ({ input }) => {
        const rows = await getAgentDayRecords({
          sessionIds: input.sessionIds,
          agente: input.agente,
          uf: input.uf,
        });
        return rows;
      }),

    // ─── Faixa 2: ReasonAgent ──────────────────────────────────────────────
    getReasonAgent: publicProcedure
      .input(z.object({
        sessionIds: z.array(z.number()).optional(),
        agente: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const rows = await getReasonAgentRecords({
          sessionIds: input.sessionIds,
          agente: input.agente,
        });

        // Limites de pausa por tipo (em segundos) — qualquer excesso é improdutivo
        // Regra: se o tempo da pausa ultrapassar o limite em até 1 min, já é estourado
        const PAUSE_LIMITS: Record<string, number> = {
          "descanso 1": 10 * 60,   // 10 min
          "descanso 2": 10 * 60,
          "descanso 3": 10 * 60,
          "lanche": 20 * 60,       // 20 min
          "banheiro": 10 * 60,     // 10 min
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

        // Classificação de pausas improdutivas:
        // NÃO improdutivas: Feedback, Erro de Sistema, Atendimento Chat
        // TODAS as demais são improdutivas por padrão
        function isImprodutiva(motivo: string): boolean {
          const m = motivo.toLowerCase().trim();
          if (m.includes("feedback")) return false;
          if (m.includes("erro de sistema") || m.includes("erro sistema") || m === "erro") return false;
          if (m.includes("atendimento chat") || m === "chat") return false;
          return true;
        }

        // Estrutura de agrupamento por agente + motivo (para dashboard de abusadores)
        const byAgenteMotivo: Record<string, {
          agente: string;
          motivo: string;
          totalSegundos: number;
          totalPausas: number;
          limiteSegundos: number | null;
          excedeuLimite: boolean;
          excedidoSegundos: number; // quanto excedeu o limite
        }> = {};

        // Agrupamentos existentes
        const byMotivo: Record<string, { motivo: string; totalPausas: number; totalSegundos: number; agentes: Set<string>; improdutiva: boolean }> = {};
        const byAgenteImprod: Record<string, { agente: string; totalSegundos: number; totalPausas: number; pausasExcedidas: number }> = {};
        const byAgente: Record<string, { agente: string; totalSegundos: number; totalPausas: number }> = {};

        for (const row of rows) {
          const motivo = row.motivoDePausa || "Sem motivo";
          const segundos = timeToSeconds(row.tempoTotalDePausa);
          const pausas = row.pausasTotalizadoPorCampanha || 0;
          const improd = isImprodutiva(motivo);
          const limite = getLimiteSeg(motivo);
          const excedeu = limite !== null && segundos > limite + 60; // 1 min de tolerância
          const excedidoSeg = excedeu && limite !== null ? Math.max(0, segundos - limite) : 0;

          // Por motivo (visão geral)
          if (!byMotivo[motivo]) byMotivo[motivo] = { motivo, totalPausas: 0, totalSegundos: 0, agentes: new Set(), improdutiva: improd };
          byMotivo[motivo].totalPausas += pausas;
          byMotivo[motivo].totalSegundos += segundos;
          if (row.agente) byMotivo[motivo].agentes.add(row.agente);

          const agente = row.agente || "Desconhecido";

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

          // Por agente + motivo (dashboard de abusadores)
          const key = `${agente}||${motivo}`;
          if (!byAgenteMotivo[key]) {
            byAgenteMotivo[key] = {
              agente, motivo,
              totalSegundos: 0, totalPausas: 0,
              limiteSegundos: limite,
              excedeuLimite: false,
              excedidoSegundos: 0,
            };
          }
          byAgenteMotivo[key].totalSegundos += segundos;
          byAgenteMotivo[key].totalPausas += pausas;
          if (excedeu) {
            byAgenteMotivo[key].excedeuLimite = true;
            byAgenteMotivo[key].excedidoSegundos += excedidoSeg;
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

        // Dashboard de abusadores: agentes que excederam limite em algum motivo
        const abusadoresPausa = Object.values(byAgenteMotivo)
          .filter(r => r.excedeuLimite)
          .sort((a, b) => b.excedidoSegundos - a.excedidoSegundos)
          .slice(0, 30);

        // Limites de pausa para exibir no frontend
        const pausaLimites = Object.entries(PAUSE_LIMITS).map(([motivo, seg]) => ({
          motivo, limiteMin: Math.round(seg / 60)
        }));

        return { rows, motivoChart, motivoImprodChart, agenteRanking, agenteRankingGeral, abusadoresPausa, pausaLimites };
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
        const bottom5Chamadas = [...humanAgents]
          .filter(r => (r.chamadasAtendidas ?? 0) > 0)
          .sort((a, b) => (a.chamadasAtendidas ?? 0) - (b.chamadasAtendidas ?? 0))
          .slice(0, 5)
          .map(r => ({
            agente: r.agente ?? "",
            valor: r.chamadasAtendidas ?? 0,
            detalhe: `Ocioso: ${r.tempoOcioso ?? "00:00:00"}`,
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
        const byAgenteDisp: Record<string, { agente: string; ocorrencias: number; supervisor: string }> = {};
        for (const row of dispositionRows) {
          const agente = row.agente || "Desconhecido";
          if (!byAgenteDisp[agente]) byAgenteDisp[agente] = { agente, ocorrencias: 0, supervisor: row.nomeSupervisor || "" };
          byAgenteDisp[agente].ocorrencias += 1;
        }
        const top5Tabulacoes = Object.values(byAgenteDisp)
          .sort((a, b) => b.ocorrencias - a.ocorrencias)
          .slice(0, 5)
          .map(r => ({
            agente: r.agente,
            valor: r.ocorrencias,
            detalhe: `Sup: ${r.supervisor || "—"}`,
          }));

        return {
          top5Chamadas,
          bottom5Chamadas,
          top5Pausas,
          top5Campanhas,
          top5Tabulacoes,
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
});

export type AppRouter = typeof appRouter;
