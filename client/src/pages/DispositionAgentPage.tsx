import { useRef, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList
} from "recharts";
import { Download, AlertTriangle, Users, Clock, Phone, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toPng } from "html-to-image";
import { toast } from "sonner";

function secondsToHMS(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Converte "MM:SS" ou "HH:MM:SS" para segundos
function hmsToSeconds(hms: string): number {
  if (!hms) return 0;
  const parts = hms.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

const RANK_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl text-xs max-w-56">
      <p className="font-semibold text-foreground mb-1 truncate">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill || p.color }}>
          {p.name}: <span className="font-bold">{p.value?.toLocaleString?.("pt-BR")}</span>
        </p>
      ))}
    </div>
  );
};

export default function DispositionAgentPage() {
  const { filters } = useDashboard();
  const exportRef = useRef<HTMLDivElement>(null);

  // Filtros locais
  const [supervisorFilter, setSupervisorFilter] = useState("all");
  const [minTempoMin, setMinTempoMin] = useState(""); // minutos mínimos de tempo
  const [minChamadas, setMinChamadas] = useState("");  // mínimo de chamadas

  // Converte minutos → segundos para o backend
  const minTempoSeg = minTempoMin ? parseInt(minTempoMin) * 60 : undefined;
  const minChamadasNum = minChamadas ? parseInt(minChamadas) : undefined;

  const { data, isLoading } = trpc.dashboard.getDispositionAgent.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
    supervisor: (supervisorFilter !== "all" ? supervisorFilter : undefined) || filters.supervisor || undefined,
    minTempoSeg,
    minChamadas: minChamadasNum,
  });

  const agenteRanking = data?.agenteRanking ?? [];
  const supervisorRanking = data?.supervisorRanking ?? [];

  // Lista de supervisores disponíveis para o filtro
  const supervisores = useMemo(() => {
    const set = new Set(agenteRanking.map(a => a.supervisor).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [agenteRanking]);

  // Dados para gráfico de agentes (top 10 por ocorrências)
  const agenteBarData = agenteRanking.slice(0, 10).map(a => ({
    name: a.agente.split(" ")[0],
    fullName: a.agente,
    "Ocorrências": a.ocorrencias,
    "Chamadas": a.totalChamadas,
  }));

  // Dados para gráfico de supervisores
  const supervisorBarData = supervisorRanking.slice(0, 8).map(s => ({
    name: s.supervisor.length > 16 ? s.supervisor.slice(0, 16) + "…" : s.supervisor,
    fullName: s.supervisor,
    "Ocorrências": s.ocorrencias,
    "Agentes": s.agentesCount,
  }));

  const hasFilters = supervisorFilter !== "all" || minTempoMin !== "" || minChamadas !== "";

  const clearFilters = () => {
    setSupervisorFilter("all");
    setMinTempoMin("");
    setMinChamadas("");
  };

  const handleExport = async () => {
    if (!exportRef.current) { toast.error("Nada para exportar"); return; }
    try {
      toast.info("Gerando imagem...");
      const url = await toPng(exportRef.current, { backgroundColor: "#0f1117", pixelRatio: 2, skipFonts: true, cacheBust: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = `tabulacoes-excedidas-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("Imagem exportada com sucesso");
    } catch { toast.error("Erro ao exportar imagem"); }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const totalOcorrencias = agenteRanking.reduce((s, a) => s + a.ocorrencias, 0);
  const totalSegundos = agenteRanking.reduce((s, a) => s + a.totalSegundos, 0);
  const totalChamadasSum = agenteRanking.reduce((s, a) => s + a.totalChamadas, 0);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Tabulações Excedidas</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Relatório DispositionAgent — {data?.rows.length ?? 0} registros brutos · {agenteRanking.length} agentes
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" /> Exportar PNG
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" /> Filtros:
        </div>
        <Select value={supervisorFilter} onValueChange={setSupervisorFilter}>
          <SelectTrigger className="w-48 bg-card border-border h-8 text-xs">
            <SelectValue placeholder="Supervisor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Supervisores</SelectItem>
            {supervisores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="number"
            placeholder="Tempo mín. (min)"
            value={minTempoMin}
            onChange={e => setMinTempoMin(e.target.value)}
            className="w-36 bg-card border-border h-8 text-xs"
            min={0}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="number"
            placeholder="Chamadas mín."
            value={minChamadas}
            onChange={e => setMinChamadas(e.target.value)}
            className="w-32 bg-card border-border h-8 text-xs"
            min={0}
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" /> Limpar
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-red-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-muted-foreground">Total de Ocorrências</span>
          </div>
          <p className="text-2xl font-bold text-red-400 tabular-nums">{totalOcorrencias.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground mt-1">tabulações excedidas registradas</p>
        </div>
        <div className="bg-card border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-muted-foreground">Tempo Total Excedido</span>
          </div>
          <p className="text-2xl font-bold text-amber-400 tabular-nums">{secondsToHMS(totalSegundos)}</p>
          <p className="text-xs text-muted-foreground mt-1">soma de todos os tempos excedidos</p>
        </div>
        <div className="bg-card border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-muted-foreground">Total de Chamadas</span>
          </div>
          <p className="text-2xl font-bold text-blue-400 tabular-nums">{totalChamadasSum.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground mt-1">chamadas com tabulação excedida</p>
        </div>
      </div>

      {/* Área exportável */}
      <div ref={exportRef} className="bg-[#0f1117] rounded-xl p-5 space-y-6 border border-border">
        {/* Header do PNG */}
        <div className="flex items-center justify-between border-b border-border/50 pb-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Tabulações Excedidas — Ranking de Ofensores</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              {hasFilters && <span className="ml-2 text-amber-400">· Filtros aplicados</span>}
            </p>
          </div>
          <div className="flex gap-3 text-xs">
            <div className="bg-red-500/15 text-red-400 px-2 py-1 rounded font-bold">{totalOcorrencias} ocorrências</div>
            <div className="bg-amber-500/15 text-amber-400 px-2 py-1 rounded font-bold">{secondsToHMS(totalSegundos)}</div>
          </div>
        </div>

        {/* Gráfico de Agentes — Ocorrências */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            Top 10 Agentes — Ocorrências de Tabulação Excedida
          </h4>
          {agenteBarData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
              Nenhum dado disponível
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={agenteBarData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fill: "oklch(0.65 0.01 240)", fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Ocorrências" radius={[0, 4, 4, 0]}>
                  {agenteBarData.map((_, i) => (
                    <Cell key={i} fill={RANK_COLORS[i % RANK_COLORS.length]} />
                  ))}
                  <LabelList dataKey="Ocorrências" position="right" style={{ fill: "oklch(0.7 0.01 240)", fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Gráfico de Supervisores */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            Supervisores — Ocorrências Totais na Equipe
          </h4>
          {supervisorBarData.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              Nenhum dado disponível
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={supervisorBarData} margin={{ top: 0, right: 60, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 9 }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Ocorrências" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Ocorrências" position="top" style={{ fill: "oklch(0.7 0.01 240)", fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tabela detalhada de agentes */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Ranking Detalhado — Agentes
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">#</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Agente</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Supervisor</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Ocorrências</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Tempo Total</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Chamadas</th>
                </tr>
              </thead>
              <tbody>
                {agenteRanking.map((a, i) => (
                  <tr key={a.agente} className={`border-b border-border/20 ${i < 3 ? "bg-red-500/5" : ""}`}>
                    <td className="py-2 px-3">
                      <span className={`font-bold tabular-nums ${
                        i === 0 ? "text-red-400" : i === 1 ? "text-orange-400" : i === 2 ? "text-amber-400" : "text-muted-foreground"
                      }`}>{i + 1}</span>
                    </td>
                    <td className="py-2 px-3 font-medium text-foreground">{a.agente}</td>
                    <td className="py-2 px-3 text-muted-foreground">{a.supervisor}</td>
                    <td className="py-2 px-3 text-right">
                      <Badge variant="outline" className={`text-xs tabular-nums font-bold ${
                        a.ocorrencias >= 5 ? "border-red-500/40 text-red-400" :
                        a.ocorrencias >= 3 ? "border-amber-500/40 text-amber-400" :
                        "border-border text-muted-foreground"
                      }`}>
                        {a.ocorrencias}x
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-amber-400">{a.tempoFormatado}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-blue-400">{a.totalChamadas.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabela de supervisores */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Ranking por Supervisor
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">#</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Supervisor</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Ocorrências</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Tempo Total</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Chamadas</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Agentes</th>
                </tr>
              </thead>
              <tbody>
                {supervisorRanking.map((s, i) => (
                  <tr key={s.supervisor} className="border-b border-border/20">
                    <td className="py-2 px-3">
                      <span className={`font-bold tabular-nums ${
                        i === 0 ? "text-red-400" : i === 1 ? "text-orange-400" : i === 2 ? "text-amber-400" : "text-muted-foreground"
                      }`}>{i + 1}</span>
                    </td>
                    <td className="py-2 px-3 font-medium text-foreground">{s.supervisor}</td>
                    <td className="py-2 px-3 text-right">
                      <Badge variant="outline" className={`text-xs tabular-nums font-bold ${
                        s.ocorrencias >= 10 ? "border-red-500/40 text-red-400" :
                        s.ocorrencias >= 5 ? "border-amber-500/40 text-amber-400" :
                        "border-border text-muted-foreground"
                      }`}>
                        {s.ocorrencias}x
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-amber-400">{s.tempoFormatado}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-blue-400">{s.totalChamadas.toLocaleString("pt-BR")}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{s.agentesCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
