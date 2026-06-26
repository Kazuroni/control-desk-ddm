import { parse } from "node-html-parser";

export type ReportType = "AgentDay" | "ReasonAgent" | "CampaignAgent" | "DispositionAgent";

// Converte tempo em formato HH:MM:SS ou decimal para string HH:MM:SS
function normalizeTime(value: string | number | null | undefined): string {
  if (!value && value !== 0) return "00:00:00";
  if (typeof value === "number") {
    // Valor decimal do Excel (fração de dia)
    const totalSeconds = Math.round(value * 86400);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const str = String(value).trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(str)) return str;
  return str || "00:00:00";
}

function safeInt(v: string | null | undefined): number {
  if (!v) return 0;
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function cleanText(v: string | null | undefined): string {
  return (v || "").trim().replace(/\s+/g, " ");
}

// Detecta o tipo de relatório pelo conteúdo HTML
export function detectReportType(html: string): ReportType | null {
  const lower = html.toLowerCase();
  if (lower.includes("chamadas atendidas") && lower.includes("tempo logado")) return "AgentDay";
  if (lower.includes("motivo de pausa") || lower.includes("tempo total de pausa")) return "ReasonAgent";
  if (lower.includes("campanha") && lower.includes("nome do supervisor") && !lower.includes("motivo")) return "CampaignAgent";
  if (lower.includes("tabulação") && lower.includes("tempo de tabulação")) return "DispositionAgent";
  return null;
}

// Extrai a data de referência da tabela de parâmetros
function extractReferenceDate(root: ReturnType<typeof parse>): string {
  const tables = root.querySelectorAll("table");
  if (tables.length > 0) {
    const rows = tables[0].querySelectorAll("tr");
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      const texts = cells.map((c) => cleanText(c.text));
      const dateIdx = texts.findIndex((t) =>
        t.toLowerCase().includes("data inicial") || t.toLowerCase().includes("data")
      );
      if (dateIdx >= 0 && texts[dateIdx + 1]) {
        const dateVal = texts[dateIdx + 1];
        if (/\d{2}\/\d{2}\/\d{4}/.test(dateVal)) return dateVal;
      }
    }
  }
  return new Date().toLocaleDateString("pt-BR");
}

// ─── Parser AgentDay ───────────────────────────────────────────────────────────
export function parseAgentDay(html: string) {
  const root = parse(html);
  const referenceDate = extractReferenceDate(root);
  const tables = root.querySelectorAll("table");
  if (tables.length < 2) return { referenceDate, rows: [] };

  const dataTable = tables[1];
  const rows = dataTable.querySelectorAll("tr");
  if (rows.length < 2) return { referenceDate, rows: [] };

  const headers = rows[0].querySelectorAll("td,th").map((c) => cleanText(c.text).toUpperCase());

  const idx = (name: string) => headers.findIndex((h) => h.includes(name));

  const iData = idx("DATA");
  const iAgente = idx("AGENTE");
  const iLogin = idx("LOGIN");
  const iAgentesLogados = idx("AGENTES LOGADOS");
  const iChamadasAtendidas = idx("CHAMADAS ATENDIDAS");
  const iChamadasManuais = idx("CHAMADAS MANUAIS");
  const iContatoEfetivo = idx("CONTATO EFETIVO");
  const iLogins = idx("LOGINS");
  const iIdAgente = idx("ID AGENTE");
  const iTabulacoesTotal = idx("TABULAÇÕES (TOTAL)");
  const iTotalChamadas = idx("TOTAL DE CHAMADAS");
  const iTotalContatos = idx("TOTAL DE CONTATOS");
  const iPrimeiroLogin = idx("PRIMEIRO LOGIN");
  const iTempoOcioso = idx("TEMPO OCIOSO");
  const iTempoPausa = idx("TEMPO PAUSA");
  const iUltimoLogout = idx("ÚLTIMO LOGOUT");
  const iPausas = idx("PAUSAS");
  const iTabulacoesSucesso = idx("TABULAÇÕES SUCESSO");
  const iTabulacoesSucessoNegocio = idx("TABULAÇÕES SUCESSO NEGÓCIO");
  const iTempoTabulacao = idx("TEMPO DE TABULAÇÃO");
  const iTempoLogado = idx("TEMPO LOGADO");
  const iPausasImprodutivas = idx("PAUSAS IMPRODUTIVAS");
  const iUF = idx("UF");
  const iProduto = idx("PRODUTO");

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll("td").map((c) => cleanText(c.text));
    if (cells.length < 3) continue;
    const agente = iAgente >= 0 ? cells[iAgente] : "";
    if (!agente) continue;

    result.push({
      referenceDate: iData >= 0 ? cells[iData] || referenceDate : referenceDate,
      agente,
      login: iLogin >= 0 ? cells[iLogin] : "",
      agentesLogados: safeInt(iAgentesLogados >= 0 ? cells[iAgentesLogados] : "0"),
      chamadasAtendidas: safeInt(iChamadasAtendidas >= 0 ? cells[iChamadasAtendidas] : "0"),
      chamadasManuais: safeInt(iChamadasManuais >= 0 ? cells[iChamadasManuais] : "0"),
      contatoEfetivo: safeInt(iContatoEfetivo >= 0 ? cells[iContatoEfetivo] : "0"),
      logins: safeInt(iLogins >= 0 ? cells[iLogins] : "0"),
      idAgente: iIdAgente >= 0 ? cells[iIdAgente] : "",
      tabulacoesTotal: safeInt(iTabulacoesTotal >= 0 ? cells[iTabulacoesTotal] : "0"),
      totalChamadas: safeInt(iTotalChamadas >= 0 ? cells[iTotalChamadas] : "0"),
      totalContatos: safeInt(iTotalContatos >= 0 ? cells[iTotalContatos] : "0"),
      primeiroLogin: iPrimeiroLogin >= 0 ? cells[iPrimeiroLogin] : "",
      tempoOcioso: iTempoOcioso >= 0 ? normalizeTime(cells[iTempoOcioso]) : "00:00:00",
      tempoPausa: iTempoPausa >= 0 ? normalizeTime(cells[iTempoPausa]) : "00:00:00",
      ultimoLogout: iUltimoLogout >= 0 ? cells[iUltimoLogout] : "",
      pausas: safeInt(iPausas >= 0 ? cells[iPausas] : "0"),
      tabulacoesSucesso: safeInt(iTabulacoesSucesso >= 0 ? cells[iTabulacoesSucesso] : "0"),
      tabulacoesSucessoNegocio: safeInt(iTabulacoesSucessoNegocio >= 0 ? cells[iTabulacoesSucessoNegocio] : "0"),
      tempoTabulacao: iTempoTabulacao >= 0 ? normalizeTime(cells[iTempoTabulacao]) : "00:00:00",
      tempoLogado: iTempoLogado >= 0 ? normalizeTime(cells[iTempoLogado]) : "00:00:00",
      pausasImprodutivas: safeInt(iPausasImprodutivas >= 0 ? cells[iPausasImprodutivas] : "0"),
      uf: iUF >= 0 ? cells[iUF] : "",
      produto: iProduto >= 0 ? cells[iProduto] : "",
    });
  }
  return { referenceDate, rows: result };
}

// ─── Parser ReasonAgent ────────────────────────────────────────────────────────
export function parseReasonAgent(html: string) {
  const root = parse(html);
  const referenceDate = extractReferenceDate(root);
  const tables = root.querySelectorAll("table");
  if (tables.length < 2) return { referenceDate, rows: [] };

  const dataTable = tables[1];
  const rows = dataTable.querySelectorAll("tr");
  if (rows.length < 2) return { referenceDate, rows: [] };

  const headers = rows[0].querySelectorAll("td,th").map((c) => cleanText(c.text).toUpperCase());
  const idx = (name: string) => headers.findIndex((h) => h.includes(name));

  const iAgente = idx("AGENTE");
  const iLogin = idx("LOGIN");
  const iMotivo = idx("MOTIVO DE PAUSA");
  const iTempo = idx("TEMPO TOTAL DE PAUSA");
  const iIdAgente = idx("ID AGENTE");
  const iPausas = idx("PAUSAS (TOTALIZADO");

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll("td").map((c) => cleanText(c.text));
    if (cells.length < 3) continue;
    const agente = iAgente >= 0 ? cells[iAgente] : "";
    if (!agente) continue;

    result.push({
      agente,
      login: iLogin >= 0 ? cells[iLogin] : "",
      motivoDePausa: iMotivo >= 0 ? cells[iMotivo] : "",
      tempoTotalDePausa: iTempo >= 0 ? cells[iTempo] : "00:00:00",
      idAgente: iIdAgente >= 0 ? cells[iIdAgente] : "",
      pausasTotalizadoPorCampanha: safeInt(iPausas >= 0 ? cells[iPausas] : "0"),
    });
  }
  return { referenceDate, rows: result };
}

// ─── Parser CampaignAgent ──────────────────────────────────────────────────────
export function parseCampaignAgent(html: string) {
  const root = parse(html);
  const referenceDate = extractReferenceDate(root);
  const tables = root.querySelectorAll("table");
  if (tables.length < 2) return { referenceDate, rows: [] };

  const dataTable = tables[1];
  const rows = dataTable.querySelectorAll("tr");
  if (rows.length < 2) return { referenceDate, rows: [] };

  const headers = rows[0].querySelectorAll("td,th").map((c) => cleanText(c.text).toUpperCase());
  const idx = (name: string) => headers.findIndex((h) => h.includes(name));

  const iAgente = idx("AGENTE");
  const iLogin = idx("LOGIN");
  const iCampanha = idx("CAMPANHA");
  const iLogins = idx("LOGINS");
  const iSupervisor = idx("NOME DO SUPERVISOR");
  const iTotalChamadas = idx("TOTAL DE CHAMADAS");
  const iTotalContatos = idx("TOTAL DE CONTATOS");
  const iTabulacoesSucessoNegocio = idx("TABULAÇÕES SUCESSO NEGÓCIO");
  const iTabulacoesSucesso = idx("TABULAÇÕES SUCESSO");
  const iUF = idx("UF");

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll("td").map((c) => cleanText(c.text));
    if (cells.length < 3) continue;
    const agente = iAgente >= 0 ? cells[iAgente] : "";
    if (!agente) continue;

    result.push({
      agente,
      login: iLogin >= 0 ? cells[iLogin] : "",
      campanha: iCampanha >= 0 ? cells[iCampanha] : "",
      logins: safeInt(iLogins >= 0 ? cells[iLogins] : "0"),
      nomeSupervisor: iSupervisor >= 0 ? cells[iSupervisor] : "",
      totalChamadas: safeInt(iTotalChamadas >= 0 ? cells[iTotalChamadas] : "0"),
      totalContatos: safeInt(iTotalContatos >= 0 ? cells[iTotalContatos] : "0"),
      tabulacoesSucessoNegocio: safeInt(iTabulacoesSucessoNegocio >= 0 ? cells[iTabulacoesSucessoNegocio] : "0"),
      tabulacoesSucesso: safeInt(iTabulacoesSucesso >= 0 ? cells[iTabulacoesSucesso] : "0"),
      uf: iUF >= 0 ? cells[iUF] : "",
    });
  }
  return { referenceDate, rows: result };
}

// ─── Parser DispositionAgent ───────────────────────────────────────────────────
export function parseDispositionAgent(html: string) {
  const root = parse(html);
  const referenceDate = extractReferenceDate(root);
  const tables = root.querySelectorAll("table");
  if (tables.length < 2) return { referenceDate, rows: [] };

  const dataTable = tables[1];
  const rows = dataTable.querySelectorAll("tr");
  if (rows.length < 2) return { referenceDate, rows: [] };

  const headers = rows[0].querySelectorAll("td,th").map((c) => cleanText(c.text).toUpperCase());
  const idx = (name: string) => headers.findIndex((h) => h.includes(name));

  const iAgente = idx("AGENTE");
  const iLogin = idx("LOGIN");
  const iTabulacao = idx("TABULAÇÃO");
  const iSupervisor = idx("NOME DO SUPERVISOR");
  const iTempoTabulacao = idx("TEMPO DE TABULAÇÃO");
  const iTotalChamadas = idx("TOTAL DE CHAMADAS");
  const iUF = idx("UF");

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll("td").map((c) => cleanText(c.text));
    if (cells.length < 3) continue;
    const agente = iAgente >= 0 ? cells[iAgente] : "";
    if (!agente) continue;

    result.push({
      agente,
      login: iLogin >= 0 ? cells[iLogin] : "",
      tabulacao: iTabulacao >= 0 ? cells[iTabulacao] : "",
      nomeSupervisor: iSupervisor >= 0 ? cells[iSupervisor] : "",
      tempoTabulacao: iTempoTabulacao >= 0 ? cells[iTempoTabulacao] : "00:00:00",
      totalChamadas: safeInt(iTotalChamadas >= 0 ? cells[iTotalChamadas] : "0"),
      uf: iUF >= 0 ? cells[iUF] : "",
    });
  }
  return { referenceDate, rows: result };
}

// ─── Dispatcher principal ──────────────────────────────────────────────────────
export function parseReport(html: string, reportType: ReportType) {
  switch (reportType) {
    case "AgentDay": return parseAgentDay(html);
    case "ReasonAgent": return parseReasonAgent(html);
    case "CampaignAgent": return parseCampaignAgent(html);
    case "DispositionAgent": return parseDispositionAgent(html);
  }
}
