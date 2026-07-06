import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Shield, Download, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import jsPDF from "jspdf";

interface NR17Row {
  agente: string;
  motivo: string;
  totalSegundos: number;
  totalPausas: number;
  limiteSegundos: number;
  excedeuLimite: boolean;
  excedidoSegundos: number;
}

interface NR17ReportModalProps {
  open: boolean;
  onClose: () => void;
  nr17Abusadores: NR17Row[];
  nr17Todos: NR17Row[];
  selectedDate?: string | null;
}

function secondsToHMS(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const NR17_COLORS: Record<string, string> = {
  "descanso 1": "#f97316",
  "descanso 2": "#fb923c",
  "descanso 3": "#fdba74",
  "lanche": "#22c55e",
  "pausa descanso 1": "#f97316",
  "pausa descanso 2": "#fb923c",
  "pausa descanso 3": "#fdba74",
  "pausa lanche": "#22c55e",
};

function getNR17Color(motivo: string): string {
  const m = motivo.toLowerCase();
  for (const [key, color] of Object.entries(NR17_COLORS)) {
    if (m.includes(key)) return color;
  }
  return "#6366f1";
}

function getNR17Limite(motivo: string): string {
  const m = motivo.toLowerCase();
  if (m.includes("lanche")) return "20 min";
  if (m.includes("descanso")) return "10 min";
  return "—";
}

// Agrega por agente: soma excedido total e conta ocorrências
function aggregateByAgente(rows: NR17Row[]): Array<{
  agente: string;
  totalExcedidoSeg: number;
  ocorrencias: number;
  motivos: string[];
}> {
  const byAgente: Record<string, { agente: string; totalExcedidoSeg: number; ocorrencias: number; motivosSet: Set<string> }> = {};
  for (const r of rows) {
    if (!r.excedeuLimite) continue;
    if (!byAgente[r.agente]) byAgente[r.agente] = { agente: r.agente, totalExcedidoSeg: 0, ocorrencias: 0, motivosSet: new Set() };
    byAgente[r.agente].totalExcedidoSeg += r.excedidoSegundos;
    byAgente[r.agente].ocorrencias += r.totalPausas;
    byAgente[r.agente].motivosSet.add(r.motivo);
  }
  return Object.values(byAgente)
    .sort((a, b) => b.totalExcedidoSeg - a.totalExcedidoSeg)
    .slice(0, 10)
    .map(a => ({ agente: a.agente, totalExcedidoSeg: a.totalExcedidoSeg, ocorrencias: a.ocorrencias, motivos: Array.from(a.motivosSet) }));
}

export default function NR17ReportModal({ open, onClose, nr17Abusadores, nr17Todos, selectedDate }: NR17ReportModalProps) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const today = selectedDate || new Date().toLocaleDateString("pt-BR");
  const top10 = aggregateByAgente(nr17Todos.length > 0 ? nr17Todos : nr17Abusadores);
  const totalEstouros = nr17Abusadores.length;
  const totalAgentesAfetados = new Set(nr17Abusadores.map(r => r.agente)).size;
  const maxExcedido = top10[0]?.totalExcedidoSeg ?? 1;

  async function handleExportPNG() {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      toast.info("Gerando PNG...");
      const url = await toPng(exportRef.current, {
        backgroundColor: "#0f1117",
        pixelRatio: 2.5,
        skipFonts: true,
        cacheBust: true,
        width: exportRef.current.scrollWidth,
        height: exportRef.current.scrollHeight,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-nr17-${selectedDate || new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("PNG exportado com sucesso");
    } catch { toast.error("Erro ao exportar PNG"); }
    setExporting(false);
  }

  async function handleExportPDF() {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      toast.info("Gerando PDF...");
      const url = await toPng(exportRef.current, {
        backgroundColor: "#0f1117",
        pixelRatio: 2.5,
        skipFonts: true,
        cacheBust: true,
        width: exportRef.current.scrollWidth,
        height: exportRef.current.scrollHeight,
      });
      const img = new Image();
      img.src = url;
      await new Promise(res => { img.onload = res; });
      const ratio = img.height / img.width;
      const pdfW = 297;
      const pdfH = pdfW * ratio;
      const orientation = ratio > 1 ? "portrait" : "landscape";
      const pdf = new jsPDF({ orientation, unit: "mm", format: [pdfW, Math.min(pdfH, 420)] });
      const pageH = pdf.internal.pageSize.getHeight();
      if (pdfH <= pageH) {
        pdf.addImage(url, "PNG", 0, 0, pdfW, pdfH);
      } else {
        let yOffset = 0;
        while (yOffset < pdfH) {
          if (yOffset > 0) pdf.addPage();
          pdf.addImage(url, "PNG", 0, -yOffset, pdfW, pdfH);
          yOffset += pageH;
        }
      }
      pdf.save(`relatorio-nr17-${selectedDate || new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF exportado com sucesso");
    } catch { toast.error("Erro ao exportar PDF"); }
    setExporting(false);
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl w-full max-h-[92vh] overflow-y-auto bg-[#0f1117] border-border p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">Relatório NR17 — Top 10 Abusadores</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">DDM Control Desk · {today}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleExportPNG} disabled={exporting || top10.length === 0} size="sm"
              variant="outline" className="gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs">
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Gerando..." : "PNG"}
            </Button>
            <Button onClick={handleExportPDF} disabled={exporting || top10.length === 0} size="sm"
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-semibold">
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Gerando..." : "PDF"}
            </Button>
            <button onClick={onClose} className="ml-2 p-1 rounded hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </DialogHeader>

        {/* Conteúdo exportável */}
        <div ref={exportRef} className="p-6 space-y-6 bg-[#0f1117]">
          {/* Cabeçalho do relatório */}
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Relatório NR17 — Pausas Obrigatórias</h1>
                <p className="text-xs text-white/50">DDM Control Desk · {today} · Descanso: 10 min · Lanche: 20 min</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-400">{totalEstouros}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wide">Estouros</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-400">{totalAgentesAfetados}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wide">Agentes</p>
              </div>
            </div>
          </div>

          {/* Aviso NR17 */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              Pausas NR17 são obrigatórias por lei. O monitoramento abaixo identifica agentes que excederam os limites permitidos.
              Qualquer segundo acima do limite já é registrado como estourado.
            </p>
          </div>

          {top10.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 opacity-60" />
              <p className="text-white/50 text-sm">Nenhum agente estourou pausas NR17 neste período</p>
            </div>
          ) : (
            <>
              {/* Top 10 ranking visual */}
              <div>
                <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
                  Top 10 — Maior Tempo Excedido Acumulado
                </p>
                <div className="space-y-2">
                  {top10.map((agente, i) => {
                    const pct = Math.round((agente.totalExcedidoSeg / maxExcedido) * 100);
                    const isTop3 = i < 3;
                    const barColor = i === 0 ? "#ef4444" : i === 1 ? "#f97316" : i === 2 ? "#f59e0b" : "#6366f1";
                    return (
                      <div key={agente.agente} className={`rounded-xl p-3 border ${isTop3 ? "border-red-500/20 bg-red-500/5" : "border-white/5 bg-white/3"}`}>
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`text-sm font-bold w-6 text-center ${isTop3 ? "text-red-400" : "text-white/40"}`}>
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-white truncate">{agente.agente}</p>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-xs text-white/50">{agente.ocorrencias}x pausas</span>
                                <span className={`text-sm font-bold font-mono ${isTop3 ? "text-red-400" : "text-amber-400"}`}>
                                  +{secondsToHMS(agente.totalExcedidoSeg)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {agente.motivos.map(m => {
                                const cor = getNR17Color(m);
                                return (
                                  <span key={m} className="text-[10px] px-1.5 py-0 rounded font-medium"
                                    style={{ backgroundColor: `${cor}20`, color: cor }}>
                                    {m} · lim. {getNR17Limite(m)}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        {/* Barra de progresso */}
                        <div className="ml-9">
                          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabela detalhada por agente+motivo */}
              <div>
                <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
                  Detalhamento por Agente e Tipo de Pausa
                </p>
                <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/8 bg-white/5">
                        <th className="px-3 py-2.5 text-left text-white/40 font-semibold uppercase tracking-wider">#</th>
                        <th className="px-3 py-2.5 text-left text-white/40 font-semibold uppercase tracking-wider">Agente</th>
                        <th className="px-3 py-2.5 text-left text-white/40 font-semibold uppercase tracking-wider">Tipo Pausa</th>
                        <th className="px-3 py-2.5 text-center text-white/40 font-semibold uppercase tracking-wider">Limite</th>
                        <th className="px-3 py-2.5 text-right text-white/40 font-semibold uppercase tracking-wider">Tempo Usado</th>
                        <th className="px-3 py-2.5 text-right text-white/40 font-semibold uppercase tracking-wider">Nº Pausas</th>
                        <th className="px-3 py-2.5 text-right text-white/40 font-semibold uppercase tracking-wider">Excedeu</th>
                        <th className="px-3 py-2.5 text-center text-white/40 font-semibold uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nr17Abusadores.slice(0, 30).map((r, i) => {
                        const cor = getNR17Color(r.motivo);
                        const excMin = Math.floor(r.excedidoSegundos / 60);
                        const excSec = r.excedidoSegundos % 60;
                        return (
                          <tr key={`${r.agente}-${r.motivo}-${i}`} className="border-b border-white/5 hover:bg-white/3">
                            <td className="px-3 py-2 text-white/30">{i + 1}</td>
                            <td className="px-3 py-2 font-medium text-white">{r.agente}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
                                style={{ backgroundColor: `${cor}20`, color: cor }}>
                                {r.motivo}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-white/40 font-mono">{getNR17Limite(r.motivo)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-white">{secondsToHMS(r.totalSegundos)}</td>
                            <td className="px-3 py-2 text-right text-white/50">{r.totalPausas}x</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold">
                              {r.excedeuLimite
                                ? <span className="text-red-400">+{excMin}min {String(excSec).padStart(2, "0")}s</span>
                                : <span className="text-white/20">—</span>
                              }
                            </td>
                            <td className="px-3 py-2 text-center">
                              {r.excedeuLimite
                                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-semibold">Estourou</span>
                                : <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">OK</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Rodapé */}
          <div className="flex items-center justify-between pt-3 border-t border-white/8">
            <p className="text-[10px] text-white/25">DDM Control Desk · Gerado em {new Date().toLocaleString("pt-BR")}</p>
            <p className="text-[10px] text-white/25">NR17 — Norma Regulamentadora 17 · Ergonomia</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
