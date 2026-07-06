import { useState, useRef, useMemo } from "react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileImage, FileText, Loader2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface NR17Entry {
  agente: string;
  motivo: string;
  totalSegundos: number;
  totalPausas: number;
  limiteSegundos: number;
  excedeuLimite: boolean;
  excedidoSegundos: number;
  turno?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  nr17Abusadores: NR17Entry[];
  referenceDate?: string;
}

function fmtTime(s: number): string {
  if (s <= 0) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtMotivo(motivo: string): string {
  const m = motivo.toLowerCase();
  if (m.includes("descanso 1") || m.includes("pausa descanso 1")) return "Descanso 1";
  if (m.includes("descanso 2") || m.includes("pausa descanso 2")) return "Descanso 2";
  if (m.includes("descanso 3") || m.includes("pausa descanso 3")) return "Descanso 3";
  if (m.includes("lanche") || m.includes("pausa lanche")) return "Lanche";
  return motivo;
}

type SortKey = "agente" | "excedidoSegundos" | "totalSegundos" | "totalPausas" | "motivo";
type SortDir = "asc" | "desc";

export function NR17ReportModal({ open, onClose, nr17Abusadores, referenceDate }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [turnoFilter, setTurnoFilter] = useState<string>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("excedidoSegundos");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Turnos disponíveis nos dados
  const turnosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    nr17Abusadores.forEach(r => { if (r.turno) set.add(r.turno); });
    return Array.from(set).sort();
  }, [nr17Abusadores]);

  // Agrupa por agente: soma excedido acumulado e lista pausas estouradas
  const byAgente = useMemo(() => {
    const map: Record<string, {
      agente: string; turno: string;
      excedidoSegundos: number; totalSegundos: number; totalPausas: number;
      pausasEstouradas: string[];
    }> = {};
    for (const r of nr17Abusadores) {
      if (!r.excedeuLimite) continue;
      if (turnoFilter !== "todos" && r.turno !== turnoFilter) continue;
      if (!map[r.agente]) {
        map[r.agente] = { agente: r.agente, turno: r.turno || "", excedidoSegundos: 0, totalSegundos: 0, totalPausas: 0, pausasEstouradas: [] };
      }
      map[r.agente].excedidoSegundos += r.excedidoSegundos;
      map[r.agente].totalSegundos += r.totalSegundos;
      map[r.agente].totalPausas += r.totalPausas;
      const label = `${fmtMotivo(r.motivo)} +${fmtTime(r.excedidoSegundos)}`;
      if (!map[r.agente].pausasEstouradas.includes(label)) {
        map[r.agente].pausasEstouradas.push(label);
      }
    }
    return Object.values(map);
  }, [nr17Abusadores, turnoFilter]);

  // Ordenação
  const sorted = useMemo(() => {
    return [...byAgente].sort((a, b) => {
      let va: string | number = 0;
      let vb: string | number = 0;
      if (sortKey === "agente") { va = a.agente; vb = b.agente; }
      else if (sortKey === "excedidoSegundos") { va = a.excedidoSegundos; vb = b.excedidoSegundos; }
      else if (sortKey === "totalSegundos") { va = a.totalSegundos; vb = b.totalSegundos; }
      else if (sortKey === "totalPausas") { va = a.totalPausas; vb = b.totalPausas; }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [byAgente, sortKey, sortDir]);

  const top10 = sorted.slice(0, 10);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "desc" ? <ChevronDown className="w-3 h-3 text-orange-400" /> : <ChevronUp className="w-3 h-3 text-orange-400" />;
  }

  async function handleExportPNG() {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(reportRef.current, { cacheBust: true, skipFonts: true, pixelRatio: 2, backgroundColor: "#0f1117" });
      const a = document.createElement("a");
      a.download = `nr17-ofensores-${referenceDate || "hoje"}.png`;
      a.href = dataUrl;
      a.click();
    } finally { setExporting(false); }
  }

  async function handleExportPDF() {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(reportRef.current, { cacheBust: true, skipFonts: true, pixelRatio: 2, backgroundColor: "#0f1117" });
      const img = new Image();
      img.src = dataUrl;
      await new Promise(r => { img.onload = r; });
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [img.width / 2, img.height / 2] });
      pdf.addImage(dataUrl, "PNG", 0, 0, img.width / 2, img.height / 2);
      pdf.save(`nr17-ofensores-${referenceDate || "hoje"}.pdf`);
    } finally { setExporting(false); }
  }

  const turnoLabel = turnoFilter === "todos" ? "Todos os turnos" : turnoFilter;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1400px] max-h-[90vh] overflow-y-auto bg-[#0f1117] border-orange-500/30 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <DialogTitle className="text-white text-xl font-bold">
              Relatório NR17 — Top 10 Ofensores
              {referenceDate && <span className="ml-3 text-sm text-white/50 font-normal">{referenceDate}</span>}
            </DialogTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Filtro de turno */}
              <Select value={turnoFilter} onValueChange={setTurnoFilter}>
                <SelectTrigger className="w-44 bg-white/5 border-white/20 text-white text-sm h-8">
                  <SelectValue placeholder="Turno" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-white/20">
                  <SelectItem value="todos">Todos os turnos</SelectItem>
                  {turnosDisponiveis.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                  {turnosDisponiveis.length === 0 && (
                    <SelectItem value="__sem_turno__" disabled>Sem dados de turno</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleExportPNG} disabled={exporting}
                className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10 h-8 text-xs">
                {exporting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <FileImage className="w-3 h-3 mr-1" />}
                PNG
              </Button>
              <Button size="sm" onClick={handleExportPDF} disabled={exporting}
                className="bg-orange-500 hover:bg-orange-600 text-white h-8 text-xs">
                {exporting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
                PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Conteúdo exportável */}
        <div ref={reportRef} style={{ backgroundColor: "#0f1117", minWidth: 1200 }} className="p-8">
          {/* Cabeçalho do relatório */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-orange-500/30">
            <div>
              <div className="text-3xl font-black text-white tracking-tight">DDM Control Desk</div>
              <div className="text-orange-400 text-lg font-semibold mt-1">Relatório NR17 — Top 10 Ofensores de Pausa</div>
            </div>
            <div className="text-right">
              {referenceDate && <div className="text-white/60 text-base">Data: <span className="text-white font-semibold">{referenceDate}</span></div>}
              <div className="text-white/60 text-base mt-1">Turno: <span className="text-white font-semibold">{turnoLabel}</span></div>
              <div className="text-white/60 text-sm mt-1">{top10.length} ofensores exibidos</div>
            </div>
          </div>

          {top10.length === 0 ? (
            <div className="text-center py-20 text-white/40 text-xl">
              Nenhum ofensor encontrado para o filtro selecionado.
            </div>
          ) : (
            <>
              {/* Cards top 10 em 2 colunas */}
              <div className="grid grid-cols-2 gap-5 mb-10">
                {top10.map((item, i) => (
                  <div key={item.agente} className="flex items-start gap-4 bg-white/5 rounded-xl p-5 border border-white/10">
                    {/* Posição */}
                    <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-xl font-black
                      ${i === 0 ? "bg-red-500/20 text-red-400 border border-red-500/40" :
                        i === 1 ? "bg-orange-500/20 text-orange-400 border border-orange-500/40" :
                        i === 2 ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40" :
                        "bg-white/5 text-white/50 border border-white/10"}`}>
                      {i + 1}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-bold text-lg leading-tight">{item.agente}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {item.turno && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">{item.turno}</span>
                        )}
                        <span className="text-red-400 font-bold text-base">+{fmtTime(item.excedidoSegundos)} excedido</span>
                      </div>
                      {/* Pausas estouradas de forma resumida */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.pausasEstouradas.map((p, pi) => (
                          <span key={pi} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 border border-red-500/20">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* Tempo total */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-white/50 text-xs">Total em pausa</div>
                      <div className="text-white font-semibold text-base">{fmtTime(item.totalSegundos)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tabela com ordenação */}
              <div className="rounded-xl overflow-hidden border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-orange-500/10 border-b border-orange-500/20">
                      <th className="text-left px-4 py-3 text-white/60 font-semibold w-8">#</th>
                      <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("agente")}>
                        <span className="flex items-center gap-1 text-white/80 font-semibold">Operador <SortIcon k="agente" /></span>
                      </th>
                      <th className="text-center px-4 py-3 text-white/60 font-semibold">Turno</th>
                      <th className="text-center px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("excedidoSegundos")}>
                        <span className="flex items-center justify-center gap-1 text-white/80 font-semibold">Tempo Excedido <SortIcon k="excedidoSegundos" /></span>
                      </th>
                      <th className="text-center px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("totalSegundos")}>
                        <span className="flex items-center justify-center gap-1 text-white/80 font-semibold">Total em Pausa <SortIcon k="totalSegundos" /></span>
                      </th>
                      <th className="text-center px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("totalPausas")}>
                        <span className="flex items-center justify-center gap-1 text-white/80 font-semibold">Ocorrências <SortIcon k="totalPausas" /></span>
                      </th>
                      <th className="text-left px-4 py-3 text-white/60 font-semibold">Pausas Estouradas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top10.map((item, i) => (
                      <tr key={item.agente} className={`border-b border-white/5 ${i % 2 === 0 ? "bg-white/2" : ""} hover:bg-white/5`}>
                        <td className="px-4 py-3 text-white/40 text-sm">{i + 1}</td>
                        <td className="px-4 py-3 text-white font-medium text-base">{item.agente}</td>
                        <td className="px-4 py-3 text-center">
                          {item.turno ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">{item.turno}</span>
                          ) : <span className="text-white/30">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-red-400 font-bold text-base">+{fmtTime(item.excedidoSegundos)}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-white/80 text-base">{fmtTime(item.totalSegundos)}</td>
                        <td className="px-4 py-3 text-center text-white/80 text-base">{item.totalPausas}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {item.pausasEstouradas.map((p, pi) => (
                              <Badge key={pi} variant="outline" className="text-xs border-red-500/30 text-red-300 bg-red-500/5">
                                {p}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Rodapé */}
              <div className="mt-6 pt-4 border-t border-white/10 flex justify-between text-xs text-white/30">
                <span>DDM Control Desk — Relatório NR17</span>
                <span>Gerado em {new Date().toLocaleString("pt-BR")}</span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
