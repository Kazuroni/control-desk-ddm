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
  BarChart3, AlertTriangle, Trophy
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
  variant: "orange" | "red" | "amber" | "blue" | "violet";
  icon: React.ReactNode;
  formatValue?: (v: number) => string;
}

const V = {
  orange: {
    border: "border-orange-500/30",
    header: "bg-orange-500/10",
    icon: "text-orange-400",
    badge: "bg-orange-500/15 text-orange-300",
    bar: "bg-orange-500",
    num1: "text-orange-300",
  },
  red: {
    border: "border-red-500/30",
    header: "bg-red-500/10",
    icon: "text-red-400",
    badge: "bg-red-500/15 text-red-300",
    bar: "bg-red-500",
    num1: "text-red-300",
  },
  amber: {
    border: "border-amber-500/30",
    header: "bg-amber-500/10",
    icon: "text-amber-400",
    badge: "bg-amber-500/15 text-amber-300",
    bar: "bg-amber-500",
    num1: "text-amber-300",
  },
  blue: {
    border: "border-blue-500/30",
    header: "bg-blue-500/10",
    icon: "text-blue-400",
    badge: "bg-blue-500/15 text-blue-300",
    bar: "bg-blue-500",
    num1: "text-blue-300",
  },
  violet: {
    border: "border-violet-500/30",
    header: "bg-violet-500/10",
    icon: "text-violet-400",
    badge: "bg-violet-500/15 text-violet-300",
    bar: "bg-violet-500",
    num1: "text-violet-300",
  },
};

function RankingCard({ title, subtitle, items, variant, icon, formatValue }: RankingCardProps) {
  const s = V[variant];
  const maxVal = Math.max(...items.map(i => i.valor), 1);

  return (
    <div className={`rounded-xl border ${s.border} overflow-hidden flex flex-col`}>
      <div className={`${s.header} px-4 py-3 flex items-center gap-2.5 shrink-0`}>
        <span className={s.icon}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white leading-tight">{title}</p>
          <p className="text-[11px] text-white/45 leading-tight mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2.5 bg-[#0f1117] flex-1">
        {items.length === 0 ? (
          <p className="text-xs text-white/25 text-center py-3">Sem dados disponíveis</p>
        ) : items.map((item, idx) => {
          const pct = Math.round((item.valor / maxVal) * 100);
          const display = formatValue ? formatValue(item.valor) : item.valor.toLocaleString("pt-BR");
          return (
            <div key={idx} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold w-4 text-right shrink-0 ${idx === 0 ? s.num1 : "text-white/35"}`}>
                  {idx + 1}
                </span>
                <span className="text-[11px] text-white/75 truncate font-medium flex-1 min-w-0">{item.agente}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${s.badge}`}>
                    {item.detalhe}
                  </span>
                  <span className="text-xs font-bold text-white tabular-nums">{display}</span>
                </div>
              </div>
              <div className="h-[3px] bg-white/5 rounded-full overflow-hidden ml-6">
                <div className={`h-full ${s.bar} rounded-full`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
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

  const { data, isLoading, isError } = trpc.dashboard.getExecutiveReport.useQuery(
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
      toast.success("Relatório exportado!");
    } catch {
      toast.error("Erro ao exportar. Tente novamente.");
    } finally {
      setExporting(false);
    }
  };

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[92vh] overflow-y-auto p-0 gap-0 bg-[#0f1117] border-border">
        {/* Toolbar */}
        <DialogHeader className="flex flex-row items-center justify-between px-5 py-3.5 border-b border-border shrink-0 bg-[#0f1117]">
          <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            Relatório Executivo Consolidado
          </DialogTitle>
          <Button
            onClick={handleExport}
            disabled={isLoading || exporting || isError}
            size="sm"
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? "Gerando..." : "Exportar PNG"}
          </Button>
        </DialogHeader>

        {/* Exportable content */}
        <div ref={exportRef} className="bg-[#0f1117] p-5">
          {/* Header do relatório */}
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <img
                src="/manus-storage/ddm-logo_7a072db6.png"
                alt="DDM"
                className="w-10 h-10 rounded-lg object-cover"
              />
              <div>
                <h1 className="text-base font-bold text-white leading-tight">DDM Control Desk</h1>
                <p className="text-xs text-white/40">Relatório Executivo · Call Center Analytics</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/30 uppercase tracking-wider">Referência</p>
              <p className="text-xs font-semibold text-white/60 mt-0.5 capitalize">{today}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl bg-white/5" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-16 text-white/30 text-sm">
              Erro ao carregar dados. Verifique se os relatórios foram importados.
            </div>
          ) : (
            <>
              {/* Seção 1: Performance (2 colunas) */}
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">
                  ① Performance em Tempo Real — Chamadas Atendidas
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <RankingCard
                    title="🏆 Top 5 Melhores Agentes"
                    subtitle="Maior volume de chamadas atendidas no período"
                    items={data?.top5Chamadas ?? []}
                    variant="orange"
                    icon={<TrendingUp className="w-4 h-4" />}
                    formatValue={v => `${v.toLocaleString("pt-BR")} ch.`}
                  />
                  <RankingCard
                    title="⚠️ Top 5 Menor Produção"
                    subtitle="Menor volume — requer atenção do supervisor"
                    items={data?.bottom5Chamadas ?? []}
                    variant="red"
                    icon={<TrendingDown className="w-4 h-4" />}
                    formatValue={v => `${v.toLocaleString("pt-BR")} ch.`}
                  />
                </div>
              </div>

              {/* Seção 2: Pausas + Campanhas + Tabulações (3 colunas responsivas) */}
              <div>
                <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">
                  ② Pausas Improdutivas · ③ Campanhas · ④ Tabulações Excedidas
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <RankingCard
                    title="⏸ Top 5 Pausas Improdutivas"
                    subtitle="Maior tempo acumulado em pausas não produtivas"
                    items={data?.top5Pausas ?? []}
                    variant="amber"
                    icon={<PauseCircle className="w-4 h-4" />}
                    formatValue={v => {
                      const h = Math.floor(v / 3600);
                      const m = Math.floor((v % 3600) / 60);
                      return h > 0 ? `${h}h ${m}min` : `${m} min`;
                    }}
                  />
                  <RankingCard
                    title="📊 Top 5 Campanhas"
                    subtitle="Maior volume de chamadas realizadas"
                    items={data?.top5Campanhas ?? []}
                    variant="blue"
                    icon={<BarChart3 className="w-4 h-4" />}
                    formatValue={v => `${v.toLocaleString("pt-BR")} ch.`}
                  />
                  <RankingCard
                    title="🚨 Top 5 Tabulações Excedidas"
                    subtitle="Maior número de ocorrências de tempo excedido"
                    items={data?.top5Tabulacoes ?? []}
                    variant="violet"
                    icon={<AlertTriangle className="w-4 h-4" />}
                    formatValue={v => `${v} ocorr.`}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="mt-5 pt-4 border-t border-white/8 flex items-center justify-between">
                <p className="text-[10px] text-white/20">DDM Control Desk · Dashboard Analítico de Call Center</p>
                <p className="text-[10px] text-white/20 font-mono">{new Date().toLocaleString("pt-BR")}</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
