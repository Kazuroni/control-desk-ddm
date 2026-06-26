import { useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { Download, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toPng } from "html-to-image";
import { toast } from "sonner";

const COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#84cc16"
];

function secondsToHMS(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-foreground mb-1 max-w-48 truncate">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name === "Tempo (s)" ? secondsToHMS(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function ReasonAgentPage() {
  const { filters } = useDashboard();
  const exportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = trpc.dashboard.getReasonAgent.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
    agente: filters.agente || undefined,
  });

  const motivoChart = data?.motivoChart ?? [];
  const agenteRanking = data?.agenteRanking ?? [];

  const barData = useMemo(() =>
    motivoChart.slice(0, 10).map(m => ({
      name: m.motivo.length > 20 ? m.motivo.slice(0, 20) + "…" : m.motivo,
      fullName: m.motivo,
      "Pausas": m.totalPausas,
      "Tempo (s)": m.totalSegundos,
    })),
    [motivoChart]
  );

  const pieData = useMemo(() =>
    motivoChart.slice(0, 8).map(m => ({
      name: m.motivo.length > 18 ? m.motivo.slice(0, 18) + "…" : m.motivo,
      value: m.totalPausas,
    })),
    [motivoChart]
  );

  const handleExport = async () => {
    if (!exportRef.current) return;
    try {
      const url = await toPng(exportRef.current, { backgroundColor: "#1a1d2e", pixelRatio: 2 });
      const a = document.createElement("a"); a.href = url; a.download = "controle-pausas.png"; a.click();
      toast.success("Imagem exportada com sucesso");
    } catch { toast.error("Erro ao exportar imagem"); }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Controle de Pausas</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Relatório ReasonAgent — {data?.rows.length ?? 0} registros
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" /> Exportar PNG
        </Button>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Barras — Motivos */}
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Pausas por Motivo</h3>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : barData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Sem dados disponíveis
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ top: 0, right: 10, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Pausas" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pizza — Distribuição */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição por Motivo</h3>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : pieData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Sem dados disponíveis
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [v, "Pausas"]} contentStyle={{ background: "oklch(0.16 0.012 240)", border: "1px solid oklch(0.25 0.012 240)", borderRadius: 8, fontSize: 11 }} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10, color: "oklch(0.55 0.01 240)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Ranking de ofensores */}
      <div ref={exportRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top ofensores por tempo */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">Maiores Ofensores — Tempo de Pausa</h3>
          </div>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : agenteRanking.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados disponíveis</p>
          ) : (
            <div className="space-y-2">
              {agenteRanking.slice(0, 10).map((a, i) => {
                const maxSec = agenteRanking[0]?.totalSegundos || 1;
                const pct = (a.totalSegundos / maxSec) * 100;
                return (
                  <div key={a.agente} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground w-5 tabular-nums shrink-0">{i + 1}.</span>
                        <span className="text-sm text-foreground truncate">{a.agente}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">{a.totalPausas} pausas</span>
                        <span className="text-sm font-mono font-semibold text-amber-400">{secondsToHMS(a.totalSegundos)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: i < 3 ? "#ef4444" : i < 6 ? "#f59e0b" : "#6366f1" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tabela de motivos com tempo total */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground">Motivos — Tempo Total</h3>
          </div>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : motivoChart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados disponíveis</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase">Motivo</th>
                    <th className="pb-2 text-right text-xs font-semibold text-muted-foreground uppercase">Pausas</th>
                    <th className="pb-2 text-right text-xs font-semibold text-muted-foreground uppercase">Tempo Total</th>
                  </tr>
                </thead>
                <tbody>
                  {motivoChart.slice(0, 10).map((m, i) => (
                    <tr key={m.motivo} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-foreground text-xs truncate max-w-36">{m.motivo}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">{m.totalPausas.toLocaleString("pt-BR")}</td>
                      <td className="py-2 text-right text-xs font-mono font-semibold text-amber-400">{secondsToHMS(m.totalSegundos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
