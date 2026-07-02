import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  ChevronUp, ChevronDown, ChevronsUpDown, Download, Search,
  Phone, Target, Clock, AlertTriangle, TrendingUp, Award, Users, Filter
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList
} from "recharts";
import { toPng } from "html-to-image";
import { toast } from "sonner";

type SortKey = "agente" | "chamadasAtendidas" | "contatoEfetivo" | "tempoLogado" | "idleSeg"
  | "tmaSeg" | "cpcPct" | "tabulacoesSucesso" | "tabulacoesSucessoNegocio" | "sucessoNegPct" | "pausasImprodutivas";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-muted-foreground/50" />;
  return dir === "asc" ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
}

// Converte HH:MM:SS → segundos
function timeToSec(t: string | null | undefined): number {
  if (!t) return 0;
  const p = t.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : 0;
}

// Formata segundos → HH:MM:SS
function secToHMS(s: number): string {
  if (!s || s <= 0) return "00:00:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Formata segundos → MM:SS (para Idle e TMA curtos)
function secToMS(s: number): string {
  if (!s || s <= 0) return "00:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Calcula quartis (Q1, Q2, Q3) de um array de números
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

function getQuartilLabel(val: number, q1: number, q2: number, q3: number): { label: string; color: string; bg: string } {
  if (val >= q3) return { label: "Q1", color: "text-emerald-400", bg: "bg-emerald-500/15" };
  if (val >= q2) return { label: "Q2", color: "text-blue-400", bg: "bg-blue-500/15" };
  if (val >= q1) return { label: "Q3", color: "text-amber-400", bg: "bg-amber-500/15" };
  return { label: "Q4", color: "text-red-400", bg: "bg-red-500/15" };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl text-xs max-w-52">
      <p className="font-semibold text-foreground mb-1 truncate">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill || p.color }}>
          {p.name}: {p.value?.toLocaleString?.("pt-BR") ?? p.value}
        </p>
      ))}
    </div>
  );
};

export default function AgentDayPage() {
  const { filters } = useDashboard();
  const [sortKey, setSortKey] = useState<SortKey>("chamadasAtendidas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [ufFilter, setUfFilter] = useState("all");
  const [quartilFilter, setQuartilFilter] = useState("all");
  const [turnoFilter, setTurnoFilter] = useState("all");
  const [celulaFilter, setCelulaFilter] = useState("all");
  const [supervisorFilter, setSupervisorFilter] = useState("all");
  const exportRef = useRef<HTMLDivElement>(null);
  const tableExportRef = useRef<HTMLDivElement>(null);

  const { data: rows = [], isLoading } = trpc.dashboard.getAgentDay.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
    agente: filters.agente || undefined,
    uf: filters.uf || undefined,
  });

  const ufs = useMemo(() => {
    const set = new Set(rows.map(r => r.uf).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [rows]);

  // Listas únicas do dimensionamento
  const turnos = useMemo(() => {
    const set = new Set(rows.map((r: any) => r.turno).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [rows]);

  const celulas = useMemo(() => {
    const set = new Set(rows.map((r: any) => r.celula).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [rows]);

  const supervisores = useMemo(() => {
    const set = new Set(rows.map((r: any) => r.supervisorDim).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [rows]);

  // Filtra BOTs: agentes sem login
  const humanRows = useMemo(() =>
    rows.filter(r => r.login && r.login.trim() !== ""),
    [rows]
  );

  // Calcula quartis baseados em chamadas atendidas
  const quartiles = useMemo(() => {
    const vals = humanRows.map(r => r.chamadasAtendidas ?? 0);
    return calcQuartiles(vals);
  }, [humanRows]);

  // Enriquece cada linha com seu quartil
  const rowsWithQuartil = useMemo(() =>
    humanRows.map(r => ({
      ...r,
      _quartil: getQuartilLabel(r.chamadasAtendidas ?? 0, quartiles.q1, quartiles.q2, quartiles.q3),
    })),
    [humanRows, quartiles]
  );

  const filtered = useMemo(() => {
    let data = [...rowsWithQuartil];
    if (search) data = data.filter(r =>
      r.agente?.toLowerCase().includes(search.toLowerCase()) ||
      r.login?.toLowerCase().includes(search.toLowerCase())
    );
    if (ufFilter && ufFilter !== "all") data = data.filter(r => r.uf === ufFilter);
    if (quartilFilter && quartilFilter !== "all") data = data.filter(r => r._quartil.label === quartilFilter);
    if (turnoFilter && turnoFilter !== "all") data = data.filter((r: any) => r.turno === turnoFilter);
    if (celulaFilter && celulaFilter !== "all") data = data.filter((r: any) => r.celula === celulaFilter);
    if (supervisorFilter && supervisorFilter !== "all") data = data.filter((r: any) => r.supervisorDim === supervisorFilter);
    data.sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0;
      const bv = (b as any)[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return data;
  }, [rowsWithQuartil, search, ufFilter, quartilFilter, turnoFilter, celulaFilter, supervisorFilter, sortKey, sortDir]);

  // Agrupamento por quartil para os gráficos
  const quartilGroups = useMemo(() => {
    const groups: Record<string, typeof rowsWithQuartil> = { Q1: [], Q2: [], Q3: [], Q4: [] };
    for (const r of rowsWithQuartil) groups[r._quartil.label].push(r);
    return groups;
  }, [rowsWithQuartil]);

  // Dados para gráfico de barras por quartil (médias)
  const quartilChartData = useMemo(() => {
    return ["Q1", "Q2", "Q3", "Q4"].map(q => {
      const group = quartilGroups[q];
      const n = group.length || 1;
      return {
        quartil: q,
        "Chamadas": Math.round(group.reduce((s, r) => s + (r.chamadasAtendidas ?? 0), 0) / n),
        "CPC": Math.round(group.reduce((s, r) => s + (r.contatoEfetivo ?? 0), 0) / n),
        "Tab. Sucesso": Math.round(group.reduce((s, r) => s + (r.tabulacoesSucesso ?? 0), 0) / n),
        "Sucesso Neg.": Math.round(group.reduce((s, r) => s + (r.tabulacoesSucessoNegocio ?? 0), 0) / n),
        "Idle (min)": Math.round(group.reduce((s, r) => s + ((r as any).idleSeg ?? 0), 0) / n / 60),
        count: group.length,
      };
    });
  }, [quartilGroups]);

  const top5 = useMemo(() =>
    [...rowsWithQuartil].sort((a, b) => (b.chamadasAtendidas ?? 0) - (a.chamadasAtendidas ?? 0)).slice(0, 5),
    [rowsWithQuartil]
  );
  const bottom5 = useMemo(() =>
    [...rowsWithQuartil].filter(r => (r.chamadasAtendidas ?? 0) > 0)
      .sort((a, b) => (a.chamadasAtendidas ?? 0) - (b.chamadasAtendidas ?? 0)).slice(0, 5),
    [rowsWithQuartil]
  );
  const topIdle = useMemo(() =>
    [...rowsWithQuartil].sort((a, b) => ((b as any).idleSeg ?? 0) - ((a as any).idleSeg ?? 0)).slice(0, 5),
    [rowsWithQuartil]
  );
  const topPausas = useMemo(() =>
    [...rowsWithQuartil].filter(r => r.pausasImprodutivas && r.pausasImprodutivas !== "00:00:00")
      .sort((a, b) => timeToSec(b.pausasImprodutivas) - timeToSec(a.pausasImprodutivas)).slice(0, 5),
    [rowsWithQuartil]
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const exportPng = async (ref: React.RefObject<HTMLDivElement | null>, filename: string) => {
    if (!ref.current) { toast.error("Nada para exportar"); return; }
    try {
      toast.info("Gerando imagem...");
      const url = await toPng(ref.current, {
        backgroundColor: "#0f1117",
        pixelRatio: 2,
        skipFonts: true,
        cacheBust: true,
        style: { borderRadius: "0" }
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      toast.success("Imagem exportada com sucesso");
    } catch (e) {
      toast.error("Erro ao exportar imagem");
    }
  };

  const handleExportTable = () => exportPng(tableExportRef, `performance-tabela-${new Date().toISOString().slice(0, 10)}.png`);
  const handleExportQuartil = () => exportPng(exportRef, `performance-quartil-${new Date().toISOString().slice(0, 10)}.png`);

  const QUARTIL_COLORS: Record<string, string> = {
    Q1: "#22c55e", Q2: "#3b82f6", Q3: "#f59e0b", Q4: "#ef4444"
  };

  // Colunas da tabela — nova ordem: KPIs primeiro, depois volumes, depois tempos
  // Ordem: Agente | T.Logado (%) | Idle | TMA | %CPC | CPC# | %SucNeg | SucNeg# | Chamadas | Tab.Suc | Pausas Improd.
  const cols: { key: SortKey; label: string; align?: string; tooltip?: string }[] = [
    { key: "agente", label: "Agente" },
    { key: "tempoLogado", label: "T. Logado", align: "text-center", tooltip: "Tempo logado + % da jornada (8h)" },
    { key: "idleSeg", label: "Idle", align: "text-center", tooltip: "Tempo Ocioso ÷ Chamadas Atendidas" },
    { key: "tmaSeg", label: "TMA", align: "text-center", tooltip: "Tempo Médio de Atendimento = Tempo Falado ÷ Chamadas" },
    { key: "cpcPct", label: "% CPC", align: "text-right", tooltip: "CPC ÷ Chamadas Atendidas × 100" },
    { key: "contatoEfetivo", label: "CPC", align: "text-right", tooltip: "Contato Pessoal Confirmado (numérico)" },
    { key: "sucessoNegPct", label: "% Suc.Neg", align: "text-right", tooltip: "Sucesso Negócio ÷ CPC × 100" },
    { key: "tabulacoesSucessoNegocio", label: "Suc.Neg", align: "text-right" },
    { key: "chamadasAtendidas", label: "Chamadas", align: "text-right" },
    { key: "tabulacoesSucesso", label: "Tab. Suc.", align: "text-right" },
    { key: "pausasImprodutivas", label: "P. Improd.", align: "text-right" },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Performance em Tempo Real</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Relatório AgentDay — {humanRows.length} agentes
            {rows.length - humanRows.length > 0 ? ` · ${rows.length - humanRows.length} BOTs excluídos` : ""}
            {" · "}Q1 ≥ {quartiles.q3} · Q2 ≥ {quartiles.q2} · Q3 ≥ {quartiles.q1}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportTable} variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" /> PNG Tabela
          </Button>
          <Button onClick={handleExportQuartil} variant="outline" size="sm" className="gap-2 border-primary/40 text-primary hover:bg-primary/10">
            <Award className="w-4 h-4" /> PNG Quartil
          </Button>
        </div>
      </div>

      <Tabs defaultValue="tabela">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="tabela" className="gap-2">
            <ChevronsUpDown className="w-3.5 h-3.5" /> Tabela Completa
          </TabsTrigger>
          <TabsTrigger value="quartil" className="gap-2">
            <Award className="w-3.5 h-3.5" /> Análise por Quartil
          </TabsTrigger>
        </TabsList>

        {/* ── Aba: Tabela Completa ── */}
        <TabsContent value="tabela" className="space-y-4 mt-4">
          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar agente ou login..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-card border-border"
              />
            </div>
            <Select value={turnoFilter} onValueChange={setTurnoFilter}>
              <SelectTrigger className="w-36 bg-card border-border">
                <SelectValue placeholder="Turno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Turnos</SelectItem>
                {turnos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={celulaFilter} onValueChange={setCelulaFilter}>
              <SelectTrigger className="w-40 bg-card border-border">
                <SelectValue placeholder="Célula" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Células</SelectItem>
                {celulas.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={supervisorFilter} onValueChange={setSupervisorFilter}>
              <SelectTrigger className="w-40 bg-card border-border">
                <SelectValue placeholder="Supervisor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Supervisores</SelectItem>
                {supervisores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ufFilter} onValueChange={setUfFilter}>
              <SelectTrigger className="w-28 bg-card border-border">
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas UFs</SelectItem>
                {ufs.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={quartilFilter} onValueChange={setQuartilFilter}>
              <SelectTrigger className="w-36 bg-card border-border">
                <SelectValue placeholder="Quartil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Quartis</SelectItem>
                <SelectItem value="Q1">Q1 — Melhores</SelectItem>
                <SelectItem value="Q2">Q2 — Acima da Média</SelectItem>
                <SelectItem value="Q3">Q3 — Abaixo da Média</SelectItem>
                <SelectItem value="Q4">Q4 — Ofensores</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Área exportável da tabela completa */}
          <div ref={tableExportRef} className="bg-[#0f1117] rounded-xl space-y-3 p-4">
            {/* Cabeçalho do PNG da tabela */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-1">
              <div>
                <h3 className="text-sm font-bold text-foreground">Performance em Tempo Real — Tabela Completa</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  {" · "}{filtered.length} agentes
                  {turnoFilter !== "all" && ` · Turno: ${turnoFilter}`}
                  {celulaFilter !== "all" && ` · Célula: ${celulaFilter}`}
                </p>
              </div>
              <div className="flex gap-2">
                {(["Q1","Q2","Q3","Q4"] as const).map(q => (
                  <div key={q} className={`text-xs font-bold px-2 py-0.5 rounded ${
                    q==="Q1" ? "bg-emerald-500/20 text-emerald-400" :
                    q==="Q2" ? "bg-blue-500/20 text-blue-400" :
                    q==="Q3" ? "bg-amber-500/20 text-amber-400" :
                    "bg-red-500/20 text-red-400"
                  }`}>{q}: {quartilGroups[q].length}</div>
                ))}
              </div>
            </div>

            {/* Tabela */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full data-table">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-10">Q</th>
                      {cols.map(col => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          title={col.tooltip}
                          className={`px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none ${col.align || "text-left"}`}
                        >
                          <div className={`flex items-center gap-1 ${col.align === "text-right" ? "justify-end" : col.align === "text-center" ? "justify-center" : ""}`}>
                            {col.label}
                            <SortIcon col={col.key} sortKey={sortKey} dir={sortDir} />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {Array.from({ length: 13 }).map((_, j) => (
                            <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground text-sm">
                          Nenhum dado disponível. Importe um relatório AgentDay.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row, i) => {
                        const r = row as any;
                        return (
                          <tr key={row.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2.5">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${row._quartil.bg} ${row._quartil.color}`}>
                                {row._quartil.label}
                              </span>
                            </td>
                            {/* Agente */}
                            <td className="px-3 py-2.5 min-w-[140px]">
                              <div>
                                <p className="text-sm font-medium text-foreground leading-tight">{row.agente}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <p className="text-xs text-muted-foreground">{row.login}</p>
                                  {r.turno && <span className="text-[10px] px-1 py-0 rounded bg-primary/10 text-primary font-mono">{r.turno}</span>}
                                  {r.celula && <span className="text-[10px] px-1 py-0 rounded bg-blue-500/10 text-blue-400 font-mono truncate max-w-[80px]">{r.celula}</span>}
                                </div>
                              </div>
                            </td>
                            {/* T. Logado + % */}
                            <td className="px-3 py-2.5 text-center">
                              <div>
                                <span className="text-sm text-foreground font-mono">{row.tempoLogado || "—"}</span>
                                {r.tempoLogadoPct > 0 && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">{r.tempoLogadoPct}%</div>
                                )}
                              </div>
                            </td>
                            {/* Idle */}
                            <td className="px-3 py-2.5 text-center">
                              <span className={`text-sm font-mono ${r.idleSeg > 120 ? "text-amber-400 font-semibold" : "text-foreground"}`}>
                                {r.idleSeg > 0 ? secToMS(r.idleSeg) : "—"}
                              </span>
                            </td>
                            {/* TMA */}
                            <td className="px-3 py-2.5 text-center">
                              <span className="text-sm font-mono text-foreground">
                                {r.tmaSeg > 0 ? secToMS(r.tmaSeg) : "—"}
                              </span>
                            </td>
                            {/* % CPC */}
                            <td className="px-3 py-2.5 text-right">
                              <span className={`text-sm font-semibold tabular-nums ${r.cpcPct >= 30 ? "text-emerald-400" : r.cpcPct >= 15 ? "text-amber-400" : "text-red-400"}`}>
                                {r.cpcPct > 0 ? `${r.cpcPct}%` : "—"}
                              </span>
                            </td>
                            {/* CPC numérico */}
                            <td className="px-3 py-2.5 text-right">
                              <span className="text-sm font-semibold text-emerald-400 tabular-nums">{(row.contatoEfetivo ?? 0).toLocaleString("pt-BR")}</span>
                            </td>
                            {/* % Sucesso Neg */}
                            <td className="px-3 py-2.5 text-right">
                              <span className={`text-sm font-semibold tabular-nums ${r.sucessoNegPct >= 20 ? "text-violet-400" : r.sucessoNegPct >= 10 ? "text-amber-400" : "text-muted-foreground"}`}>
                                {r.sucessoNegPct > 0 ? `${r.sucessoNegPct}%` : "—"}
                              </span>
                            </td>
                            {/* Sucesso Neg numérico */}
                            <td className="px-3 py-2.5 text-right">
                              <span className="text-sm text-violet-400 tabular-nums">{(row.tabulacoesSucessoNegocio ?? 0).toLocaleString("pt-BR")}</span>
                            </td>
                            {/* Chamadas */}
                            <td className="px-3 py-2.5 text-right">
                              <span className="text-sm font-semibold text-blue-400 tabular-nums">{(row.chamadasAtendidas ?? 0).toLocaleString("pt-BR")}</span>
                            </td>
                            {/* Tab. Sucesso */}
                            <td className="px-3 py-2.5 text-right">
                              <span className="text-sm text-cyan-400 tabular-nums">{(row.tabulacoesSucesso ?? 0).toLocaleString("pt-BR")}</span>
                            </td>
                            {/* Pausas Improdutivas */}
                            <td className="px-3 py-2.5 text-right">
                              <span className={`text-sm tabular-nums font-mono font-semibold ${timeToSec(row.pausasImprodutivas) > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                                {row.pausasImprodutivas ?? "00:00:00"}
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
          </div>{/* fim tableExportRef */}
        </TabsContent>

        {/* ── Aba: Análise por Quartil ── */}
        <TabsContent value="quartil" className="space-y-5 mt-4" forceMount>
          {/* Cards de resumo por quartil */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
              const group = quartilGroups[q];
              const labels: Record<string, { text: string; desc: string }> = {
                Q1: { text: "Melhores", desc: "Acima do 3º quartil" },
                Q2: { text: "Acima da Média", desc: "Entre Q2 e Q3" },
                Q3: { text: "Abaixo da Média", desc: "Entre Q1 e Q2" },
                Q4: { text: "Ofensores", desc: "Abaixo do 1º quartil" },
              };
              const avgIdle = group.length > 0
                ? Math.round(group.reduce((s, r) => s + ((r as any).idleSeg ?? 0), 0) / group.length)
                : 0;
              const avgTma = group.length > 0
                ? Math.round(group.reduce((s, r) => s + ((r as any).tmaSeg ?? 0), 0) / group.length)
                : 0;
              const avgCpcPct = group.length > 0
                ? Math.round(group.reduce((s, r) => s + ((r as any).cpcPct ?? 0), 0) / group.length * 10) / 10
                : 0;
              return (
                <div key={q} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      q === "Q1" ? "bg-emerald-500/15 text-emerald-400" :
                      q === "Q2" ? "bg-blue-500/15 text-blue-400" :
                      q === "Q3" ? "bg-amber-500/15 text-amber-400" :
                      "bg-red-500/15 text-red-400"
                    }`}>{q}</span>
                    <span className="text-xs text-muted-foreground">{group.length} agentes</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{labels[q].text}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{labels[q].desc}</p>
                  <div className="mt-3 pt-3 border-t border-border space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Média chamadas</span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {group.length > 0 ? Math.round(group.reduce((s, r) => s + (r.chamadasAtendidas ?? 0), 0) / group.length).toLocaleString("pt-BR") : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">% CPC médio</span>
                      <span className={`font-semibold tabular-nums ${avgCpcPct >= 30 ? "text-emerald-400" : avgCpcPct >= 15 ? "text-amber-400" : "text-red-400"}`}>
                        {avgCpcPct > 0 ? `${avgCpcPct}%` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Idle médio</span>
                      <span className={`font-semibold font-mono tabular-nums ${avgIdle > 120 ? "text-amber-400" : "text-foreground"}`}>
                        {avgIdle > 0 ? secToMS(avgIdle) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">TMA médio</span>
                      <span className="font-semibold font-mono tabular-nums text-foreground">
                        {avgTma > 0 ? secToMS(avgTma) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gráficos de médias por quartil */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-400" /> Chamadas e CPC — Média por Quartil
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={quartilChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" vertical={false} />
                  <XAxis dataKey="quartil" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Chamadas" radius={[4, 4, 0, 0]}>
                    {quartilChartData.map((entry) => (
                      <Cell key={entry.quartil} fill={QUARTIL_COLORS[entry.quartil]} fillOpacity={0.85} />
                    ))}
                    <LabelList dataKey="Chamadas" position="top" style={{ fill: "oklch(0.7 0.01 240)", fontSize: 10 }} />
                  </Bar>
                  <Bar dataKey="CPC" fill="#22c55e" radius={[4, 4, 0, 0]} fillOpacity={0.6}>
                    <LabelList dataKey="CPC" position="top" style={{ fill: "oklch(0.7 0.01 240)", fontSize: 10 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" /> Tab. Sucesso e Sucesso Neg. — Média por Quartil
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={quartilChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" vertical={false} />
                  <XAxis dataKey="quartil" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Tab. Sucesso" fill="#06b6d4" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="Tab. Sucesso" position="top" style={{ fill: "oklch(0.7 0.01 240)", fontSize: 10 }} />
                  </Bar>
                  <Bar dataKey="Sucesso Neg." fill="#a855f7" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="Sucesso Neg." position="top" style={{ fill: "oklch(0.7 0.01 240)", fontSize: 10 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico Idle */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Idle Médio por Quartil (seg/chamada)
            </h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={quartilChartData} layout="vertical" margin={{ top: 0, right: 60, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} />
                <YAxis type="category" dataKey="quartil" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 11 }} width={30} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Idle (min)" radius={[0, 4, 4, 0]}>
                  {quartilChartData.map((entry) => (
                    <Cell key={entry.quartil} fill={QUARTIL_COLORS[entry.quartil]} fillOpacity={0.7} />
                  ))}
                  <LabelList dataKey="Idle (min)" position="right" style={{ fill: "oklch(0.7 0.01 240)", fontSize: 10 }} formatter={(v: number) => `${v} min`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela de agentes por quartil — área exportável */}
          <div ref={exportRef} className="bg-[#0f1117] rounded-xl p-6 space-y-5 border border-border">
            {/* Cabeçalho do PNG */}
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Performance em Tempo Real — Resumo por Quartil</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              </div>
              <div className="flex gap-2">
                {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => (
                  <div key={q} className={`text-xs font-bold px-2 py-1 rounded ${
                    q === "Q1" ? "bg-emerald-500/20 text-emerald-400" :
                    q === "Q2" ? "bg-blue-500/20 text-blue-400" :
                    q === "Q3" ? "bg-amber-500/20 text-amber-400" :
                    "bg-red-500/20 text-red-400"
                  }`}>{q}: {quartilGroups[q].length}</div>
                ))}
              </div>
            </div>

            {/* Grid de 4 quartis */}
            <div className="grid grid-cols-2 gap-4">
              {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                const group = quartilGroups[q].slice(0, 8);
                const qLabels: Record<string, string> = {
                  Q1: "Melhores Agentes", Q2: "Acima da Média",
                  Q3: "Abaixo da Média", Q4: "Ofensores"
                };
                const qColors: Record<string, string> = {
                  Q1: "text-emerald-400", Q2: "text-blue-400",
                  Q3: "text-amber-400", Q4: "text-red-400"
                };
                return (
                  <div key={q} className="bg-card/50 rounded-lg p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        q === "Q1" ? "bg-emerald-500/15 text-emerald-400" :
                        q === "Q2" ? "bg-blue-500/15 text-blue-400" :
                        q === "Q3" ? "bg-amber-500/15 text-amber-400" :
                        "bg-red-500/15 text-red-400"
                      }`}>{q}</span>
                      <span className={`text-sm font-semibold ${qColors[q]}`}>{qLabels[q]}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{quartilGroups[q].length} agentes</span>
                    </div>
                    {/* Mini tabela */}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="pb-1.5 text-left text-muted-foreground font-medium">Agente</th>
                          <th className="pb-1.5 text-right text-muted-foreground font-medium">Cham.</th>
                          <th className="pb-1.5 text-right text-muted-foreground font-medium">%CPC</th>
                          <th className="pb-1.5 text-right text-muted-foreground font-medium">Idle</th>
                          <th className="pb-1.5 text-right text-muted-foreground font-medium">TMA</th>
                          <th className="pb-1.5 text-right text-muted-foreground font-medium">%SN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((r, idx) => {
                          const rr = r as any;
                          return (
                            <tr key={r.id} className={`border-b border-border/20 ${idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"}`}>
                              <td className="py-1.5 text-foreground font-medium truncate max-w-[100px]">{r.agente?.split(" ").slice(0, 2).join(" ")}</td>
                              <td className="py-1.5 text-right text-blue-400 tabular-nums font-semibold">{(r.chamadasAtendidas ?? 0).toLocaleString("pt-BR")}</td>
                              <td className={`py-1.5 text-right tabular-nums font-semibold ${rr.cpcPct >= 30 ? "text-emerald-400" : rr.cpcPct >= 15 ? "text-amber-400" : "text-red-400"}`}>
                                {rr.cpcPct > 0 ? `${rr.cpcPct}%` : "—"}
                              </td>
                              <td className={`py-1.5 text-right font-mono tabular-nums ${rr.idleSeg > 120 ? "text-amber-400" : "text-muted-foreground"}`}>
                                {rr.idleSeg > 0 ? secToMS(rr.idleSeg) : "—"}
                              </td>
                              <td className="py-1.5 text-right font-mono tabular-nums text-foreground">
                                {rr.tmaSeg > 0 ? secToMS(rr.tmaSeg) : "—"}
                              </td>
                              <td className={`py-1.5 text-right tabular-nums ${rr.sucessoNegPct >= 20 ? "text-violet-400" : "text-muted-foreground"}`}>
                                {rr.sucessoNegPct > 0 ? `${rr.sucessoNegPct}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                        {group.length === 0 && (
                          <tr><td colSpan={6} className="py-3 text-center text-muted-foreground">Sem agentes neste quartil</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            {/* Rodapé com top ofensores */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
              <div>
                <h4 className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Top 5 — Maior Idle (seg/chamada)
                </h4>
                {topIdle.map((r, i) => {
                  const rr = r as any;
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-2 py-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                        <span className="text-xs text-foreground truncate">{r.agente?.split(" ").slice(0, 2).join(" ")}</span>
                      </div>
                      <span className="text-xs font-mono font-semibold text-amber-400 shrink-0">{rr.idleSeg > 0 ? secToMS(rr.idleSeg) : "—"}</span>
                    </div>
                  );
                })}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Top 5 — Maior Pausa Improdutiva
                </h4>
                {topPausas.length > 0 ? topPausas.map((r, i) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 py-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <span className="text-xs text-foreground truncate">{r.agente?.split(" ").slice(0, 2).join(" ")}</span>
                    </div>
                    <span className="text-xs font-mono font-semibold text-red-400 shrink-0">{r.pausasImprodutivas}</span>
                  </div>
                )) : <p className="text-xs text-muted-foreground">Nenhuma pausa improdutiva registrada</p>}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
