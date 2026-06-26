import { useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Download, AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toPng } from "html-to-image";
import { toast } from "sonner";

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
        <p key={p.name} style={{ color: p.fill }}>
          {p.name}: {p.name.includes("Tempo") ? secondsToHMS(p.value) : p.value.toLocaleString("pt-BR")}
        </p>
      ))}
    </div>
  );
};

export default function DispositionAgentPage() {
  const { filters } = useDashboard();
  const exportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = trpc.dashboard.getDispositionAgent.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
    supervisor: filters.supervisor || undefined,
  });

  const agenteRanking = data?.agenteRanking ?? [];
  const supervisorRanking = data?.supervisorRanking ?? [];

  const agenteBarData = agenteRanking.slice(0, 10).map(a => ({
    name: a.agente.split(" ")[0],
    fullName: a.agente,
    "Tempo (s)": a.totalSegundos,
    "Chamadas": a.totalChamadas,
  }));

  const supervisorBarData = supervisorRanking.slice(0, 8).map(s => ({
    name: s.supervisor.length > 14 ? s.supervisor.slice(0, 14) + "…" : s.supervisor,
    fullName: s.supervisor,
    "Tempo (s)": s.totalSegundos,
    "Agentes": s.agentes,
  }));

  const handleExport = async () => {
    if (!exportRef.current) return;
    try {
      const url = await toPng(exportRef.current, { backgroundColor: "#1a1d2e", pixelRatio: 2 });
      const a = document.createElement("a"); a.href = url; a.download = "tabulacoes-excedidas.png"; a.click();
      toast.success("Imagem exportada com sucesso");
    } catch { toast.error("Erro ao exportar imagem"); }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Tabulações Excedidas</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Relatório DispositionAgent — {data?.rows.length ?? 0} registros
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" /> Exportar PNG
        </Button>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Ranking agentes — gráfico */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Top 10 Agentes — Tempo Excedido</h3>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : agenteBarData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Sem dados disponíveis
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={agenteBarData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} tickFormatter={v => secondsToHMS(v)} />
                <YAxis type="category" dataKey="name" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Tempo (s)" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Ranking supervisores — gráfico */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Top 8 Supervisores — Tempo Total</h3>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : supervisorBarData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Sem dados disponíveis
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={supervisorBarData} margin={{ top: 0, right: 10, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} tickFormatter={v => secondsToHMS(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Tempo (s)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Rankings detalhados */}
      <div ref={exportRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking agentes */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-semibold text-foreground">Ranking — Agentes com Mais Tempo Excedido</h3>
          </div>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : agenteRanking.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados disponíveis</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase">#</th>
                    <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase">Agente</th>
                    <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase">Supervisor</th>
                    <th className="pb-2 text-right text-xs font-semibold text-muted-foreground uppercase">Chamadas</th>
                    <th className="pb-2 text-right text-xs font-semibold text-muted-foreground uppercase">Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {agenteRanking.map((a, i) => (
                    <tr key={a.agente} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                      <td className="py-2 pr-2">
                        <span className={`text-xs font-bold tabular-nums ${i < 3 ? "text-red-400" : "text-muted-foreground"}`}>{i + 1}</span>
                      </td>
                      <td className="py-2 pr-2">
                        <span className="text-sm text-foreground">{a.agente}</span>
                      </td>
                      <td className="py-2 pr-2">
                        <span className="text-xs text-muted-foreground truncate max-w-28 block">{a.supervisor}</span>
                      </td>
                      <td className="py-2 text-right">
                        <span className="text-xs text-muted-foreground tabular-nums">{a.totalChamadas.toLocaleString("pt-BR")}</span>
                      </td>
                      <td className="py-2 text-right">
                        <span className={`text-sm font-mono font-semibold tabular-nums ${i < 3 ? "text-red-400" : "text-amber-400"}`}>
                          {secondsToHMS(a.totalSegundos)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Ranking supervisores */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">Ranking — Supervisores por Tempo Total</h3>
          </div>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : supervisorRanking.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados disponíveis</p>
          ) : (
            <div className="space-y-3">
              {supervisorRanking.map((s, i) => {
                const maxSec = supervisorRanking[0]?.totalSegundos || 1;
                const pct = (s.totalSegundos / maxSec) * 100;
                return (
                  <div key={s.supervisor} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-bold w-5 tabular-nums shrink-0 ${i < 3 ? "text-red-400" : "text-muted-foreground"}`}>{i + 1}.</span>
                        <span className="text-sm text-foreground truncate">{s.supervisor}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">{s.agentes} agentes</span>
                        <span className="text-sm font-mono font-semibold text-amber-400">{secondsToHMS(s.totalSegundos)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: i < 3 ? "#ef4444" : "#f59e0b" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
