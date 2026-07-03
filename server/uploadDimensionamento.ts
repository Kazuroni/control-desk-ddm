/**
 * Rota Express: POST /api/upload-dimensionamento
 * Recebe um arquivo .xlsx (multipart/form-data, campo "file"),
 * faz o parse da aba "BaseQuadro" e executa upsert na tabela dimensionamento.
 * Retorna: { inserted, updated, skipped, errors[] }
 */
import { Express } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { getDb } from "./db";
import { dimensionamento } from "../drizzle/schema";
import { eq, or } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Converte número serial Excel de tempo (fração de dia) ou string HH:MM em "HH:MM"
function excelTimeToHHMM(val: any): string {
  if (val === null || val === undefined || val === "") return "";
  if (typeof val === "number") {
    // Fração de dia: 0.333... = 08:00
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  if (typeof val === "string") {
    // Já está no formato HH:MM ou HH:MM:SS
    const parts = val.trim().split(":");
    if (parts.length >= 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
    return val.trim();
  }
  return String(val);
}

function fmtDate(val: any): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  return String(val).trim();
}

function safeStr(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function safeInt(val: any): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = typeof val === "number" ? val : parseInt(String(val).replace(/\D/g, ""), 10);
  return isNaN(n) ? undefined : n;
}

export function registerUploadDimensionamento(app: Express) {
  app.post("/api/upload-dimensionamento", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Nenhum arquivo enviado." });
        return;
      }

      const ext = req.file.originalname.toLowerCase();
      if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
        res.status(400).json({ error: "Apenas arquivos .xlsx ou .xls são aceitos." });
        return;
      }

      // Parse do Excel
      const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });

      // Tenta encontrar a aba correta
      const sheetName = wb.SheetNames.find(n =>
        n.toLowerCase().includes("base") || n.toLowerCase().includes("quadro") || n.toLowerCase().includes("dim")
      ) || wb.SheetNames[0];

      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      if (rows.length < 2) {
        res.status(400).json({ error: "Planilha vazia ou sem dados." });
        return;
      }

      // Detecta se a primeira linha é cabeçalho (contém texto)
      const firstRow = rows[0];
      const hasHeader = firstRow.some(c => typeof c === "string" && /nome|login|supervisor/i.test(String(c)));
      const dataRows = hasHeader ? rows.slice(1) : rows;

      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Banco de dados indisponível." });
        return;
      }

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of dataRows) {
        const nome = safeStr(row[0]);
        if (!nome || nome.toUpperCase() === "NOME") { skipped++; continue; }

        const login = safeStr(row[1]);
        const loginOlos = safeInt(row[2]);

        const payload = {
          nome,
          login: login || null,
          loginOlos: loginOlos ?? null,
          email: safeStr(row[3]) || null,
          supervisor: safeStr(row[4]) || null,
          admissao: fmtDate(row[5]) || null,
          nascimento: fmtDate(row[6]) || null,
          cpf: safeStr(row[7]) || null,
          funcao: safeStr(row[8]) || null,
          cargo: safeStr(row[9]) || null,
          departamento: safeStr(row[10]) || null,
          uf: safeStr(row[11]) || null,
          status: safeStr(row[12]) || "ATIVO",
          discador: safeStr(row[13]) || null,
          celula: safeStr(row[14]) || null,
          skill: safeStr(row[15]) || null,
          turno: safeStr(row[16]) || null,
          escalaHora: excelTimeToHHMM(row[17]) || null,
          escala: safeStr(row[18]) || null,
          entrada: excelTimeToHHMM(row[19]) || null,
          saida: excelTimeToHHMM(row[20]) || null,
          entradaS: row.length > 21 ? excelTimeToHHMM(row[21]) || null : null,
          saidaS: row.length > 22 ? excelTimeToHHMM(row[22]) || null : null,
        };

        try {
          // Tenta encontrar registro existente por login ou nome
          let existing = null;
          if (login) {
            const found = await db.select({ id: dimensionamento.id })
              .from(dimensionamento)
              .where(eq(dimensionamento.login, login))
              .limit(1);
            existing = found[0] ?? null;
          }
          if (!existing) {
            const found = await db.select({ id: dimensionamento.id })
              .from(dimensionamento)
              .where(eq(dimensionamento.nome, nome))
              .limit(1);
            existing = found[0] ?? null;
          }

          if (existing) {
            await db.update(dimensionamento).set(payload).where(eq(dimensionamento.id, existing.id));
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
        errors: errors.slice(0, 10), // máximo 10 erros no retorno
      });
    } catch (e: any) {
      console.error("[upload-dimensionamento]", e);
      res.status(500).json({ error: "Erro interno ao processar arquivo: " + e.message });
    }
  });
}
