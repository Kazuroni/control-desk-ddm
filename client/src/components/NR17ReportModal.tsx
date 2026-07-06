import { useState, useRef, useMemo } from "react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileImage, FileText, Loader2, ChevronUp, ChevronDown, ChevronsUpDown, Sun, Sunset } from "lucide-react";

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

type SortKey = "agente" | "excedidoSegundos" | "totalSegundos" | "totalPausas";
type SortDir = "asc" | "desc";

// ─── Seção de turno ──────────────────────────────────────────────────────────
function TurnoSection({
  turno, items, sortKey, sortDir, onSort,
}: {
  turno: string;
  items: Array<{
    agente: string; turno: string;
    excedidoSegundos: number; totalSegundos: number; totalPausas: number;
    pausasEstouradas: string[];
  }>;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const isManha = turno.toLowerCase().includes("manh");
  const accentColor = isManha ? "text-amber-400" : "text-blue-400";
  const accentBg = isManha ? "bg-amber-500/10 border-amber-500/30" : "bg-blue-500/10 border-blue-500/30";
  const accentBadge = isManha ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30";
  const barColor = isManha ? "bg-amber-500" : "bg-blue-500";
  const Icon = isManha ? Sun : Sunset;

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "desc"
      ? <ChevronDown className="w-3 h-3 text-orange-400" />
      : <ChevronUp className="w-3 h-3 text-orange-400" />;
  }

  const maxExcedido = Math.max(...items.map(i => i.excedidoSegundos), 1);

  return (
    <div className="mb-10">
      {/* Cabeçalho do turno */}
      <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border mb-5 ${accentBg}`}>
        <Icon className={`w-5 h-5 ${accentColor}`} />
        <div className="flex-1">
          <span className={`text-lg font-bold ${accentColor}`}>Turno {turno}</span>
          <span className="text-white/40 text-sm ml-3">{items.length} ofensor{items.length !== 1 ? "es" : ""}</span>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${accentBadge}`}>
          Top {Math.min(items.length, 10)}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-white/30 py-8 text-base">Nenhum ofensor neste turno.</p>
      ) : (
        <>
          {/* Cards visuais — 2 colunas */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {items.slice(0, 10).map((item, i) => {
              const pct = Math.round((item.excedidoSegundos / maxExcedido) * 100);
              return (
                <div key={item.agente} className="flex items-start gap-4 bg-white/4 rounded-xl p-4 border border-white/8">
                  {/* Posição */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-base font-black
                    ${i === 0 ? "bg-red-500/20 text-red-400 border border-red-500/40" :
                      i === 1 ? "bg-orange-500/20 text-orange-400 border border-orange-500/40" :
                      i === 2 ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40" :
                      "bg-white/5 text-white/40 border border-white/10"}`}>
                    {i + 1}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-base leading-tight">{item.agente}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-red-400 font-semibold text-sm">+{fmtTime(item.excedidoSegundos)} excedido</span>
                    </div>
                    {/* Barra de progresso */}
                    <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                    {/* Pausas estouradas */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.pausasEstouradas.map((p, pi) => (
                        <span key={pi} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 border border-red-500/20">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Total em pausa */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-white/40 text-[10px]">Total pausa</div>
                    <div className="text-white font-semibold text-sm">{fmtTime(item.totalSegundos)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabela detalhada */}
          <div className="rounded-xl overflow-hidden border border-white/8">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isManha ? "bg-amber-500/8 border-amber-500/20" : "bg-blue-500/8 border-blue-500/20"}`}>
                  <th className="text-left px-4 py-3 text-white/50 font-semibold w-8">#</th>
                  <th
                    className="text-left px-4 py-3 cursor-pointer select-none"
                    onClick={() => onSort("agente")}
                  >
                    <span className="flex items-center gap-1 text-white/70 font-semibold">
                      Operador <SortIcon k="agente" />
                    </span>
                  </th>
                  <th
                    className="text-center px-4 py-3 cursor-pointer select-none"
                    onClick={() => onSort("excedidoSegundos")}
                  >
                    <span className={`flex items-center justify-center gap-1 font-semibold ${accentColor}`}>
                      Tempo Excedido <SortIcon k="excedidoSegundos" />
                    </span>
                  </th>
                  <th
                    className="text-center px-4 py-3 cursor-pointer select-none"
                    onClick={() => onSort("totalSegundos")}
                  >
                    <span className="flex items-center justify-center gap-1 text-white/70 font-semibold">
                      Total em Pausa <SortIcon k="totalSegundos" />
                    </span>
                  </th>
                  <th
                    className="text-center px-4 py-3 cursor-pointer select-none"
                    onClick={() => onSort("totalPausas")}
                  >
                    <span className="flex items-center justify-center gap-1 text-white/70 font-semibold">
                      Ocorrências <SortIcon k="totalPausas" />
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 text-white/50 font-semibold">Pausas Estouradas</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 10).map((item, i) => (
                  <tr key={item.agente} className={`border-b border-white/5 ${i % 2 === 0 ? "" : "bg-white/2"} hover:bg-white/5`}>
                    <td className="px-4 py-3 text-white/30 text-sm">{i + 1}</td>
                    <td className="px-4 py-3 text-white font-medium text-base">{item.agente}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-red-400 font-bold text-base">+{fmtTime(item.excedidoSegundos)}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-white/70 text-base">{fmtTime(item.totalSegundos)}</td>
                    <td className="px-4 py-3 text-center text-white/70 text-base">{item.totalPausas}</td>
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
        </>
      )}
    </div>
  );
}

// ─── Modal principal ──────────────────────────────────────────────────────────
export function NR17ReportModal({ open, onClose, nr17Abusadores, referenceDate }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("excedidoSegundos");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  // Agrupa por agente (apenas quem excedeu)
  const byAgente = useMemo(() => {
    const map: Record<string, {
      agente: string; turno: string;
      excedidoSegundos: number; totalSegundos: number; totalPausas: number;
      pausasEstouradas: string[];
    }> = {};
    for (const r of nr17Abusadores) {
      if (!r.excedeuLimite) continue;
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
  }, [nr17Abusadores]);

  // Ordena globalmente
  const sorted = useMemo(() => {
    return [...byAgente].sort((a, b) => {
      if (sortKey === "agente") {
        return sortDir === "asc" ? a.agente.localeCompare(b.agente) : b.agente.localeCompare(a.agente);
      }
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [byAgente, sortKey, sortDir]);

  // Separação por turno
  const turnosManha = useMemo(() => sorted.filter(r => r.turno?.toLowerCase().includes("manh")), [sorted]);
  const turnosTarde = useMemo(() => sorted.filter(r => r.turno?.toLowerCase().includes("tarde")), [sorted]);
  const turnosIntegral = useMemo(() => sorted.filter(r => r.turno?.toLowerCase().includes("integral")), [sorted]);
  const turnosSemInfo = useMemo(() => sorted.filter(r => !r.turno || (!r.turno.toLowerCase().includes("manh") && !r.turno.toLowerCase().includes("tarde") && !r.turno.toLowerCase().includes("integral"))), [sorted]);

  const totalOfensores = sorted.length;

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

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      {/* Tela cheia — ocupa toda a viewport */}
      <DialogContent className="!max-w-none !w-screen !h-screen !max-h-screen !rounded-none overflow-y-auto bg-[#0f1117] border-0 p-0 flex flex-col">
        {/* Toolbar */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <DialogTitle className="text-white text-xl font-bold">
              Relatório NR17 — Ofensores por Turno
              {referenceDate && <span className="ml-3 text-sm text-white/50 font-normal">{referenceDate}</span>}
              <span className="ml-3 text-sm text-white/40 font-normal">{totalOfensores} ofensores no total</span>
            </DialogTitle>
            <div className="flex items-center gap-2 flex-wrap">
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
        <div ref={reportRef} style={{ backgroundColor: "#0f1117", minWidth: 1200 }} className="p-8 flex-1 overflow-y-auto">
          {/* Cabeçalho do relatório */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-orange-500/30">
            <div>
              <div className="text-3xl font-black text-white tracking-tight">DDM Control Desk</div>
              <div className="text-orange-400 text-lg font-semibold mt-1">Relatório NR17 — Ofensores de Pausa por Turno</div>
            </div>
            <div className="text-right">
              {referenceDate && <div className="text-white/60 text-base">Data: <span className="text-white font-semibold">{referenceDate}</span></div>}
              <div className="text-white/60 text-sm mt-1">{totalOfensores} ofensores · Top 10 por turno</div>
            </div>
          </div>

          {totalOfensores === 0 ? (
            <div className="text-center py-20 text-white/40 text-xl">
              Nenhum ofensor NR17 encontrado para este período.
            </div>
          ) : (
            <>
              {/* Turno Manhã */}
              {turnosManha.length > 0 && (
                <TurnoSection
                  turno="Manhã"
                  items={turnosManha}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              )}

              {/* Turno Tarde */}
              {turnosTarde.length > 0 && (
                <TurnoSection
                  turno="Tarde"
                  items={turnosTarde}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              )}

              {/* Turno Integral */}
              {turnosIntegral.length > 0 && (
                <TurnoSection
                  turno="Integral"
                  items={turnosIntegral}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              )}

              {/* Sem turno definido */}
              {turnosSemInfo.length > 0 && (
                <TurnoSection
                  turno="Não informado"
                  items={turnosSemInfo}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              )}

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
