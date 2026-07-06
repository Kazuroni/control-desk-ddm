import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download, TrendingUp, TrendingDown, PauseCircle,
  BarChart3, AlertTriangle, Trophy, Target, Handshake, Phone
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calcQuartiles(values: number[]): { q1: number; q2: number; q3: number } {
  if (values.length === 0) return { q1: 0, q2: 0, q3: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const q2 = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  const lower = sorted.slice(0, mid);
  const upper = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  const q1 = lower.length > 0 ? lower[Math.floor(lower.length / 2)] : sorted[0];
  const q3 = upper.length > 0 ? upper[Math.floor(upper.length / 2)] : sorted[sorted.length - 1];
  return { q1, q2, q3 };
}

function getQuartilLabel(val: number, q1: number, q2: number, q3: number): { label: string; color: string; bg: string; border: string } {
  if (val >= q3) return { label: "Q1", color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30" };
  if (val >= q2) return { label: "Q2", color: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/30" };
  if (val >= q1) return { label: "Q3", color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/30" };
  return { label: "Q4", color: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/30" };
}

// ─── Componentes visuais ──────────────────────────────────────────────────────
interface ReportItem {
  agente: string;
  valor: number;
  detalhe: string;
}

const VARIANTS = {
  orange: { border: "border-orange-500/30", header: "bg-orange-500/10", icon: "text-orange-400", badge: "bg-orange-500/15 text-orange-300", bar: "bg-orange-500", num1: "text-orange-300" },
  red:    { border: "border-red-500/30",    header: "bg-red-500/10",    icon: "text-red-400",    badge: "bg-red-500/15 text-red-300",    bar: "bg-red-500",    num1: "text-red-300" },
  amber:  { border: "border-amber-500/30",  header: "bg-amber-500/10",  icon: "text-amber-400",  badge: "bg-amber-500/15 text-amber-300",  bar: "bg-amber-500",  num1: "text-amber-300" },
  blue:   { border: "border-blue-500/30",   header: "bg-blue-500/10",   icon: "text-blue-400",   badge: "bg-blue-500/15 text-blue-300",   bar: "bg-blue-500",   num1: "text-blue-300" },
  violet: { border: "border-violet-500/30", header: "bg-violet-500/10", icon: "text-violet-400", badge: "bg-violet-500/15 text-violet-300", bar: "bg-violet-500", num1: "text-violet-300" },
  emerald:{ border: "border-emerald-500/30",header: "bg-emerald-500/10",icon: "text-emerald-400",badge: "bg-emerald-500/15 text-emerald-300",bar: "bg-emerald-500",num1: "text-emerald-300" },
};

function RankingCard({
  title, subtitle, items, variant, icon, formatValue,
}: {
  title: string; subtitle: string; items: ReportItem[];
  variant: keyof typeof VARIANTS; icon: React.ReactNode;
  formatValue?: (v: number) => string;
}) {
  const s = VARIANTS[variant];
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
      <div className="px-4 py-3 space-y-3 bg-[#0f1117] flex-1">
        {items.length === 0 ? (
          <p className="text-xs text-white/25 text-center py-3">Sem dados disponíveis</p>
        ) : items.map((item, idx) => {
          const pct = Math.round((item.valor / maxVal) * 100);
          const display = formatValue ? formatValue(item.valor) : item.valor.toLocaleString("pt-BR");
          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className={`text-xs font-bold w-5 text-right shrink-0 mt-0.5 ${idx === 0 ? s.num1 : "text-white/35"}`}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-semibold leading-snug">{item.agente}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium leading-snug ${s.badge}`} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                      {item.detalhe}
                    </span>
                    <span className="text-sm font-bold text-white tabular-nums">{display}</span>
                  </div>
                </div>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden ml-7">
                <div className={`h-full ${s.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Quartil visual card
function QuartilCard({
  label, count, avg, metric, color, bg, border,
}: {
  label: string; count: number; avg: number; metric: string;
  color: string; bg: string; border: string;
}) {
  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className={`text-lg font-black ${color}`}>{label}</span>
        <span className="text-xs text-white/40">{count} agentes</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-white tabular-nums">{avg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</p>
        <p className="text-[11px] text-white/40 mt-0.5">Média {metric}</p>
      </div>
    </div>
  );
}

// ─── Exportable section wrapper ───────────────────────────────────────────────
function ExportSection({ exportRef, children, today }: {
  exportRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
  today: string;
}) {
  return (
    <div ref={exportRef} className="bg-[#0f1117] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img src="/manus-storage/ddm-logo_7a072db6.png" alt="DDM" className="w-11 h-11 rounded-lg object-cover" />
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">DDM Control Desk</h1>
            <p className="text-xs text-white/40">Relatório Executivo · Call Center Analytics</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Referência</p>
          <p className="text-sm font-semibold text-white/60 mt-0.5 capitalize">{today}</p>
        </div>
      </div>
      {children}
      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-white/8 flex items-center justify-between">
        <p className="text-[10px] text-white/20">DDM Control Desk · Dashboard Analítico de Call Center</p>
        <p className="text-[10px] text-white/20 font-mono">{new Date().toLocaleString("pt-BR")}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props { open: boolean; onClose: () => void; }

export default function ExecutiveReportModal({ open, onClose }: Props) {
  const { filters } = useDashboard();
  const exportRefConsolidado = useRef<HTMLDivElement>(null);
  const exportRefCPC = useRef<HTMLDivElement>(null);
  const exportRefAcordo = useRef<HTMLDivElement>(null);
  const exportRefAtendida = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError } = trpc.dashboard.getExecutiveReport.useQuery(
    { sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined },
    { enabled: open }
  );

  const { data: agentRows = [] } = trpc.dashboard.getAgentDay.useQuery(
    { sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined },
    { enabled: open }
  );

  // Filtra bots
  const humanRows = agentRows.filter(r => r.login && r.login.trim() !== "");

  // Quartis CPC
  const quartilCPC = (() => {
    const vals = humanRows.map(r => r.contatoEfetivo ?? 0);
    const q = calcQuartiles(vals);
    const groups: Record<string, typeof humanRows> = { Q1: [], Q2: [], Q3: [], Q4: [] };
    for (const r of humanRows) {
      const ql = getQuartilLabel(r.contatoEfetivo ?? 0, q.q1, q.q2, q.q3);
      groups[ql.label].push(r);
    }
    return { q, groups };
  })();

  // Quartis Acordo (tabulacoesSucessoNegocio)
  const quartilAcordo = (() => {
    const vals = humanRows.map(r => (r as any).tabulacoesSucessoNegocio ?? 0);
    const q = calcQuartiles(vals);
    const groups: Record<string, typeof humanRows> = { Q1: [], Q2: [], Q3: [], Q4: [] };
    for (const r of humanRows) {
      const ql = getQuartilLabel((r as any).tabulacoesSucessoNegocio ?? 0, q.q1, q.q2, q.q3);
      groups[ql.label].push(r);
    }
    return { q, groups };
  })();

  // Quartis Atendida
  const quartilAtendida = (() => {
    const vals = humanRows.map(r => r.chamadasAtendidas ?? 0);
    const q = calcQuartiles(vals);
    const groups: Record<string, typeof humanRows> = { Q1: [], Q2: [], Q3: [], Q4: [] };
    for (const r of humanRows) {
      const ql = getQuartilLabel(r.chamadasAtendidas ?? 0, q.q1, q.q2, q.q3);
      groups[ql.label].push(r);
    }
    return { q, groups };
  })();

  const QUARTIL_STYLES = {
    Q1: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
    Q2: { color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
    Q3: { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
    Q4: { color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30" },
  };

  async function handleExport(ref: React.RefObject<HTMLDivElement | null>, filename: string) {
    if (!ref.current) { toast.error("Nada para exportar"); return; }
    setExporting(true);
    toast.info("Gerando relatório...");
    try {
      const url = await toPng(ref.current, {
        backgroundColor: "#0f1117",
        pixelRatio: 2.5,
        skipFonts: true,
        cacheBust: true,
        style: { borderRadius: "0" },
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("Relatório exportado!");
    } catch {
      toast.error("Erro ao exportar. Tente novamente.");
    } finally {
      setExporting(false);
    }
  }

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  const isReady = !isLoading && !isError;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[98vw] max-w-6xl max-h-[95vh] overflow-y-auto p-0 gap-0 bg-[#0f1117] border-border">
        {/* Toolbar */}
        <DialogHeader className="flex flex-row items-center justify-between px-5 py-3.5 border-b border-border shrink-0 bg-[#0f1117]">
          <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            Relatório Executivo Consolidado
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="consolidado" className="flex-1">
          <div className="px-5 pt-3 border-b border-border bg-[#0f1117] flex items-center justify-between gap-4">
            <TabsList className="bg-gray-900 border border-gray-800">
              <TabsTrigger value="consolidado" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs">
                Consolidado
              </TabsTrigger>
              <TabsTrigger value="quartil-cpc" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs">
                Quartil CPC
              </TabsTrigger>
              <TabsTrigger value="quartil-acordo" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs">
                Quartil Acordo
              </TabsTrigger>
              <TabsTrigger value="quartil-atendida" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs">
                Quartil Atendida
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ─── ABA CONSOLIDADO ──────────────────────────────────────────── */}
          <TabsContent value="consolidado" className="m-0">
            <div className="flex justify-end px-5 pt-3">
              <Button
                onClick={() => handleExport(exportRefConsolidado, "relatorio-executivo")}
                disabled={!isReady || exporting}
                size="sm"
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                {exporting ? "Gerando..." : "Exportar PNG"}
              </Button>
            </div>
            <ExportSection exportRef={exportRefConsolidado} today={today}>
              {isLoading ? (
                <div className="grid grid-cols-2 gap-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-52 rounded-xl bg-white/5" />
                  ))}
                </div>
              ) : isError ? (
                <div className="flex items-center justify-center py-16 text-white/30 text-sm">
                  Erro ao carregar dados. Verifique se os relatórios foram importados.
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">
                      ① Performance em Tempo Real — Chamadas Atendidas
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">
                      ② Pausas Improdutivas · ③ Campanhas
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">
                      ④ Tabulações Excedidas
                    </p>
                    <RankingCard
                      title="🚨 Top 5 Tabulações Excedidas"
                      subtitle="Maior número de ocorrências de tempo excedido — nome completo do agente e total de ocorrências"
                      items={data?.top5Tabulacoes ?? []}
                      variant="violet"
                      icon={<AlertTriangle className="w-4 h-4" />}
                      formatValue={v => `${v} ocorr.`}
                    />
                  </div>
                </>
              )}
            </ExportSection>
          </TabsContent>

          {/* ─── ABA QUARTIL CPC ──────────────────────────────────────────── */}
          <TabsContent value="quartil-cpc" className="m-0">
            <div className="flex justify-end px-5 pt-3">
              <Button
                onClick={() => handleExport(exportRefCPC, "quartil-cpc")}
                disabled={humanRows.length === 0 || exporting}
                size="sm"
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                {exporting ? "Gerando..." : "Exportar PNG"}
              </Button>
            </div>
            <ExportSection exportRef={exportRefCPC} today={today}>
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-1">Quartil CPC — Contato com Pessoa Certa</p>
                <p className="text-xs text-white/35 mb-4">Distribuição dos agentes por faixa de desempenho em CPC (número de contatos efetivos)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                    const group = quartilCPC.groups[q];
                    const avg = group.length > 0
                      ? Math.round(group.reduce((s, r) => s + (r.contatoEfetivo ?? 0), 0) / group.length)
                      : 0;
                    const s = QUARTIL_STYLES[q];
                    return <QuartilCard key={q} label={q} count={group.length} avg={avg} metric="CPC" color={s.color} bg={s.bg} border={s.border} />;
                  })}
                </div>
                <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">Detalhamento por Quartil</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                    const group = quartilCPC.groups[q];
                    const s = QUARTIL_STYLES[q];
                    const items = [...group]
                      .sort((a, b) => (b.contatoEfetivo ?? 0) - (a.contatoEfetivo ?? 0))
                      .slice(0, 5)
                      .map(r => ({
                        agente: r.agente ?? "",
                        valor: r.contatoEfetivo ?? 0,
                        detalhe: `${r.chamadasAtendidas ?? 0} atend.`,
                      }));
                    const variant = q === "Q1" ? "emerald" : q === "Q2" ? "blue" : q === "Q3" ? "amber" : "red";
                    return (
                      <RankingCard
                        key={q}
                        title={`${q} — Top 5 CPC`}
                        subtitle={`${group.length} agentes neste quartil · Limiar: ≥ ${q === "Q1" ? quartilCPC.q.q3.toFixed(0) : q === "Q2" ? quartilCPC.q.q2.toFixed(0) : q === "Q3" ? quartilCPC.q.q1.toFixed(0) : "0"}`}
                        items={items}
                        variant={variant as any}
                        icon={<Target className="w-4 h-4" />}
                        formatValue={v => `${v} CPC`}
                      />
                    );
                  })}
                </div>
              </div>
            </ExportSection>
          </TabsContent>

          {/* ─── ABA QUARTIL ACORDO ───────────────────────────────────────── */}
          <TabsContent value="quartil-acordo" className="m-0">
            <div className="flex justify-end px-5 pt-3">
              <Button
                onClick={() => handleExport(exportRefAcordo, "quartil-acordo")}
                disabled={humanRows.length === 0 || exporting}
                size="sm"
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                {exporting ? "Gerando..." : "Exportar PNG"}
              </Button>
            </div>
            <ExportSection exportRef={exportRefAcordo} today={today}>
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-1">Quartil Acordo — Sucesso de Negociação</p>
                <p className="text-xs text-white/35 mb-4">Distribuição dos agentes por faixa de desempenho em acordos fechados (Tabulações Sucesso Negócio)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                    const group = quartilAcordo.groups[q];
                    const avg = group.length > 0
                      ? Math.round(group.reduce((s, r) => s + ((r as any).tabulacoesSucessoNegocio ?? 0), 0) / group.length)
                      : 0;
                    const s = QUARTIL_STYLES[q];
                    return <QuartilCard key={q} label={q} count={group.length} avg={avg} metric="Acordos" color={s.color} bg={s.bg} border={s.border} />;
                  })}
                </div>
                <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">Detalhamento por Quartil</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                    const group = quartilAcordo.groups[q];
                    const items = [...group]
                      .sort((a, b) => ((b as any).tabulacoesSucessoNegocio ?? 0) - ((a as any).tabulacoesSucessoNegocio ?? 0))
                      .slice(0, 5)
                      .map(r => ({
                        agente: r.agente ?? "",
                        valor: (r as any).tabulacoesSucessoNegocio ?? 0,
                        detalhe: `${r.chamadasAtendidas ?? 0} atend.`,
                      }));
                    const variant = q === "Q1" ? "emerald" : q === "Q2" ? "blue" : q === "Q3" ? "amber" : "red";
                    return (
                      <RankingCard
                        key={q}
                        title={`${q} — Top 5 Acordos`}
                        subtitle={`${group.length} agentes neste quartil`}
                        items={items}
                        variant={variant as any}
                        icon={<Handshake className="w-4 h-4" />}
                        formatValue={v => `${v} acord.`}
                      />
                    );
                  })}
                </div>
              </div>
            </ExportSection>
          </TabsContent>

          {/* ─── ABA QUARTIL ATENDIDA ─────────────────────────────────────── */}
          <TabsContent value="quartil-atendida" className="m-0">
            <div className="flex justify-end px-5 pt-3">
              <Button
                onClick={() => handleExport(exportRefAtendida, "quartil-atendida")}
                disabled={humanRows.length === 0 || exporting}
                size="sm"
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                {exporting ? "Gerando..." : "Exportar PNG"}
              </Button>
            </div>
            <ExportSection exportRef={exportRefAtendida} today={today}>
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-1">Quartil Atendida — Chamadas Atendidas</p>
                <p className="text-xs text-white/35 mb-4">Distribuição dos agentes por faixa de volume de chamadas atendidas no período</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                    const group = quartilAtendida.groups[q];
                    const avg = group.length > 0
                      ? Math.round(group.reduce((s, r) => s + (r.chamadasAtendidas ?? 0), 0) / group.length)
                      : 0;
                    const s = QUARTIL_STYLES[q];
                    return <QuartilCard key={q} label={q} count={group.length} avg={avg} metric="Atendidas" color={s.color} bg={s.bg} border={s.border} />;
                  })}
                </div>
                <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">Detalhamento por Quartil</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                    const group = quartilAtendida.groups[q];
                    const items = [...group]
                      .sort((a, b) => (b.chamadasAtendidas ?? 0) - (a.chamadasAtendidas ?? 0))
                      .slice(0, 5)
                      .map(r => ({
                        agente: r.agente ?? "",
                        valor: r.chamadasAtendidas ?? 0,
                        detalhe: `CPC: ${r.contatoEfetivo ?? 0}`,
                      }));
                    const variant = q === "Q1" ? "emerald" : q === "Q2" ? "blue" : q === "Q3" ? "amber" : "red";
                    return (
                      <RankingCard
                        key={q}
                        title={`${q} — Top 5 Atendidas`}
                        subtitle={`${group.length} agentes neste quartil`}
                        items={items}
                        variant={variant as any}
                        icon={<Phone className="w-4 h-4" />}
                        formatValue={v => `${v} ch.`}
                      />
                    );
                  })}
                </div>
              </div>
            </ExportSection>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
