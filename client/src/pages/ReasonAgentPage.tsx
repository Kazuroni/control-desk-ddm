import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList
} from "recharts";
import { Download, Clock, AlertTriangle, Info, Flame, Filter, Activity, Coffee, BookOpen, MoreHorizontal, Shield, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toPng } from "html-to-image";
import { toast } from "sonner";

const COLORS_IMPROD = ["#f97316", "#ef4444", "#f59e0b", "#eab308", "#fb923c"];
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

function secondsToMin(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}min ${String(sec).padStart(2, "0")}s`;
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
  const [filtroMotivo, setFiltroMotivo] = useState<string>("all");
  const [filtroAgente, setFiltroAgente] = useState<string>("");
  const [filtroOutrosMotivo, setFiltroOutrosMotivo] = useState<string>("all");
  const [filtroOutrosAgente, setFiltroOutrosAgente] = useState<string>("");
  const [filtroNR17Motivo, setFiltroNR17Motivo] = useState<string>("all");
  const [filtroNR17Agente, setFiltroNR17Agente] = useState<string>("");
  const [filtroBanheiroAgente, setFiltroBanheiroAgente] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Busca datas disponíveis no histórico
  const { data: availableDates } = trpc.dashboard.getAvailableDates.useQuery(
    { reportType: "ReasonAgent" },
    { refetchOnWindowFocus: false }
  );

  // Quando as datas carregam, seleciona a mais recente automaticamente
  useEffect(() => {
    if (availableDates && availableDates.length > 0 && selectedDate === null) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  const currentDateIndex = selectedDate && availableDates ? availableDates.indexOf(selectedDate) : 0;
  const canGoPrev = availableDates ? currentDateIndex < availableDates.length - 1 : false;
  const canGoNext = currentDateIndex > 0;

  const { data, isLoading } = trpc.dashboard.getReasonAgent.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
    agente: filters.agente || undefined,
    referenceDate: selectedDate || undefined,
  });

  const motivoChart = data?.motivoChart ?? [];
  const motivoImprodChart = data?.motivoImprodChart ?? [];
  const agenteRanking = data?.agenteRanking ?? [];
  const agenteRankingGeral = data?.agenteRankingGeral ?? [];
  const abusadoresPausa = data?.abusadoresPausa ?? [];
  const pausaLimites = data?.pausaLimites ?? [];
  const nr17Abusadores = (data as any)?.nr17Abusadores ?? [];
  const nr17Todos = (data as any)?.nr17Todos ?? [];
  const banheiroRanking = (data as any)?.banheiroRanking ?? [];
  const feedbackRanking = (data as any)?.feedbackRanking ?? [];
  const outrosRanking = (data as any)?.outrosRanking ?? [];
  const outrosMotivos = (data as any)?.outrosMotivos ?? [];
  const pausaTotalPorAgente = (data as any)?.pausaTotalPorAgente ?? [];

  // Motivos únicos para filtro de abusadores
  const motivosUnicos = useMemo(() => {
    const s = new Set(abusadoresPausa.map((a: any) => a.motivo));
    return Array.from(s).sort() as string[];
  }, [abusadoresPausa]);

  // Motivos NR17 únicos
  const motivosNR17 = useMemo(() => {
    const s = new Set(nr17Todos.map((a: any) => a.motivo));
    return Array.from(s).sort() as string[];
  }, [nr17Todos]);

  // Abusadores filtrados (geral)
  const abusadoresFiltrados = useMemo(() => {
    return abusadoresPausa
      .filter((a: any) => filtroMotivo === "all" || a.motivo === filtroMotivo)
      .filter((a: any) => !filtroAgente || a.agente.toLowerCase().includes(filtroAgente.toLowerCase()));
  }, [abusadoresPausa, filtroMotivo, filtroAgente]);

  // NR17 filtrados
  const nr17Filtrados = useMemo(() => {
    return nr17Todos
      .filter((a: any) => filtroNR17Motivo === "all" || a.motivo === filtroNR17Motivo)
      .filter((a: any) => !filtroNR17Agente || a.agente.toLowerCase().includes(filtroNR17Agente.toLowerCase()));
  }, [nr17Todos, filtroNR17Motivo, filtroNR17Agente]);

  // Banheiro filtrado
  const banheiroFiltrado = useMemo(() => {
    return banheiroRanking.filter((a: any) =>
      !filtroBanheiroAgente || a.agente.toLowerCase().includes(filtroBanheiroAgente.toLowerCase())
    );
  }, [banheiroRanking, filtroBanheiroAgente]);

  // Outros filtrados
  const outrosFiltrados = useMemo(() => {
    return outrosRanking
      .filter((a: any) => filtroOutrosMotivo === "all" || a.motivo === filtroOutrosMotivo)
      .filter((a: any) => !filtroOutrosAgente || a.agente.toLowerCase().includes(filtroOutrosAgente.toLowerCase()));
  }, [outrosRanking, filtroOutrosMotivo, filtroOutrosAgente]);

  const exportPng = async (ref: React.RefObject<HTMLDivElement | null>, filename: string) => {
    if (!ref.current) { toast.error("Nada para exportar"); return; }
    try {
      toast.info("Gerando imagem...");
      const url = await toPng(ref.current, {
        backgroundColor: "#0f1117",
        pixelRatio: 2,
        skipFonts: true,
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      toast.success("Imagem exportada com sucesso");
    } catch { toast.error("Erro ao exportar imagem"); }
  };

  // Cores para NR17 por motivo
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

  // Limites NR17 para exibição
  const NR17_LIMITES: Record<string, string> = {
    "descanso 1": "10 min",
    "descanso 2": "10 min",
    "descanso 3": "10 min",
    "lanche": "20 min",
    "pausa descanso 1": "10 min",
    "pausa descanso 2": "10 min",
    "pausa descanso 3": "10 min",
    "pausa lanche": "20 min",
  };

  function getNR17Limite(motivo: string): string {
    const m = motivo.toLowerCase();
    for (const [key, lim] of Object.entries(NR17_LIMITES)) {
      if (m.includes(key)) return lim;
    }
    return "—";
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">TEMPOS</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Controle de pausas, NR17, banheiro, feedback e outros · {(data?.rows ?? []).length} registros
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de data histórica */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-2 py-1">
            <Calendar className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <button
              onClick={() => {
                if (canGoPrev && availableDates) setSelectedDate(availableDates[currentDateIndex + 1]);
              }}
              disabled={!canGoPrev}
              className="p-0.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              title="Dia anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <Select
              value={selectedDate || ""}
              onValueChange={(v) => setSelectedDate(v)}
            >
              <SelectTrigger className="border-0 bg-transparent h-7 text-xs font-medium min-w-[110px] focus:ring-0 px-1">
                <SelectValue placeholder="Selecionar data" />
              </SelectTrigger>
              <SelectContent>
                {(availableDates ?? []).map((d: string) => (
                  <SelectItem key={d} value={d} className="text-xs">
                    {d}
                  </SelectItem>
                ))}
                {(!availableDates || availableDates.length === 0) && (
                  <SelectItem value="__empty__" disabled className="text-xs text-muted-foreground">
                    Nenhum histórico
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <button
              onClick={() => {
                if (canGoNext && availableDates) setSelectedDate(availableDates[currentDateIndex - 1]);
              }}
              disabled={!canGoNext}
              className="p-0.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              title="Próximo dia"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {availableDates && availableDates.length > 1 && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {availableDates.length} dias no histórico
            </Badge>
          )}
          <Button
            onClick={() => exportPng(exportRef, `tempos-${selectedDate || new Date().toISOString().slice(0, 10)}.png`)}
            variant="outline" size="sm" className="gap-2"
          >
            <Download className="w-4 h-4" /> Exportar PNG
          </Button>
        </div>
      </div>

      <Tabs defaultValue="visao-geral">
        <TabsList className="bg-card border border-border flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="visao-geral" className="gap-1.5 text-xs">
            <Activity className="w-3.5 h-3.5" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="nr17" className="gap-1.5 text-xs">
            <Shield className="w-3.5 h-3.5 text-amber-400" /> NR17
          </TabsTrigger>
          <TabsTrigger value="banheiro" className="gap-1.5 text-xs">
            <Coffee className="w-3.5 h-3.5 text-blue-400" /> Banheiro
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1.5 text-xs">
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" /> Feedback/Treinamento
          </TabsTrigger>
          <TabsTrigger value="outros" className="gap-1.5 text-xs">
            <MoreHorizontal className="w-3.5 h-3.5 text-violet-400" /> Outros
          </TabsTrigger>
          <TabsTrigger value="abusadores" className="gap-1.5 text-xs">
            <Flame className="w-3.5 h-3.5 text-red-400" /> Abusadores
          </TabsTrigger>
        </TabsList>

        {/* ── Visão Geral ── */}
        <TabsContent value="visao-geral" className="space-y-5 mt-4">
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total de Motivos", value: motivoChart.length, color: "text-blue-400", icon: <Activity className="w-4 h-4" /> },
              { label: "Motivos Improdutivos", value: motivoImprodChart.length, color: "text-red-400", icon: <AlertTriangle className="w-4 h-4" /> },
              { label: "Agentes com Pausa Improd.", value: agenteRanking.length, color: "text-amber-400", icon: <Clock className="w-4 h-4" /> },
              { label: "Abusadores de Limite", value: abusadoresPausa.length, color: "text-red-500", icon: <Flame className="w-4 h-4" /> },
            ].map(card => (
              <div key={card.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                <div className={`${card.color} opacity-70`}>{card.icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Gráfico de todos os motivos */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Todos os Motivos de Pausa — Tempo Total
            </h3>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={Math.max(200, motivoChart.slice(0, 15).length * 32)}>
                <BarChart data={motivoChart.slice(0, 15)} layout="vertical" margin={{ top: 0, right: 80, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }}
                    tickFormatter={(v: number) => `${Math.round(v / 60)}m`} />
                  <YAxis type="category" dataKey="motivo" tick={{ fill: "oklch(0.65 0.01 240)", fontSize: 10 }} width={140} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="totalSegundos" name="Tempo (s)" radius={[0, 4, 4, 0]}>
                    {motivoChart.slice(0, 15).map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.improdutiva ? COLORS_IMPROD[i % COLORS_IMPROD.length] : COLORS_GERAL[i % COLORS_GERAL.length]} />
                    ))}
                    <LabelList dataKey="totalSegundos" position="right"
                      style={{ fill: "oklch(0.7 0.01 240)", fontSize: 9 }}
                      formatter={(v: number) => secondsToMin(v)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* % Pausa Total por Agente */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> % Pausa Total por Agente
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Tempo total em pausa — quanto mais alto, menos produtivo o agente</p>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">#</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Agente</th>
                      <th className="px-3 py-2 text-right text-muted-foreground font-medium">Total Pausa</th>
                      <th className="px-3 py-2 text-right text-muted-foreground font-medium">Nº Pausas</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium w-40">Barra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pausaTotalPorAgente.slice(0, 15).map((r: any, i: number) => {
                      const maxSeg = pausaTotalPorAgente[0]?.totalSegundos || 1;
                      const pct = Math.round((r.totalSegundos / maxSeg) * 100);
                      const mins = Math.round(r.totalSegundos / 60);
                      const severity = mins > 120 ? "bg-red-500" : mins > 60 ? "bg-amber-500" : "bg-emerald-500";
                      return (
                        <tr key={r.agente} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-foreground">{r.agente}</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-400 font-semibold">{secondsToHMS(r.totalSegundos)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{r.totalPausas}</td>
                          <td className="px-3 py-2">
                            <div className="w-full bg-border/30 rounded-full h-2">
                              <div className={`${severity} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {pausaTotalPorAgente.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Nenhum dado disponível</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── NR17 ── */}
        <TabsContent value="nr17" className="space-y-5 mt-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex gap-3">
            <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-400">Pausas NR17 — Obrigatórias por Lei</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Descanso 1 e 3: <strong className="text-foreground">10 min</strong> · Lanche: <strong className="text-foreground">20 min</strong> ·
                Qualquer segundo acima do limite já é considerado estourado.
                <span className="text-amber-400 ml-1">NR17 não é improdutiva, mas o excesso é monitorado.</span>
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-40">
              <Input placeholder="Buscar agente..." value={filtroNR17Agente} onChange={e => setFiltroNR17Agente(e.target.value)}
                className="pl-3 bg-card border-border text-sm" />
            </div>
            <Select value={filtroNR17Motivo} onValueChange={setFiltroNR17Motivo}>
              <SelectTrigger className="w-44 bg-card border-border">
                <SelectValue placeholder="Tipo de pausa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {motivosNR17.map((m: string) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Tabela NR17 */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">#</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">Agente</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">Tipo Pausa</th>
                    <th className="px-3 py-3 text-center text-muted-foreground font-semibold uppercase tracking-wider">Limite</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Tempo Usado</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Nº Pausas</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Excedeu</th>
                    <th className="px-3 py-3 text-center text-muted-foreground font-semibold uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : nr17Filtrados.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Nenhum registro NR17 encontrado</td></tr>
                  ) : (
                    nr17Filtrados.map((r: any, i: number) => {
                      const excedeuMin = r.excedeuLimite ? Math.floor(r.excedidoSegundos / 60) : 0;
                      const excedeuSec = r.excedeuLimite ? r.excedidoSegundos % 60 : 0;
                      const cor = getNR17Color(r.motivo);
                      return (
                        <tr key={`${r.agente}-${r.motivo}`} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-foreground">{r.agente}</td>
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: `${cor}20`, color: cor }}>
                              {r.motivo}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">{getNR17Limite(r.motivo)}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">{secondsToHMS(r.totalSegundos)}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{r.totalPausas}x</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">
                            {r.excedeuLimite
                              ? <span className="text-red-400">+{excedeuMin}min {String(excedeuSec).padStart(2, "0")}s</span>
                              : <span className="text-muted-foreground/50">—</span>
                            }
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {r.excedeuLimite
                              ? <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Estourou</Badge>
                              : <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-400 border-emerald-500/30">OK</Badge>
                            }
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Banheiro ── */}
        <TabsContent value="banheiro" className="space-y-5 mt-4">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex gap-3">
            <Coffee className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-400">Pausa Banheiro</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Visão de tempo total e quantidade de ocorrências por agente. Sem limite fixo, mas monitorado para identificar padrões de abuso.
              </p>
            </div>
          </div>

          <div className="relative">
            <Input placeholder="Buscar agente..." value={filtroBanheiroAgente} onChange={e => setFiltroBanheiroAgente(e.target.value)}
              className="max-w-xs bg-card border-border text-sm" />
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">#</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">Agente</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Tempo Total</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Ocorrências</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Média/Pausa</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider w-36">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : banheiroFiltrado.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum registro de banheiro encontrado</td></tr>
                  ) : (
                    banheiroFiltrado.map((r: any, i: number) => {
                      const maxSeg = banheiroFiltrado[0]?.totalSegundos || 1;
                      const pct = Math.round((r.totalSegundos / maxSeg) * 100);
                      const mediaSeg = r.totalPausas > 0 ? Math.round(r.totalSegundos / r.totalPausas) : 0;
                      const alerta = r.totalSegundos > 1800 || r.totalPausas > 5;
                      return (
                        <tr key={r.agente} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-foreground">{r.agente}</td>
                          <td className={`px-3 py-2.5 text-right font-mono font-semibold ${alerta ? "text-amber-400" : "text-foreground"}`}>
                            {secondsToHMS(r.totalSegundos)}
                          </td>
                          <td className={`px-3 py-2.5 text-right ${r.totalPausas > 5 ? "text-amber-400 font-semibold" : "text-muted-foreground"}`}>
                            {r.totalPausas}x
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                            {mediaSeg > 0 ? secondsToMin(mediaSeg) : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="w-full bg-border/30 rounded-full h-2">
                              <div className={`${alerta ? "bg-amber-500" : "bg-blue-500"} h-2 rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Feedback/Treinamento ── */}
        <TabsContent value="feedback" className="space-y-5 mt-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex gap-3">
            <BookOpen className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-400">Pausas de Feedback e Treinamento</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Não são consideradas improdutivas. Visão de quem mais recebe feedback/treinamento e por quanto tempo.
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">#</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">Agente</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">Motivo</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Tempo Total</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Ocorrências</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : feedbackRanking.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nenhum registro de feedback/treinamento encontrado</td></tr>
                  ) : (
                    feedbackRanking.map((r: any, i: number) => (
                      <tr key={`${r.agente}-${r.motivo}`} className="border-b border-border/50 hover:bg-accent/20">
                        <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-foreground">{r.agente}</td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">{r.motivo}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-400">{secondsToHMS(r.totalSegundos)}</td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">{r.totalPausas}x</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Outros ── */}
        <TabsContent value="outros" className="space-y-5 mt-4">
          <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4 flex gap-3">
            <MoreHorizontal className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-violet-400">Pausas "Outros"</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Todos os motivos que não são NR17, banheiro ou feedback. Visão por motivo + agente com tempo e ocorrências.
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-40">
              <Input placeholder="Buscar agente..." value={filtroOutrosAgente} onChange={e => setFiltroOutrosAgente(e.target.value)}
                className="pl-3 bg-card border-border text-sm" />
            </div>
            <Select value={filtroOutrosMotivo} onValueChange={setFiltroOutrosMotivo}>
              <SelectTrigger className="w-48 bg-card border-border">
                <SelectValue placeholder="Filtrar por motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os motivos</SelectItem>
                {outrosMotivos.map((m: string) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">#</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">Agente</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">Motivo</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Tempo Total</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Ocorrências</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider w-32">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : outrosFiltrados.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum registro encontrado</td></tr>
                  ) : (
                    outrosFiltrados.map((r: any, i: number) => {
                      const maxSeg = outrosFiltrados[0]?.totalSegundos || 1;
                      const pct = Math.round((r.totalSegundos / maxSeg) * 100);
                      return (
                        <tr key={`${r.agente}-${r.motivo}`} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-foreground">{r.agente}</td>
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-400">{r.motivo}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-violet-400">{secondsToHMS(r.totalSegundos)}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{r.totalPausas}x</td>
                          <td className="px-3 py-2.5">
                            <div className="w-full bg-border/30 rounded-full h-2">
                              <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Abusadores ── */}
        <TabsContent value="abusadores" className="space-y-5 mt-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex gap-3">
            <Flame className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-400">Dashboard de Abusadores de Pausa</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Agentes que ultrapassaram o limite de qualquer pausa com limite definido. Qualquer segundo acima do limite é contabilizado.
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-40">
              <Input placeholder="Buscar agente..." value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)}
                className="pl-3 bg-card border-border text-sm" />
            </div>
            <Select value={filtroMotivo} onValueChange={setFiltroMotivo}>
              <SelectTrigger className="w-44 bg-card border-border">
                <SelectValue placeholder="Tipo de pausa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {motivosUnicos.map((m: string) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Tabela de abusadores */}
          <div ref={exportRef} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">#</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">Agente</th>
                    <th className="px-3 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">Motivo</th>
                    <th className="px-3 py-3 text-center text-muted-foreground font-semibold uppercase tracking-wider">Limite</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Tempo Usado</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Excedeu</th>
                    <th className="px-3 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Nº Pausas</th>
                    <th className="px-3 py-3 text-center text-muted-foreground font-semibold uppercase tracking-wider">Gravidade</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : abusadoresFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        Nenhum abusador encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    abusadoresFiltrados.map((r: any, i: number) => {
                      const excedeuMin = Math.floor(r.excedidoSegundos / 60);
                      const excedeuSec = r.excedidoSegundos % 60;
                      const limiteMin = r.limiteSegundos ? Math.round(r.limiteSegundos / 60) : null;
                      const pctExcesso = r.limiteSegundos ? Math.round((r.excedidoSegundos / r.limiteSegundos) * 100) : 0;
                      const gravidade = pctExcesso > 50 ? { label: "Crítico", cls: "bg-red-500/20 text-red-400" }
                        : pctExcesso > 20 ? { label: "Alerta", cls: "bg-amber-500/20 text-amber-400" }
                        : { label: "Atenção", cls: "bg-yellow-500/20 text-yellow-400" };
                      return (
                        <tr key={`${r.agente}-${r.motivo}`} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-foreground">{r.agente}</td>
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">{r.motivo}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">
                            {limiteMin !== null ? `${limiteMin} min` : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                            {secondsToHMS(r.totalSegundos)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-red-400">
                            +{excedeuMin}min {String(excedeuSec).padStart(2, "0")}s
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{r.totalPausas}x</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${gravidade.cls}`}>
                              {gravidade.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
