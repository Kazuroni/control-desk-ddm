/**
 * Rota Express: POST /api/upload-dimensionamento
 * Recebe um arquivo .xlsx (multipart/form-data, campo "file"),
 * faz o parse da aba "BaseQuadro" e executa upsert na tabela dimensionamento.
 * Retorna: { inserted, updated, skipped, errors[] }
 *
 * DIAGNÓSTICO DOS BUGS CORRIGIDOS (v2):
 *
 * BUG 1 — "Sat Dec 30 1899" nas colunas de horário (escalaHora, entrada, saída):
 *   Causa: XLSX.read com { cellDates: true } converte células de TEMPO (fração de dia,
 *   ex: 0.333 = 08:00) em objetos Date JavaScript. O Excel armazena datas a partir de
 *   01/01/1900 (serial 1). Uma fração pura de tempo (ex: 0.333) é interpretada como
 *   "dia 0 de 1900", que o JS converte para "Dec 30 1899 08:00:00 GMT". A função
 *   fmtDate() recebia esse Date e chamava .toISOString() retornando "1899-12-30".
 *   Correção: desativar cellDates e tratar manualmente. Células de tempo puro
 *   (número < 1) são convertidas por excelTimeToHHMM(). Células de data (número >= 1)
 *   são convertidas por fmtDate() via XLSX.SSF.parse_date_code().
 *
 * BUG 2 — Colunas mapeadas incorretamente (supervisor, admissão, nascimento trocados):
 *   Causa: O arquivo Excel tem 23 colunas (0–22). O mapeamento original assumia que
 *   col[4]=supervisor, col[5]=admissão, col[6]=nascimento, col[7]=CPF, col[8]=função,
 *   col[9]=cargo. Mas o erro mostrava "ATIVO" no lugar de supervisor e "ATENDENTE"
 *   no lugar de admissão — indicando que as colunas estavam deslocadas. Análise do
 *   cabeçalho real confirmou: col[4]=SUPERVISOR, col[5]=Admissão, col[6]=Nascimento,
 *   col[7]=CPF, col[8]=Função, col[9]=Cargo, col[10]=Departamento, col[11]=UF,
 *   col[12]=Status, col[13]=DISCADOR, col[14]=Célula, col[15]=Skill, col[16]=Turno,
 *   col[17]=EscalaHora, col[18]=Escala, col[19]=Entrada, col[20]=Saída,
 *   col[21]=Entrada.S, col[22]=Saída.S.
 *   O mapeamento estava correto nos índices, mas o bug estava na função fmtDate()
 *   que não tratava o tipo Date retornado pelo cellDates:true (ver BUG 1).
 */
import { Express } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { getDb } from "./db";
import { dimensionamento } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/**
 * Converte valor de célula Excel de TEMPO para "HH:MM".
 * - Número < 1: fração de dia (ex: 0.333333 = 08:00)
 * - Número >= 1: serial de data/hora — extrai apenas a parte fracionária
 * - String "HH:MM" ou "HH:MM:SS": normaliza
 */
function excelTimeToHHMM(val: any): string {
  if (val === null || val === undefined || val === "") return "";

  if (typeof val === "number") {
    // Garante que usamos apenas a parte fracionária (tempo do dia)
    const fraction = val % 1;
    const totalMin = Math.round(fraction * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    const parts = trimmed.split(":");
    if (parts.length >= 2) {
      return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
    }
    return trimmed;
  }

  return "";
}

/**
 * Converte valor de célula Excel de DATA para "YYYY-MM-DD".
 * - Número >= 1: serial de data Excel (ex: 45000 = alguma data de 2023)
 * - String: retorna como está
 * NÃO aceita objetos Date (cellDates deve estar desativado).
 */
function fmtDate(val: any): string {
  if (val === null || val === undefined || val === "") return "";

  if (typeof val === "number") {
    // Serial de data Excel — apenas inteiros ou números >= 1
    const intVal = Math.floor(val);
    if (intVal < 1) return ""; // é um tempo puro, não uma data
    try {
      const date = XLSX.SSF.parse_date_code(intVal);
      if (date && date.y > 1900) {
        return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
      }
    } catch {
      // ignora
    }
    return "";
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    // Já está no formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    // Formato DD/MM/YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmyMatch)
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
    return trimmed;
  }

  return "";
}

function safeStr(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function safeInt(val: any): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  if (typeof val === "number") return Math.floor(val);
  const n = parseInt(String(val).replace(/\D/g, ""), 10);
  return isNaN(n) ? undefined : n;
}

// ─── Mapeamento de colunas por cabeçalho ────────────────────────────────────
// Antes (BUG 2 do histórico): colunas eram mapeadas por posição fixa (col[4],
// col[5]...). Qualquer alteração no layout do Excel do cliente (coluna
// adicionada/removida/reordenada) reintroduzia o mesmo bug, silenciosamente.
// Agora: localizamos cada campo pelo texto do cabeçalho. Só caímos para
// posição fixa se a planilha genuinamente não tiver linha de cabeçalho — e
// nesse caso avisamos o usuário na resposta.
type FieldKey =
  | "nome"
  | "login"
  | "loginOlos"
  | "email"
  | "supervisor"
  | "admissao"
  | "nascimento"
  | "cpf"
  | "funcao"
  | "cargo"
  | "departamento"
  | "uf"
  | "status"
  | "discador"
  | "celula"
  | "skill"
  | "turno"
  | "escalaHora"
  | "escala"
  | "entrada"
  | "saida"
  | "entradaS"
  | "saidaS";

const LEGACY_POSITIONS: Record<FieldKey, number> = {
  nome: 0,
  login: 1,
  loginOlos: 2,
  email: 3,
  supervisor: 4,
  admissao: 5,
  nascimento: 6,
  cpf: 7,
  funcao: 8,
  cargo: 9,
  departamento: 10,
  uf: 11,
  status: 12,
  discador: 13,
  celula: 14,
  skill: 15,
  turno: 16,
  escalaHora: 17,
  escala: 18,
  entrada: 19,
  saida: 20,
  entradaS: 21,
  saidaS: 22,
};

function normalizeHeader(s: any): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

// Localiza o índice de cada campo pelo texto do cabeçalho.
// Retorna -1 para campos não encontrados (tratado pelo chamador).
function findColumnIndexes(headerRow: any[]): Record<FieldKey, number> {
  const h = headerRow.map(normalizeHeader);
  const exact = (name: string) => h.findIndex(x => x === name);
  const includes = (name: string) => h.findIndex(x => x.includes(name));

  return {
    nome: exact("NOME") >= 0 ? exact("NOME") : includes("NOME"),
    login: h.findIndex(
      x => x === "LOGIN" || (x.includes("LOGIN") && !x.includes("OLOS"))
    ),
    loginOlos: h.findIndex(x => x.includes("LOGIN") && x.includes("OLOS")),
    email: includes("EMAIL"),
    supervisor: includes("SUPERVISOR"),
    admissao: includes("ADMISSAO"),
    nascimento: includes("NASCIMENTO"),
    cpf: exact("CPF"),
    funcao: exact("FUNCAO") >= 0 ? exact("FUNCAO") : includes("FUNCAO"),
    cargo: exact("CARGO"),
    departamento: includes("DEPARTAMENTO"),
    uf: exact("UF"),
    status: exact("STATUS") >= 0 ? exact("STATUS") : includes("STATUS"),
    discador: includes("DISCADOR"),
    celula: includes("CELULA"),
    skill: exact("SKILL") >= 0 ? exact("SKILL") : includes("SKILL"),
    turno: exact("TURNO") >= 0 ? exact("TURNO") : includes("TURNO"),
    escalaHora: h.findIndex(x => x.includes("ESCALA") && x.includes("HORA")),
    escala: exact("ESCALA"),
    entrada: exact("ENTRADA"),
    saida: exact("SAIDA"),
    entradaS: h.findIndex(x => x !== "ENTRADA" && x.startsWith("ENTRADA")),
    saidaS: h.findIndex(x => x !== "SAIDA" && x.startsWith("SAIDA")),
  };
}

const REQUIRED_FIELDS: FieldKey[] = ["nome"];
const FIELD_LABELS: Record<FieldKey, string> = {
  nome: "Nome",
  login: "Login",
  loginOlos: "Login OLOS",
  email: "Email",
  supervisor: "Supervisor",
  admissao: "Admissão",
  nascimento: "Nascimento",
  cpf: "CPF",
  funcao: "Função",
  cargo: "Cargo",
  departamento: "Departamento",
  uf: "UF",
  status: "Status",
  discador: "Discador",
  celula: "Célula",
  skill: "Skill",
  turno: "Turno",
  escalaHora: "EscalaHora",
  escala: "Escala",
  entrada: "Entrada",
  saida: "Saída",
  entradaS: "Entrada.S",
  saidaS: "Saída.S",
};

export function registerUploadDimensionamento(app: Express) {
  app.post(
    "/api/upload-dimensionamento",
    upload.single("file"),
    async (req, res) => {
      try {
        const user = await sdk.authenticateRequest(req).catch(() => null);
        if (!user) {
          res
            .status(401)
            .json({
              error: "Faça login para importar dados de dimensionamento.",
            });
          return;
        }

        if (!req.file) {
          res.status(400).json({ error: "Nenhum arquivo enviado." });
          return;
        }

        const ext = req.file.originalname.toLowerCase();
        if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
          res
            .status(400)
            .json({ error: "Apenas arquivos .xlsx ou .xls são aceitos." });
          return;
        }

        // CORREÇÃO BUG 1: cellDates: false — não converter datas/tempos automaticamente.
        // Recebemos os seriais numéricos brutos e tratamos manualmente com fmtDate() e
        // excelTimeToHHMM(), evitando o problema do "Dec 30 1899".
        const wb = XLSX.read(req.file.buffer, {
          type: "buffer",
          cellDates: false,
        });

        // Prioridade de aba: BaseQuadro > DIM > BaseQuadroOutros > QuadroGeral > qualquer com "base"/"dim" > primeira aba
        // QuadroMS é EXCLUÍDA pois tem estrutura diferente (sem supervisor, admissão, nascimento, CPF)
        const PRIORITY_SHEETS = [
          "BaseQuadro",
          "DIM",
          "BaseQuadroOutros",
          "QuadroGeral",
        ];
        const sheetName =
          PRIORITY_SHEETS.find(p => wb.SheetNames.includes(p)) ||
          wb.SheetNames.find(
            n =>
              !n.toLowerCase().includes("ms") &&
              (n.toLowerCase().includes("base") ||
                n.toLowerCase().includes("dim"))
          ) ||
          wb.SheetNames[0];

        const ws = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: null,
        });

        if (rows.length < 2) {
          res.status(400).json({ error: "Planilha vazia ou sem dados." });
          return;
        }

        // Detecta se a primeira linha é cabeçalho (contém texto)
        const firstRow = rows[0];
        const hasHeader = firstRow.some(
          c =>
            typeof c === "string" &&
            /nome|login|supervisor|funcionário/i.test(String(c))
        );
        const dataRows = hasHeader ? rows.slice(1) : rows;

        // Mapeamento de colunas: por nome de cabeçalho (preferencial) ou
        // posição fixa legada (só quando não há cabeçalho detectável).
        const warnings: string[] = [];
        let col: Record<FieldKey, number>;
        if (hasHeader) {
          col = findColumnIndexes(firstRow);
          const missingRequired = REQUIRED_FIELDS.filter(f => col[f] < 0);
          if (missingRequired.length > 0) {
            res.status(400).json({
              error: `Não foi possível localizar a(s) coluna(s) obrigatória(s) no cabeçalho: ${missingRequired.map(f => FIELD_LABELS[f]).join(", ")}. Verifique se o cabeçalho da planilha não foi renomeado.`,
            });
            return;
          }
          const missingOptional = (Object.keys(col) as FieldKey[]).filter(
            f => col[f] < 0 && !REQUIRED_FIELDS.includes(f)
          );
          if (missingOptional.length > 0) {
            warnings.push(
              `Colunas não encontradas pelo cabeçalho (ficaram em branco): ${missingOptional.map(f => FIELD_LABELS[f]).join(", ")}.`
            );
          }
        } else {
          col = { ...LEGACY_POSITIONS };
          warnings.push(
            "Planilha sem linha de cabeçalho detectada — usando mapeamento posicional legado. Confira se os dados vieram nas colunas certas."
          );
        }

        const db = await getDb();
        if (!db) {
          res.status(500).json({ error: "Banco de dados indisponível." });
          return;
        }

        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        const errors: string[] = [];

        const get = (row: any[], field: FieldKey) =>
          col[field] >= 0 ? row[col[field]] : undefined;

        for (const row of dataRows) {
          const nome = safeStr(get(row, "nome"));
          if (
            !nome ||
            nome.toUpperCase() === "NOME" ||
            nome.toUpperCase() === "NOME DO FUNCIONÁRIO"
          ) {
            skipped++;
            continue;
          }

          const login = safeStr(get(row, "login"));
          const loginOlos = safeInt(get(row, "loginOlos"));

          const payload = {
            nome,
            login: login || null,
            loginOlos: loginOlos ?? null,
            email: safeStr(get(row, "email")) || null,
            supervisor: safeStr(get(row, "supervisor")) || null,
            admissao: fmtDate(get(row, "admissao")) || null,
            nascimento: fmtDate(get(row, "nascimento")) || null,
            cpf: safeStr(get(row, "cpf")) || null,
            funcao: safeStr(get(row, "funcao")) || null,
            cargo: safeStr(get(row, "cargo")) || null,
            departamento: safeStr(get(row, "departamento")) || null,
            uf: safeStr(get(row, "uf")) || null,
            status: safeStr(get(row, "status")) || "ATIVO",
            discador: safeStr(get(row, "discador")) || null,
            celula: safeStr(get(row, "celula")) || null,
            skill: safeStr(get(row, "skill")) || null,
            turno: safeStr(get(row, "turno")) || null,
            escalaHora: excelTimeToHHMM(get(row, "escalaHora")) || null,
            escala: safeStr(get(row, "escala")) || null,
            entrada: excelTimeToHHMM(get(row, "entrada")) || null,
            saida: excelTimeToHHMM(get(row, "saida")) || null,
            entradaS: excelTimeToHHMM(get(row, "entradaS")) || null,
            saidaS: excelTimeToHHMM(get(row, "saidaS")) || null,
          };

          try {
            // Upsert: busca por login primeiro, depois por nome
            let existing = null;
            if (login) {
              const found = await db
                .select({ id: dimensionamento.id })
                .from(dimensionamento)
                .where(eq(dimensionamento.login, login))
                .limit(1);
              existing = found[0] ?? null;
            }
            if (!existing) {
              const found = await db
                .select({ id: dimensionamento.id })
                .from(dimensionamento)
                .where(eq(dimensionamento.nome, nome))
                .limit(1);
              existing = found[0] ?? null;
            }

            if (existing) {
              await db
                .update(dimensionamento)
                .set(payload)
                .where(eq(dimensionamento.id, existing.id));
              updated++;
            } else {
              await db.insert(dimensionamento).values(payload);
              inserted++;
            }
          } catch (e: any) {
            errors.push(`Linha "${nome}": ${e.message}`);
            skipped++;
          }
        }

        res.json({
          success: true,
          sheetName,
          totalRows: dataRows.length,
          inserted,
          updated,
          skipped,
          errors: errors.slice(0, 20),
          warnings,
        });
      } catch (e: any) {
        console.error("[upload-dimensionamento]", e);
        res
          .status(500)
          .json({ error: "Erro interno ao processar arquivo: " + e.message });
      }
    }
  );
}
