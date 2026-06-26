import { useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { Download, Clock, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toPng } from "html-to-image";
import { toast } from "sonner";

const COLORS_IMPROD = ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16"];
const COLORS_GERAL = [
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
      <p className="font-semibold text-foreground mb-1 max-w-52 truncate">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill || p.color }}>
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
  const motivoImprodChart = data?.motivoImprodChart ?? [];
  const agenteRanking = data?.agenteRanking ?? [];       // Apenas improdutivas
  const agenteRankingGeral = data?.agenteRankingGeral ?? []; // Todas as pausas

  // Gráfico de barras — improdutivas
  const barImprodData = useMemo(() =>
    motivoImprodChart.slice(0, 8).map(m => ({
      name: m.motivo.length > 22 ? m.motivo.slice(0, 22) + "…" : m.motivo,
      fullName: m.motivo,
      "Pausas": m.totalPausas,
      "Tempo (s)": m.totalSegundos,
    })),
    [motivoImprodChart]
  );

  // Gráfico de barras — geral (exceto chat)
  const barGeralData = useMemo(() =>
    motivoChart.slice(0, 10).map(m => ({
      name: m.motivo.length > 22 ? m.motivo.slice(0, 22) + "…" : m.motivo,
      fullName: m.motivo,
      "Pausas": m.totalPausas,
      "Tempo (s)": m.totalSegundos,
    })),
    [motivoChart]
  );

  // Pizza — improdutivas
  const pieImprodData = useMemo(() =>
    motivoImprodChart.slice(0, 6).map(m => ({
      name: m.motivo.length > 18 ? m.motivo.slice(0, 18) + "…" : m.motivo,
      value: m.totalPausas,
    })),
    [motivoImprodChart]
  );

  // Pizza — geral
  const pieGeralData = useMemo(() =>
    motivoChart.slice(0, 8).map(m => ({
      name: m.motivo.length > 18 ? m.motivo.slice(0, 18) + "…" : m.motivo,
      value: m.totalPausas,
    })),
    [motivoChart]
  );

  const handleExport = async () => {
    if (!exportRef.current) return;
    try {
      toast.info("Gerando imagem...");
      const url = await toPng(exportRef.current, { backgroundColor: "#0f1117", pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = url;
      a.download = `controle-pausas-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("Imagem exportada com sucesso");
    } catch { toast.error("Erro ao exportar imagem"); }
  };

  const RankingList = ({ data: rankData, colorFn }: {
    data: { agente: string; totalSegundos: number; totalPausas: number }[];
    colorFn: (i: number) => string;
  }) => (
    <div className="space-y-2">
      {rankData.slice(0, 10).map((a, i) => {
        const maxSec = rankData[0]?.totalSegundos || 1;
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
                <span className={`text-sm font-mono font-semibold ${colorFn(i)}`}>{secondsToHMS(a.totalSegundos)}</span>
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
  );

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

      {/* Aviso sobre regras de classificação */}
      <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-300 space-y-0.5">
          <p className="font-semibold text-blue-200">Regras de Pausas Improdutivas</p>
          <p><span className="text-emerald-400">Produtiva:</span> Atendimento Chat (excluída dos gráficos de improdutivas)</p>
          <p><span className="text-red-400">Improdutivas:</span> Descanso 1, 2, 3 · Lanche · Banheiro &gt; 10 min</p>
          <p><span className="text-muted-foreground">Demais pausas:</span> Exibidas na aba "Visão Geral" sem classificação</p>
        </div>
      </div>

      <Tabs defaultValue="improdutivas">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="improdutivas" className="gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Pausas Improdutivas
            {motivoImprodChart.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                {agenteRanking.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="geral" className="gap-2">
            <Clock className="w-3.5 h-3.5" /> Visão Geral
          </TabsTrigger>
        </TabsList>

        {/* ── Aba: Pausas Improdutivas ── */}
        <TabsContent value="improdutivas" className="space-y-4 mt-4">
          {/* Gráficos improdutivas */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" /> Pausas Improdutivas por Motivo
              </h3>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : barImprodData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                  Nenhuma pausa improdutiva encontrada
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barImprodData} margin={{ top: 0, right: 10, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Pausas" radius={[4, 4, 0, 0]}>
                      {barImprodData.map((_, i) => (
                        <Cell key={i} fill={COLORS_IMPROD[i % COLORS_IMPROD.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição Improdutivas</h3>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : pieImprodData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieImprodData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                      {pieImprodData.map((_, i) => <Cell key={i} fill={COLORS_IMPROD[i % COLORS_IMPROD.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, "Pausas"]} contentStyle={{ background: "oklch(0.16 0.012 240)", border: "1px solid oklch(0.25 0.012 240)", borderRadius: 8, fontSize: 11 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, color: "oklch(0.55 0.01 240)" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Ranking de ofensores — improdutivas */}
          <div ref={exportRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-foreground">Top Ofensores — Pausas Improdutivas</h3>
              </div>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : agenteRanking.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma pausa improdutiva registrada</p>
              ) : (
                <RankingList data={agenteRanking} colorFn={(i) => i < 3 ? "text-red-400" : i < 6 ? "text-amber-400" : "text-muted-foreground"} />
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-foreground">Motivos Improdutivos — Tempo Total</h3>
              </div>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : motivoImprodChart.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sem dados de pausas improdutivas</p>
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
                      {motivoImprodChart.map((m, i) => (
                        <tr key={m.motivo} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="py-2 text-foreground">{m.motivo}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{m.totalPausas.toLocaleString("pt-BR")}</td>
                          <td className="py-2 text-right font-mono font-semibold" style={{ color: COLORS_IMPROD[i % COLORS_IMPROD.length] }}>
                            {secondsToHMS(m.totalSegundos)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Aba: Visão Geral ── */}
        <TabsContent value="geral" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Todas as Pausas por Motivo</h3>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : barGeralData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Sem dados disponíveis</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barGeralData} margin={{ top: 0, right: 10, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Pausas" radius={[4, 4, 0, 0]}>
                      {barGeralData.map((_, i) => <Cell key={i} fill={COLORS_GERAL[i % COLORS_GERAL.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição Geral</h3>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : pieGeralData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieGeralData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                      {pieGeralData.map((_, i) => <Cell key={i} fill={COLORS_GERAL[i % COLORS_GERAL.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, "Pausas"]} contentStyle={{ background: "oklch(0.16 0.012 240)", border: "1px solid oklch(0.25 0.012 240)", borderRadius: 8, fontSize: 11 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, color: "oklch(0.55 0.01 240)" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-foreground">Maiores Ofensores — Tempo Total de Pausa</h3>
              </div>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : agenteRankingGeral.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sem dados disponíveis</p>
              ) : (
                <RankingList data={agenteRankingGeral} colorFn={(i) => i < 3 ? "text-amber-400" : i < 6 ? "text-blue-400" : "text-muted-foreground"} />
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-foreground">Todos os Motivos — Tempo Total</h3>
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
                      {motivoChart.map((m, i) => (
                        <tr key={m.motivo} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="py-2 text-foreground flex items-center gap-2">
                            {m.improdutiva && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500/15 text-red-400">IMP</span>}
                            {m.motivo}
                          </td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{m.totalPausas.toLocaleString("pt-BR")}</td>
                          <td className="py-2 text-right font-mono font-semibold" style={{ color: COLORS_GERAL[i % COLORS_GERAL.length] }}>
                            {secondsToHMS(m.totalSegundos)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
