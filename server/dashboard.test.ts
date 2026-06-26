import { describe, expect, it } from "vitest";
import { detectReportType, parseAgentDay, parseReasonAgent, parseCampaignAgent, parseDispositionAgent } from "./parsers";

// Minimal HTML templates mimicking the real report structure
const makeHtml = (headers: string[], rows: string[][]) => `
<html><body>
<table><tr><td>Data Inicial</td><td>26/06/2026</td></tr></table>
<table>
  <tr>${headers.map(h => `<td>${h}</td>`).join("")}</tr>
  ${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}
</table>
</body></html>`;

describe("detectReportType", () => {
  it("detects AgentDay", () => {
    const html = makeHtml(["AGENTE", "CHAMADAS ATENDIDAS", "TEMPO LOGADO"], [["João", "10", "08:00:00"]]);
    expect(detectReportType(html)).toBe("AgentDay");
  });

  it("detects ReasonAgent", () => {
    const html = makeHtml(["AGENTE", "MOTIVO DE PAUSA", "TEMPO TOTAL DE PAUSA"], [["João", "Almoço", "01:00:00"]]);
    expect(detectReportType(html)).toBe("ReasonAgent");
  });

  it("detects CampaignAgent", () => {
    const html = makeHtml(["AGENTE", "CAMPANHA", "NOME DO SUPERVISOR"], [["João", "Camp1", "Sup1"]]);
    expect(detectReportType(html)).toBe("CampaignAgent");
  });

  it("detects DispositionAgent", () => {
    const html = makeHtml(["AGENTE", "TABULAÇÃO", "TEMPO DE TABULAÇÃO"], [["João", "Tempo de Tabulacao Excedido", "00:05:00"]]);
    expect(detectReportType(html)).toBe("DispositionAgent");
  });

  it("returns null for unknown", () => {
    expect(detectReportType("<html><body>Unknown</body></html>")).toBeNull();
  });
});

describe("parseAgentDay", () => {
  it("parses rows correctly", () => {
    const html = makeHtml(
      ["DATA", "AGENTE", "LOGIN", "CHAMADAS ATENDIDAS", "CONTATO EFETIVO", "TEMPO LOGADO", "TABULAÇÕES SUCESSO"],
      [["26/06/2026", "João Silva", "joao", "42", "15", "08:30:00", "10"]]
    );
    const result = parseAgentDay(html);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].agente).toBe("João Silva");
    expect(result.rows[0].chamadasAtendidas).toBe(42);
    expect(result.rows[0].contatoEfetivo).toBe(15);
    expect(result.rows[0].tempoLogado).toBe("08:30:00");
    expect(result.rows[0].tabulacoesSucesso).toBe(10);
  });

  it("skips empty rows", () => {
    const html = makeHtml(
      ["DATA", "AGENTE", "CHAMADAS ATENDIDAS"],
      [["26/06/2026", "", "5"], ["26/06/2026", "Maria", "8"]]
    );
    const result = parseAgentDay(html);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].agente).toBe("Maria");
  });
});

describe("parseReasonAgent", () => {
  it("parses pause reasons", () => {
    const html = makeHtml(
      ["AGENTE", "LOGIN", "MOTIVO DE PAUSA", "TEMPO TOTAL DE PAUSA", "ID AGENTE", "PAUSAS (TOTALIZADO POR CAMPANHA )"],
      [["Ana", "ana", "Almoço", "01:00:00", "123", "2"]]
    );
    const result = parseReasonAgent(html);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].motivoDePausa).toBe("Almoço");
    expect(result.rows[0].pausasTotalizadoPorCampanha).toBe(2);
  });
});

describe("parseCampaignAgent", () => {
  it("parses campaign data", () => {
    const html = makeHtml(
      ["AGENTE", "LOGIN", "CAMPANHA", "LOGINS", "NOME DO SUPERVISOR", "TOTAL DE CHAMADAS", "TOTAL DE CONTATOS", "TABULAÇÕES SUCESSO NEGÓCIO", "TABULAÇÕES SUCESSO"],
      [["Pedro", "pedro", "Camp_A", "1", "Supervisor X", "100", "30", "5", "25"]]
    );
    const result = parseCampaignAgent(html);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].campanha).toBe("Camp_A");
    expect(result.rows[0].totalChamadas).toBe(100);
    expect(result.rows[0].nomeSupervisor).toBe("Supervisor X");
  });
});

describe("parseDispositionAgent", () => {
  it("parses disposition data", () => {
    const html = makeHtml(
      ["AGENTE", "LOGIN", "TABULAÇÃO", "NOME DO SUPERVISOR", "TEMPO DE TABULAÇÃO", "TOTAL DE CHAMADAS"],
      [["Carlos", "carlos", "Tempo de Tabulacao Excedido", "Sup Y", "00:05:04", "6"]]
    );
    const result = parseDispositionAgent(html);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].agente).toBe("Carlos");
    expect(result.rows[0].nomeSupervisor).toBe("Sup Y");
    expect(result.rows[0].totalChamadas).toBe(6);
  });
});
