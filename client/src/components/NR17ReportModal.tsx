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
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${String(m).padStart(2, "0")}min ${String(sec).padStart(2, "0")}s`;
}

function secondsToHMSFull(s: number): string {
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

interface AgenteAgregado {
  agente: string;
  totalExcedidoSeg: number;
  ocorrencias: number;
  motivos: string[];
}

function aggregateByAgente(rows: NR17Row[]): AgenteAgregado[] {
  const byAgente: Record<string, { agente: string; totalExcedidoSeg: number; ocorrencias: number; motivosSet: Set<string> }> = {};
  for (const r of rows) {
    if (!r.excedeuLimite) continue;
    if (!byAgente[r.agente]) {
      byAgente[r.agente] = { agente: r.agente, totalExcedidoSeg: 0, ocorrencias: 0, motivosSet: new Set() };
    }
    byAgente[r.agente].totalExcedidoSeg += r.excedidoSegundos;
    byAgente[r.agente].ocorrencias += r.totalPausas;
    byAgente[r.agente].motivosSet.add(r.motivo);
  }
  return Object.values(byAgente)
    .sort((a, b) => b.totalExcedidoSeg - a.totalExcedidoSeg)
    .slice(0, 10)
    .map(a => ({
      agente: a.agente,
      totalExcedidoSeg: a.totalExcedidoSeg,
      ocorrencias: a.ocorrencias,
      motivos: Array.from(a.motivosSet),
    }));
}

export default function NR17ReportModal({ open, onClose, nr17Abusadores, nr17Todos, selectedDate }: NR17ReportModalProps) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const today = selectedDate || new Date().toLocaleDateString("pt-BR");
  const top10 = aggregateByAgente(nr17Todos.length > 0 ? nr17Todos : nr17Abusadores);
  const totalEstouros = nr17Abusadores.length;
  const totalAgentesAfetados = new Set(nr17Abusadores.map(r => r.agente)).size;
  const maxExcedido = top10[0]?.totalExcedidoSeg ?? 1;

  async function captureRef(): Promise<string> {
    if (!exportRef.current) throw new Error("Ref vazio");
    const el = exportRef.current;
    return toPng(el, {
      backgroundColor: "#0f1117",
      pixelRatio: 2,
      skipFonts: true,
      cacheBust: true,
      width: el.scrollWidth,
      height: el.scrollHeight,
      style: { borderRadius: "0" },
    });
  }

  async function handleExportPNG() {
    if (!exportRef.current) return;
    setExporting(true);
    toast.info("Gerando PNG...");
    try {
      const url = await captureRef();
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-nr17-${selectedDate || new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("PNG exportado com sucesso");
    } catch {
      toast.error("Erro ao exportar PNG");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPDF() {
    if (!exportRef.current) return;
    setExporting(true);
    toast.info("Gerando PDF...");
    try {
      const url = await captureRef();
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
      const ratio = img.naturalWidth / img.naturalHeight;
      const pdfW = 420;
      const pdfH = pdfW / ratio;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [pdfW, Math.max(pdfH, 297)] });
      const usedW = pdf.internal.pageSize.getWidth();
      const usedH = usedW / ratio;
      const pageH = pdf.internal.pageSize.getHeight();
      if (usedH <= pageH) {
        pdf.addImage(url, "PNG", 0, 0, usedW, usedH);
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const sliceH = Math.floor(img.naturalHeight * (pageH / usedH));
        let srcY = 0;
        let firstPage = true;
        while (srcY < img.naturalHeight) {
          const sc = document.createElement("canvas");
          sc.width = img.naturalWidth;
          sc.height = Math.min(sliceH, img.naturalHeight - srcY);
          const sCtx = sc.getContext("2d")!;
          sCtx.drawImage(canvas, 0, srcY, img.naturalWidth, sc.height, 0, 0, img.naturalWidth, sc.height);
          const sliceUrl = sc.toDataURL("image/png");
          const sliceImgH = (sc.height / img.naturalHeight) * usedH;
          if (!firstPage) pdf.addPage();
          pdf.addImage(sliceUrl, "PNG", 0, 0, usedW, sliceImgH);
          srcY += sliceH;
          firstPage = false;
        }
      }
      pdf.save(`relatorio-nr17-${selectedDate || new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF exportado com sucesso");
    } catch {
      toast.error("Erro ao exportar PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="w-[99vw] max-w-[1600px] max-h-[96vh] overflow-y-auto bg-[#0f1117] border-border p-0 gap-0">
        {/* Toolbar */}
        <DialogHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between shrink-0 bg-[#0f1117]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">Relatório NR17 — Top 10 Abusadores</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">DDM Control Desk · {today}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleExportPNG} disabled={exporting || top10.length === 0} size="sm"
              variant="outline" className="gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
              <Download className="w-4 h-4" />
              {exporting ? "Gerando..." : "Exportar PNG"}
            </Button>
            <Button onClick={handleExportPDF} disabled={exporting || top10.length === 0} size="sm"
              className="gap-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold">
              <Download className="w-4 h-4" />
              {exporting ? "Gerando..." : "Exportar PDF"}
            </Button>
            <button onClick={onClose} className="ml-2 p-1.5 rounded hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </DialogHeader>

        {/* Área de scroll horizontal para canvas 1920px */}
        <div className="overflow-x-auto">
          {/* Canvas exportável — largura mínima 1920px para leitura em 1920×1080 */}
          <div
            ref={exportRef}
            style={{ minWidth: "1920px", backgroundColor: "#0f1117" }}
            className="p-10"
          >
            {/* Cabeçalho do relatório */}
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-amber-500/20">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                  <Shield className="w-8 h-8 text-amber-400" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white leading-tight">Relatório NR17 — Pausas Obrigatórias</h1>
                  <p className="text-sm text-white/45 mt-1">DDM Control Desk · {today} · Descanso 1/3: 10 min · Lanche: 20 min</p>
                </div>
              </div>
              <div className="flex gap-8">
                <div className="text-center">
                  <p className="text-5xl font-black text-amber-400">{totalEstouros}</p>
                  <p className="text-sm text-white/35 uppercase tracking-wider mt-1">Estouros</p>
                </div>
                <div className="text-center">
                  <p className="text-5xl font-black text-red-400">{totalAgentesAfetados}</p>
                  <p className="text-sm text-white/35 uppercase tracking-wider mt-1">Agentes</p>
                </div>
              </div>
            </div>

            {/* Aviso NR17 */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex gap-3 mb-8">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-base text-amber-200 leading-relaxed">
                <strong>Atenção:</strong> Pausas NR17 são obrigatórias por lei (NR-17 — Ergonomia). O monitoramento abaixo identifica agentes que excederam os limites permitidos.
                Qualquer segundo acima do limite já é registrado como estourado. Descanso 1 e 3: máximo 10 minutos. Lanche: máximo 20 minutos.
              </p>
            </div>

            {top10.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <CheckCircle2 className="w-16 h-16 text-emerald-400 opacity-60" />
                <p className="text-white/40 text-xl">Nenhum agente estourou pausas NR17 neste período</p>
              </div>
            ) : (
              <>
                {/* Top 10 ranking visual — 2 colunas */}
                <div className="mb-10">
                  <p className="text-sm font-semibold text-white/25 uppercase tracking-widest mb-5">
                    Top 10 — Maior Tempo Excedido Acumulado
                  </p>
                  <div className="grid grid-cols-2 gap-5">
                    {top10.map((agente, i) => {
                      const pct = Math.round((agente.totalExcedidoSeg / maxExcedido) * 100);
                      const isTop3 = i < 3;
                      const barColor = i === 0 ? "#ef4444" : i === 1 ? "#f97316" : i === 2 ? "#f59e0b" : "#6366f1";
                      const borderClass = isTop3 ? "border-red-500/25 bg-red-500/5" : "border-white/8 bg-white/2";
                      return (
                        <div key={agente.agente} className={`rounded-2xl p-5 border ${borderClass}`}>
                          <div className="flex items-start gap-4 mb-3">
                            <span className={`text-2xl font-black w-8 text-center shrink-0 mt-0.5 ${isTop3 ? "text-red-400" : "text-white/30"}`}>
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3 flex-wrap">
                                {/* Nome completo sem corte */}
                                <p className="text-xl font-bold text-white leading-snug break-words flex-1">{agente.agente}</p>
                                <div className="flex items-center gap-4 shrink-0">
                                  <span className="text-base text-white/40">{agente.ocorrencias}× pausas</span>
                                  <span className={`text-2xl font-black font-mono ${isTop3 ? "text-red-400" : "text-amber-400"}`}>
                                    +{secondsToHMS(agente.totalExcedidoSeg)}
                                  </span>
                                </div>
                              </div>
                              {/* Badges de motivo */}
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                {agente.motivos.map(m => {
                                  const cor = getNR17Color(m);
                                  return (
                                    <span key={m} className="text-sm px-3 py-1 rounded-lg font-semibold"
                                      style={{ backgroundColor: `${cor}25`, color: cor }}>
                                      {m} · lim. {getNR17Limite(m)}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          {/* Barra de progresso */}
                          <div className="ml-12">
                            <div className="h-2.5 rounded-full bg-white/8 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tabela detalhada — fonte maior e espaçamento generoso */}
                <div>
                  <p className="text-sm font-semibold text-white/25 uppercase tracking-widest mb-5">
                    Detalhamento por Agente e Tipo de Pausa
                  </p>
                  <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/8 bg-white/5">
                          <th className="px-5 py-4 text-left text-white/35 font-semibold uppercase tracking-wider text-xs">#</th>
                          <th className="px-5 py-4 text-left text-white/35 font-semibold uppercase tracking-wider text-xs">Agente</th>
                          <th className="px-5 py-4 text-left text-white/35 font-semibold uppercase tracking-wider text-xs">Tipo de Pausa</th>
                          <th className="px-5 py-4 text-center text-white/35 font-semibold uppercase tracking-wider text-xs">Limite</th>
                          <th className="px-5 py-4 text-right text-white/35 font-semibold uppercase tracking-wider text-xs">Tempo Usado</th>
                          <th className="px-5 py-4 text-right text-white/35 font-semibold uppercase tracking-wider text-xs">Nº Pausas</th>
                          <th className="px-5 py-4 text-right text-white/35 font-semibold uppercase tracking-wider text-xs">Excedeu</th>
                          <th className="px-5 py-4 text-center text-white/35 font-semibold uppercase tracking-wider text-xs">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nr17Abusadores.map((r, i) => {
                          const cor = getNR17Color(r.motivo);
                          const excMin = Math.floor(r.excedidoSegundos / 60);
                          const excSec = r.excedidoSegundos % 60;
                          return (
                            <tr key={`${r.agente}-${r.motivo}-${i}`} className="border-b border-white/5 hover:bg-white/3">
                              <td className="px-5 py-3.5 text-white/25 text-sm">{i + 1}</td>
                              <td className="px-5 py-3.5 font-semibold text-white text-sm">{r.agente}</td>
                              <td className="px-5 py-3.5">
                                <span className="px-3 py-1 rounded-lg text-sm font-semibold"
                                  style={{ backgroundColor: `${cor}20`, color: cor }}>
                                  {r.motivo}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-center text-white/40 font-mono text-sm">{getNR17Limite(r.motivo)}</td>
                              <td className="px-5 py-3.5 text-right font-mono font-semibold text-white text-sm">{secondsToHMSFull(r.totalSegundos)}</td>
                              <td className="px-5 py-3.5 text-right text-white/60 text-sm">{r.totalPausas}×</td>
                              <td className="px-5 py-3.5 text-right">
                                {r.excedeuLimite ? (
                                  <span className="font-mono font-bold text-red-400 text-sm">
                                    +{excMin > 0 ? `${excMin}min ` : ""}{excSec}s
                                  </span>
                                ) : (
                                  <span className="text-emerald-400 text-sm">OK</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                {r.excedeuLimite ? (
                                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-red-500/15 text-red-400">
                                    Estourou
                                  </span>
                                ) : (
                                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-400">
                                    OK
                                  </span>
                                )}
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
            <div className="mt-8 pt-5 border-t border-white/8 flex items-center justify-between">
              <p className="text-sm text-white/20">DDM Control Desk · Relatório NR17 — Pausas Obrigatórias</p>
              <p className="text-sm text-white/20 font-mono">{new Date().toLocaleString("pt-BR")}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
