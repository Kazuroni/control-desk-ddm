import { parse } from "node-html-parser";

export type ReportType = "AgentDay" | "ReasonAgent" | "CampaignAgent" | "DispositionAgent";

// Converte tempo em formato HH:MM:SS para string normalizada
function normalizeTime(value: string | null | undefined): string {
  if (!value) return "00:00:00";
  const str = String(value).trim();
  // Aceita HH:MM:SS ou H:MM:SS
  if (/^\d+:\d{2}:\d{2}$/.test(str)) return str;
  return "00:00:00";
}

/**
 * Converte string numérica brasileira para inteiro.
 * Trata separador de milhar (ponto) e separador decimal (vírgula).
 * Ex: "1.569" → 1569, "10.183" → 10183, "2.736,77" → 2736
 */
function safeInt(v: string | null | undefined): number {
  if (!v) return 0;
  const s = v.trim();
  if (!s) return 0;
  // Remove pontos de milhar, substitui vírgula decimal por ponto, remove resto
  const cleaned = s.replace(/\./g, "").replace(/,\d+$/, "").replace(/[^\d-]/g, "");
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

function cleanText(v: string | null | undefined): string {
  return (v || "").trim().replace(/\s+/g, " ");
}

/**
 * Verifica se uma linha é de totais/rodapé do sistema OLOS.
 * O sistema gera linhas com AGENTE = "TOTAL" ou apenas um número (contagem de agentes).
 */
function isTotalRow(agente: string): boolean {
  const t = agente.trim();
  // Linha com texto "TOTAL", "TOTAIS", etc.
  if (/^(TOTAL|TOTAIS|SUBTOTAL|GRAND TOTAL|TOTAL GERAL)$/i.test(t)) return true;
  // Linha onde o "agente" é apenas um número (linha de contagem do OLOS)
  if (/^\d+$/.test(t)) return true;
  return false;
}

// Detecta o tipo de relatório pelo conteúdo HTML
// Ordem importa: do mais específico para o mais genérico
export function detectReportType(html: string): ReportType | null {
  const lower = html.toLowerCase();

  // AgentDay: único com "chamadas atendidas" E "tempo logado"
  if (lower.includes("chamadas atendidas") && lower.includes("tempo logado")) return "AgentDay";

  // ReasonAgent: único com "motivo de pausa" ou "tempo total de pausa"
  if (lower.includes("motivo de pausa") || lower.includes("tempo total de pausa")) return "ReasonAgent";

  // DispositionAgent: contém "tabulacao excedido" ou ("tempo de tabula" E NÃO "logins")
  // O parâmetro "tabulações excedidas" aparece apenas no DispositionAgent
  if (lower.includes("tabulações excedidas") || lower.includes("tabulacoes excedidas") || lower.includes("tabulacao excedido")) return "DispositionAgent";
  if (lower.includes("tempo de tabula") && !lower.includes("logins")) return "DispositionAgent";

  // CampaignAgent: contém "logins" E "nome do supervisor" (sem os marcadores acima)
  if (lower.includes("logins") && lower.includes("nome do supervisor")) return "CampaignAgent";
  if (lower.includes("atendidas celulas") || lower.includes("atendidas células")) return "CampaignAgent";

  return null;
}

// Extrai a data de referência da tabela de parâmetros (primeira tabela do HTML)
function extractReferenceDate(root: ReturnType<typeof parse>): string {
  const tables = root.querySelectorAll("table");
  if (tables.length > 0) {
    const rows = tables[0].querySelectorAll("tr");
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      const texts = cells.map((c) => cleanText(c.text));
      const dateIdx = texts.findIndex((t) =>
        t.toLowerCase().includes("data inicial") || t.toLowerCase() === "data"
      );
      if (dateIdx >= 0 && texts[dateIdx + 1]) {
        const dateVal = texts[dateIdx + 1];
        const match = dateVal.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (match) return match[1];
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

  // Mapeia colunas pelos cabeçalhos reais do OLOS
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
  // "PRIMEIRO LOGIN" sem "(DATA HORA)" — pega apenas o campo de hora
  const iPrimeiroLogin = headers.findIndex((h) => h === "PRIMEIRO LOGIN");
  const iTempoOcioso = idx("TEMPO OCIOSO");
  // "TEMPO PAUSA" sem "IMPRODUTIVA"
  const iTempoPausa = headers.findIndex((h) => h === "TEMPO PAUSA");
  // "ÚLTIMO LOGOUT" sem "(DATA HORA)"
  const iUltimoLogout = headers.findIndex((h) => h === "ÚLTIMO LOGOUT");
  const iPausas = idx("PAUSAS");
  // "TABULAÇÕES SUCESSO" sem "NEGÓCIO" — busca exata
  const iTabulacoesSucesso = headers.findIndex((h) => h === "TABULAÇÕES SUCESSO");
  const iTabulacoesSucessoNegocio = idx("TABULAÇÕES SUCESSO NEGÓCIO");
  const iTempoTabulacao = idx("TEMPO DE TABULAÇÃO");
  const iTempoLogado = idx("TEMPO LOGADO");
  const iPausasImprodutivas = idx("TEMPO PAUSA IMPRODUTIVA");
  const iUF = idx("UF");
  const iProduto = idx("PRODUTO");

  // Deduplicação: usa Map por login/agente para garantir unicidade
  const seen = new Map<string, boolean>();
  const result = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll("td").map((c) => cleanText(c.text));
    if (cells.length < 3) continue;
    const agente = iAgente >= 0 ? cells[iAgente] : "";
    if (!agente) continue;
    if (isTotalRow(agente)) continue;

    // Chave de deduplicação: agente + data (um agente pode aparecer em múltiplas datas)
    const referDate = iData >= 0 ? cells[iData] || referenceDate : referenceDate;
    const dedupeKey = `${agente}|${referDate}`;
    if (seen.has(dedupeKey)) continue;
    seen.set(dedupeKey, true);

    result.push({
      referenceDate: referDate,
      agente,
      login: iLogin >= 0 ? cells[iLogin] : "",
      agentesLogados: safeInt(iAgentesLogados >= 0 ? cells[iAgentesLogados] : ""),
      chamadasAtendidas: safeInt(iChamadasAtendidas >= 0 ? cells[iChamadasAtendidas] : ""),
      chamadasManuais: safeInt(iChamadasManuais >= 0 ? cells[iChamadasManuais] : ""),
      contatoEfetivo: safeInt(iContatoEfetivo >= 0 ? cells[iContatoEfetivo] : ""),
      logins: safeInt(iLogins >= 0 ? cells[iLogins] : ""),
      idAgente: iIdAgente >= 0 ? cells[iIdAgente] : "",
      tabulacoesTotal: safeInt(iTabulacoesTotal >= 0 ? cells[iTabulacoesTotal] : ""),
      totalChamadas: safeInt(iTotalChamadas >= 0 ? cells[iTotalChamadas] : ""),
      totalContatos: safeInt(iTotalContatos >= 0 ? cells[iTotalContatos] : ""),
      primeiroLogin: iPrimeiroLogin >= 0 ? cells[iPrimeiroLogin] : "",
      tempoOcioso: iTempoOcioso >= 0 ? normalizeTime(cells[iTempoOcioso]) : "00:00:00",
      tempoPausa: iTempoPausa >= 0 ? normalizeTime(cells[iTempoPausa]) : "00:00:00",
      ultimoLogout: iUltimoLogout >= 0 ? cells[iUltimoLogout] : "",
      pausas: safeInt(iPausas >= 0 ? cells[iPausas] : ""),
      tabulacoesSucesso: iTabulacoesSucesso >= 0 ? safeInt(cells[iTabulacoesSucesso]) : 0,
      tabulacoesSucessoNegocio: safeInt(iTabulacoesSucessoNegocio >= 0 ? cells[iTabulacoesSucessoNegocio] : ""),
      tempoTabulacao: iTempoTabulacao >= 0 ? normalizeTime(cells[iTempoTabulacao]) : "00:00:00",
      tempoLogado: iTempoLogado >= 0 ? normalizeTime(cells[iTempoLogado]) : "00:00:00",
      pausasImprodutivas: iPausasImprodutivas >= 0 ? normalizeTime(cells[iPausasImprodutivas]) : "00:00:00",
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
  const iPausas = idx("PAUSAS");

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll("td").map((c) => cleanText(c.text));
    if (cells.length < 3) continue;
    const agente = iAgente >= 0 ? cells[iAgente] : "";
    if (!agente) continue;
    if (isTotalRow(agente)) continue;

    result.push({
      agente,
      login: iLogin >= 0 ? cells[iLogin] : "",
      motivoDePausa: iMotivo >= 0 ? cells[iMotivo] : "",
      tempoTotalDePausa: iTempo >= 0 ? normalizeTime(cells[iTempo]) : "00:00:00",
      idAgente: iIdAgente >= 0 ? cells[iIdAgente] : "",
      pausasTotalizadoPorCampanha: safeInt(iPausas >= 0 ? cells[iPausas] : ""),
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
  // "TABULAÇÕES SUCESSO" sem "NEGÓCIO"
  const iTabulacoesSucesso = headers.findIndex((h) => h === "TABULAÇÕES SUCESSO");
  const iUF = idx("UF");

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll("td").map((c) => cleanText(c.text));
    if (cells.length < 3) continue;
    const agente = iAgente >= 0 ? cells[iAgente] : "";
    if (!agente) continue;
    if (isTotalRow(agente)) continue;

    // Filtra supervisor: se for numérico puro, é um ID e não um nome — descarta
    const supervisorRaw = iSupervisor >= 0 ? cells[iSupervisor] : "";
    const nomeSupervisor = /^\d+$/.test(supervisorRaw.trim()) ? "" : supervisorRaw;

    result.push({
      agente,
      login: iLogin >= 0 ? cells[iLogin] : "",
      campanha: iCampanha >= 0 ? cells[iCampanha] : "",
      logins: safeInt(iLogins >= 0 ? cells[iLogins] : ""),
      nomeSupervisor,
      totalChamadas: safeInt(iTotalChamadas >= 0 ? cells[iTotalChamadas] : ""),
      totalContatos: safeInt(iTotalContatos >= 0 ? cells[iTotalContatos] : ""),
      tabulacoesSucessoNegocio: safeInt(iTabulacoesSucessoNegocio >= 0 ? cells[iTabulacoesSucessoNegocio] : ""),
      tabulacoesSucesso: iTabulacoesSucesso >= 0 ? safeInt(cells[iTabulacoesSucesso]) : 0,
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

  // Cabeçalhos reais: AGENTE, LOGIN, TABULAÇÃO, NOME DO SUPERVISOR, TEMPO DE TABULAÇÃO, TOTAL DE CHAMADAS
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
    if (isTotalRow(agente)) continue;

    // Filtra supervisor numérico (ID)
    const supervisorRaw = iSupervisor >= 0 ? cells[iSupervisor] : "";
    const nomeSupervisor = /^\d+$/.test(supervisorRaw.trim()) ? "" : supervisorRaw;

    result.push({
      agente,
      login: iLogin >= 0 ? cells[iLogin] : "",
      tabulacao: iTabulacao >= 0 ? cells[iTabulacao] : "",
      nomeSupervisor,
      tempoTabulacao: iTempoTabulacao >= 0 ? normalizeTime(cells[iTempoTabulacao]) : "00:00:00",
      totalChamadas: safeInt(iTotalChamadas >= 0 ? cells[iTotalChamadas] : ""),
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
