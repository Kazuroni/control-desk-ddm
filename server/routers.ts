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

        // Regras de classificação de pausas improdutivas:
        // - "Atendimento Chat" NÃO é improdutiva (é trabalho produtivo)
        // - Descanso 1, 2, 3 e Lanche SÃO improdutivas (pausas estouradas)
        // - Banheiro > 10 min É improdutiva
        // - Demais pausas: mantidas como estão no relatório geral
        function isImprodutiva(motivo: string, segundos: number): boolean {
          const m = motivo.toLowerCase().trim();
          if (m.includes("atendimento chat") || m === "chat") return false;
          if (m.includes("descanso") || m.includes("lanche")) return true;
          if (m.includes("banheiro") && segundos > 600) return true; // > 10 min
          return false;
        }

        // Agrupa TODAS as pausas por motivo (visão geral)
        const byMotivo: Record<string, { motivo: string; totalPausas: number; totalSegundos: number; agentes: Set<string>; improdutiva: boolean }> = {};
        // Agrupa apenas improdutivas por agente (ranking de ofensores)
        const byAgenteImprod: Record<string, { agente: string; totalSegundos: number; totalPausas: number }> = {};
        // Agrupa todas pausas por agente (visão completa)
        const byAgente: Record<string, { agente: string; totalSegundos: number; totalPausas: number }> = {};

        for (const row of rows) {
          const motivo = row.motivoDePausa || "Sem motivo";
          const segundos = timeToSeconds(row.tempoTotalDePausa);
          const pausas = row.pausasTotalizadoPorCampanha || 0;
          const improd = isImprodutiva(motivo, segundos);

          if (!byMotivo[motivo]) byMotivo[motivo] = { motivo, totalPausas: 0, totalSegundos: 0, agentes: new Set(), improdutiva: improd };
          byMotivo[motivo].totalPausas += pausas;
          byMotivo[motivo].totalSegundos += segundos;
          if (row.agente) byMotivo[motivo].agentes.add(row.agente);

          const agente = row.agente || "Desconhecido";
          if (!byAgente[agente]) byAgente[agente] = { agente, totalSegundos: 0, totalPausas: 0 };
          byAgente[agente].totalSegundos += segundos;
          byAgente[agente].totalPausas += pausas;

          // Ranking de ofensores: apenas pausas improdutivas
          if (improd) {
            if (!byAgenteImprod[agente]) byAgenteImprod[agente] = { agente, totalSegundos: 0, totalPausas: 0 };
            byAgenteImprod[agente].totalSegundos += segundos;
            byAgenteImprod[agente].totalPausas += pausas;
          }
        }

        // Visão geral de todos os motivos (exceto Atendimento Chat)
        const motivoChart = Object.values(byMotivo)
          .filter(m => !m.motivo.toLowerCase().includes("atendimento chat") && !m.motivo.toLowerCase().includes("chat"))
          .map(m => ({ ...m, agentes: m.agentes.size }))
          .sort((a, b) => b.totalSegundos - a.totalSegundos);

        // Apenas motivos improdutivos para gráfico dedicado
        const motivoImprodChart = Object.values(byMotivo)
          .filter(m => m.improdutiva)
          .map(m => ({ ...m, agentes: m.agentes.size }))
          .sort((a, b) => b.totalSegundos - a.totalSegundos);

        // Ranking de ofensores por pausas improdutivas
        const agenteRanking = Object.values(byAgenteImprod)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 20);

        // Ranking geral (todas as pausas)
        const agenteRankingGeral = Object.values(byAgente)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 20);

        return { rows, motivoChart, motivoImprodChart, agenteRanking, agenteRankingGeral };
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
      }))
      .query(async ({ input }) => {
        const rows = await getDispositionAgentRecords({
          sessionIds: input.sessionIds,
          supervisor: input.supervisor,
        });

        // Ranking por agente
        const byAgente: Record<string, { agente: string; supervisor: string; totalSegundos: number; totalChamadas: number }> = {};
        const bySupervisor: Record<string, { supervisor: string; totalSegundos: number; totalChamadas: number; agentes: number }> = {};

        for (const row of rows) {
          const agente = row.agente || "Desconhecido";
          const supervisor = row.nomeSupervisor || "Sem supervisor";
          const segundos = timeToSeconds(row.tempoTabulacao);

          if (!byAgente[agente]) byAgente[agente] = { agente, supervisor, totalSegundos: 0, totalChamadas: 0 };
          byAgente[agente].totalSegundos += segundos;
          byAgente[agente].totalChamadas += row.totalChamadas || 0;

          if (!bySupervisor[supervisor]) bySupervisor[supervisor] = { supervisor, totalSegundos: 0, totalChamadas: 0, agentes: 0 };
          bySupervisor[supervisor].totalSegundos += segundos;
          bySupervisor[supervisor].totalChamadas += row.totalChamadas || 0;
          bySupervisor[supervisor].agentes += 1;
        }

        const agenteRanking = Object.values(byAgente)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 20);

        const supervisorRanking = Object.values(bySupervisor)
          .sort((a, b) => b.totalSegundos - a.totalSegundos)
          .slice(0, 10);

        return { rows, agenteRanking, supervisorRanking };
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
