import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  canaisRotasCampanhas,
  canaisRotasRotas,
  canaisRotasDiario,
  canaisRotasIA,
} from "../../drizzle/schema";
import { eq, desc, asc } from "drizzle-orm";

export const canaisRotasRouter = router({
  // ─── Campanhas ─────────────────────────────────────────────────────────────
  getCampanhas: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(canaisRotasCampanhas).orderBy(asc(canaisRotasCampanhas.campanha));
  }),

  upsertCampanha: publicProcedure
    .input(
      z.object({
        id: z.number().optional(),
        campanha: z.string().min(1),
        ativo: z.string().default("Sim"),
        solicitado: z.number().default(0),
        alocado: z.number().default(0),
        rotaCadastrada: z.string().optional().nullable(),
        observacao: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const saldo = input.solicitado - input.alocado;
      if (input.id) {
        await db
          .update(canaisRotasCampanhas)
          .set({
            campanha: input.campanha,
            ativo: input.ativo,
            solicitado: input.solicitado,
            alocado: input.alocado,
            saldo,
            rotaCadastrada: input.rotaCadastrada ?? null,
            observacao: input.observacao ?? null,
          })
          .where(eq(canaisRotasCampanhas.id, input.id));
        return { success: true, id: input.id };
      } else {
        const [result] = await db.insert(canaisRotasCampanhas).values({
          campanha: input.campanha,
          ativo: input.ativo,
          solicitado: input.solicitado,
          alocado: input.alocado,
          saldo,
          rotaCadastrada: input.rotaCadastrada ?? null,
          observacao: input.observacao ?? null,
        });
        return { success: true, id: (result as any).insertId };
      }
    }),

  deleteCampanha: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(canaisRotasCampanhas).where(eq(canaisRotasCampanhas.id, input.id));
      return { success: true };
    }),

  bulkInsertCampanhas: publicProcedure
    .input(
      z.array(
        z.object({
          campanha: z.string(),
          ativo: z.string().default("Sim"),
          solicitado: z.number().default(0),
          alocado: z.number().default(0),
          rotaCadastrada: z.string().optional().nullable(),
          observacao: z.string().optional().nullable(),
        })
      )
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (input.length === 0) return { success: true, count: 0 };
      const rows = input.map(r => ({ ...r, saldo: r.solicitado - r.alocado }));
      await db.insert(canaisRotasCampanhas).values(rows);
      return { success: true, count: rows.length };
    }),

  // ─── Rotas ─────────────────────────────────────────────────────────────────
  getRotas: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(canaisRotasRotas).orderBy(asc(canaisRotasRotas.nome));
  }),

  upsertRota: publicProcedure
    .input(
      z.object({
        id: z.number().optional(),
        nome: z.string().min(1),
        quantidadeCanais: z.number().default(0),
        qualidade: z.string().optional().nullable(),
        custo: z.string().optional().nullable(),
        limite: z.string().optional().nullable(),
        observacao: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (input.id) {
        await db
          .update(canaisRotasRotas)
          .set({
            nome: input.nome,
            quantidadeCanais: input.quantidadeCanais,
            qualidade: input.qualidade ?? null,
            custo: input.custo ?? null,
            limite: input.limite ?? null,
            observacao: input.observacao ?? null,
          })
          .where(eq(canaisRotasRotas.id, input.id));
        return { success: true, id: input.id };
      } else {
        const [result] = await db.insert(canaisRotasRotas).values({
          nome: input.nome,
          quantidadeCanais: input.quantidadeCanais,
          qualidade: input.qualidade ?? null,
          custo: input.custo ?? null,
          limite: input.limite ?? null,
          observacao: input.observacao ?? null,
        });
        return { success: true, id: (result as any).insertId };
      }
    }),

  deleteRota: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(canaisRotasRotas).where(eq(canaisRotasRotas.id, input.id));
      return { success: true };
    }),

  // ─── Diário de Bordo ───────────────────────────────────────────────────────
  getDiario: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(canaisRotasDiario).orderBy(desc(canaisRotasDiario.data));
  }),

  addDiario: publicProcedure
    .input(
      z.object({
        data: z.string(),
        rota: z.string(),
        movimentacao: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [result] = await db.insert(canaisRotasDiario).values({
        data: input.data,
        rota: input.rota,
        movimentacao: input.movimentacao,
      });
      return { success: true, id: (result as any).insertId };
    }),

  deleteDiario: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(canaisRotasDiario).where(eq(canaisRotasDiario.id, input.id));
      return { success: true };
    }),

  // ─── Canais IA ─────────────────────────────────────────────────────────────
  getCanaisIA: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(canaisRotasIA).orderBy(asc(canaisRotasIA.celula));
  }),

  upsertCanaisIA: publicProcedure
    .input(
      z.object({
        id: z.number().optional(),
        celula: z.string().min(1),
        qtdCanais: z.number().default(0),
        canaisName: z.string().optional().nullable(),
        qtdFluxo: z.number().default(0),
        fluxosName: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (input.id) {
        await db
          .update(canaisRotasIA)
          .set({
            celula: input.celula,
            qtdCanais: input.qtdCanais,
            canaisName: input.canaisName ?? null,
            qtdFluxo: input.qtdFluxo,
            fluxosName: input.fluxosName ?? null,
          })
          .where(eq(canaisRotasIA.id, input.id));
        return { success: true, id: input.id };
      } else {
        const [result] = await db.insert(canaisRotasIA).values({
          celula: input.celula,
          qtdCanais: input.qtdCanais,
          canaisName: input.canaisName ?? null,
          qtdFluxo: input.qtdFluxo,
          fluxosName: input.fluxosName ?? null,
        });
        return { success: true, id: (result as any).insertId };
      }
    }),

  deleteCanaisIA: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(canaisRotasIA).where(eq(canaisRotasIA.id, input.id));
      return { success: true };
    }),

  // ─── Resumo geral ──────────────────────────────────────────────────────────
  getSummary: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return {
      totalCampanhas: 0, campanhasAtivas: 0, totalSolicitado: 0,
      totalAlocado: 0, saldoTotal: 0, totalCanaisRotas: 0,
      totalRotas: 0, ultimasMovimentacoes: [], totalCelulasIA: 0,
    };

    const [campanhas, rotas, diario, ia] = await Promise.all([
      db.select().from(canaisRotasCampanhas),
      db.select().from(canaisRotasRotas),
      db.select().from(canaisRotasDiario).orderBy(desc(canaisRotasDiario.data)).limit(5),
      db.select().from(canaisRotasIA),
    ]);

    let totalSolicitado = 0;
    let totalAlocado = 0;
    let campanhasAtivas = 0;
    for (const c of campanhas) {
      totalSolicitado += c.solicitado ?? 0;
      totalAlocado += c.alocado ?? 0;
      if (c.ativo === "Sim") campanhasAtivas++;
    }
    let totalCanaisRotas = 0;
    for (const rota of rotas) {
      totalCanaisRotas += rota.quantidadeCanais ?? 0;
    }

    return {
      totalCampanhas: campanhas.length,
      campanhasAtivas,
      totalSolicitado,
      totalAlocado,
      saldoTotal: totalSolicitado - totalAlocado,
      totalCanaisRotas,
      totalRotas: rotas.length,
      ultimasMovimentacoes: diario,
      totalCelulasIA: ia.length,
    };
  }),
});
