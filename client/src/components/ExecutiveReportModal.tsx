import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download, TrendingUp, TrendingDown, PauseCircle,
  BarChart3, AlertTriangle, Trophy, X
} from "lucide-react";

interface ReportItem {
  agente: string;
  valor: number;
  detalhe: string;
}

interface RankingCardProps {
  title: string;
  subtitle: string;
  items: ReportItem[];
  variant: "success" | "danger" | "warning" | "info" | "purple";
  icon: React.ReactNode;
  unit?: string;
  formatValue?: (v: number) => string;
}

const VARIANT_STYLES = {
  success: {
    border: "border-emerald-500/30",
    header: "bg-emerald-500/10",
    icon: "text-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-300",
    bar: "bg-emerald-500",
    rank1: "text-emerald-300",
  },
  danger: {
    border: "border-red-500/30",
    header: "bg-red-500/10",
    icon: "text-red-400",
    badge: "bg-red-500/20 text-red-300",
    bar: "bg-red-500",
    rank1: "text-red-300",
  },
  warning: {
    border: "border-amber-500/30",
    header: "bg-amber-500/10",
    icon: "text-amber-400",
    badge: "bg-amber-500/20 text-amber-300",
    bar: "bg-amber-500",
    rank1: "text-amber-300",
  },
  info: {
    border: "border-blue-500/30",
    header: "bg-blue-500/10",
    icon: "text-blue-400",
    badge: "bg-blue-500/20 text-blue-300",
    bar: "bg-blue-500",
    rank1: "text-blue-300",
  },
  purple: {
    border: "border-violet-500/30",
    header: "bg-violet-500/10",
    icon: "text-violet-400",
    badge: "bg-violet-500/20 text-violet-300",
    bar: "bg-violet-500",
    rank1: "text-violet-300",
  },
};

function RankingCard({ title, subtitle, items, variant, icon, unit = "", formatValue }: RankingCardProps) {
  const s = VARIANT_STYLES[variant];
  const maxVal = Math.max(...items.map(i => i.valor), 1);

  return (
    <div className={`rounded-xl border ${s.border} overflow-hidden`}>
      {/* Header */}
      <div className={`${s.header} px-4 py-3 flex items-center gap-2.5`}>
        <span className={s.icon}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white leading-tight">{title}</p>
          <p className="text-[11px] text-white/50 leading-tight mt-0.5">{subtitle}</p>
        </div>
      </div>

      {/* Rows */}
      <div className="px-4 py-3 space-y-2.5 bg-[#0f1117]">
        {items.length === 0 ? (
          <p className="text-xs text-white/30 text-center py-2">Sem dados</p>
        ) : (
          items.map((item, idx) => {
            const pct = Math.round((item.valor / maxVal) * 100);
            const displayVal = formatValue ? formatValue(item.valor) : `${item.valor.toLocaleString("pt-BR")}${unit ? ` ${unit}` : ""}`;
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`text-[11px] font-bold w-5 text-right shrink-0 ${idx === 0 ? s.rank1 : "text-white/40"}`}>
                      {idx + 1}
                    </span>
                    <span className="text-xs text-white/80 truncate font-medium">{item.agente}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${s.badge}`}>
                      {item.detalhe}
                    </span>
                    <span className="text-xs font-bold text-white w-16 text-right">{displayVal}</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1 bg-white/5 rounded-full overflow-hidden ml-7">
                  <div
                    className={`h-full ${s.bar} rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ExecutiveReportModal({ open, onClose }: Props) {
  const { filters } = useDashboard();
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = trpc.dashboard.getExecutiveReport.useQuery(
    { sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined },
    { enabled: open }
  );

  const handleExport = async () => {
    if (!exportRef.current) { toast.error("Nada para exportar"); return; }
    setExporting(true);
    toast.info("Gerando relatório executivo...");
    try {
      const url = await toPng(exportRef.current, {
        backgroundColor: "#0f1117",
        pixelRatio: 2,
        skipFonts: true,
        cacheBust: true,
        style: { borderRadius: "0" },
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-executivo-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("Relatório exportado com sucesso!");
    } catch {
      toast.error("Erro ao exportar relatório");
    } finally {
      setExporting(false);
    }
  };

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl w-full max-h-[90vh] overflow-y-auto p-0 gap-0 bg-[#0f1117] border-border">
        {/* Dialog header (outside export area) */}
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Relatório Executivo Consolidado
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExport}
              disabled={isLoading || exporting}
              size="sm"
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Gerando..." : "Exportar PNG"}
            </Button>
          </div>
        </DialogHeader>

        {/* Exportable area */}
        <div ref={exportRef} className="bg-[#0f1117] p-6">
          {/* Report header */}
          <div className="flex items-start justify-between mb-6 pb-5 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white leading-tight">Relatório Executivo</h1>
                  <p className="text-xs text-white/40 leading-tight">Call Center · Dashboard Analítico</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/30 uppercase tracking-wider font-medium">Data de referência</p>
              <p className="text-sm font-semibold text-white/70 mt-0.5">{today}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl bg-white/5" />
              ))}
            </div>
          ) : (
            <>
              {/* Section label */}
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">
                  Faixa 1 — Performance em Tempo Real
                </p>
              </div>

              {/* Row 1: Faixa 1 */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <RankingCard
                  title="Top 5 Melhores Agentes"
                  subtitle="Maior volume de chamadas atendidas"
                  items={data?.top5Chamadas ?? []}
                  variant="success"
                  icon={<TrendingUp className="w-4 h-4" />}
                  unit="chamadas"
                />
                <RankingCard
                  title="Top 5 Agentes com Menor Volume"
                  subtitle="Menor volume de chamadas atendidas"
                  items={data?.bottom5Chamadas ?? []}
                  variant="danger"
                  icon={<TrendingDown className="w-4 h-4" />}
                  unit="chamadas"
                />
              </div>

              {/* Section label */}
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">
                  Faixas 2, 3 e 4 — Pausas · Campanhas · Tabulações
                </p>
              </div>

              {/* Row 2: Faixas 2, 3, 4 */}
              <div className="grid grid-cols-3 gap-4">
                <RankingCard
                  title="Top 5 Pausas Improdutivas"
                  subtitle="Maior tempo em pausas improdutivas"
                  items={data?.top5Pausas ?? []}
                  variant="warning"
                  icon={<PauseCircle className="w-4 h-4" />}
                  formatValue={(v) => {
                    const h = Math.floor(v / 3600);
                    const m = Math.floor((v % 3600) / 60);
                    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                  }}
                />
                <RankingCard
                  title="Top 5 Campanhas"
                  subtitle="Maior volume de chamadas realizadas"
                  items={data?.top5Campanhas ?? []}
                  variant="info"
                  icon={<BarChart3 className="w-4 h-4" />}
                  unit="chamadas"
                />
                <RankingCard
                  title="Top 5 Tabulações Excedidas"
                  subtitle="Maior número de ocorrências"
                  items={data?.top5Tabulacoes ?? []}
                  variant="purple"
                  icon={<AlertTriangle className="w-4 h-4" />}
                  unit="ocorrências"
                />
              </div>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                <p className="text-[10px] text-white/20">
                  Gerado automaticamente pelo Dashboard de Call Center
                </p>
                <p className="text-[10px] text-white/20 font-mono">
                  {new Date().toLocaleString("pt-BR")}
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
