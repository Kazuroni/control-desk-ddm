import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  Download, Search, Users, AlertTriangle, UserX, BarChart3, ChevronDown, ChevronUp, ChevronsUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toPng } from "html-to-image";
import { toast } from "sonner";

type ViewMode = "agente" | "campanha" | "supervisor";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
  return sortDir === "desc" ? <ChevronDown className="w-3 h-3 text-orange-400" /> : <ChevronUp className="w-3 h-3 text-orange-400" />;
}

export default function FaltasPage() {
  const { filters } = useDashboard();
  const [viewMode, setViewMode] = useState<ViewMode>("agente");
  const [campanhaFilter, setCampanhaFilter] = useState("all");
  const [supervisorFilter, setSupervisorFilter] = useState("all");
  const [turnoFilter, setTurnoFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("faltas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const exportRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);

  // AgentDay: quem logou
  const { data: rows = [], isLoading } = trpc.dashboard.getAgentDay.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
  });

  // Dimensionamento: todos os ativos
  const { data: dimAll = [], isLoading: dimLoading } = trpc.dimensionamento.list.useQuery({ status: "ATIVO" });

  // Quem NÃO LOGOU = faltou
  const faltosos = useMemo(() => {
    const humanRows = rows.filter(r => r.login && r.login.trim() !== "");
    const logadosNomes = new Set(humanRows.map(r => (r.agente || "").trim().toUpperCase()));
    const logadosLogins = new Set(humanRows.map(r => (r.login || "").trim().toLowerCase()).filter(Boolean));
    return dimAll.filter(d => {
      const nomeUp = (d.nome || "").trim().toUpperCase();
      const loginLow = (d.login || "").trim().toLowerCase();
      return !logadosNomes.has(nomeUp) && !(loginLow && logadosLogins.has(loginLow));
    });
  }, [dimAll, rows]);

  // Listas únicas para filtros
  const campanhas = useMemo(() => {
    const s = new Set(faltosos.map(d => d.celula || "").filter(Boolean));
    return Array.from(s).sort();
  }, [faltosos]);
  const supervisores = useMemo(() => {
    const s = new Set(faltosos.map(d => d.supervisor || "").filter(Boolean));
    return Array.from(s).sort();
  }, [faltosos]);
  const turnos = useMemo(() => {
    const s = new Set(faltosos.map(d => d.turno || "").filter(Boolean));
    return Array.from(s).sort();
  }, [faltosos]);

  // Filtrar faltosos
  const faltososFiltrados = useMemo(() => {
    let d = faltosos;
    if (campanhaFilter !== "all") d = d.filter(r => (r.celula || "") === campanhaFilter);
    if (supervisorFilter !== "all") d = d.filter(r => (r.supervisor || "") === supervisorFilter);
    if (turnoFilter !== "all") d = d.filter(r => (r.turno || "") === turnoFilter);
    if (search) d = d.filter(r =>
      (r.nome || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.login || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.celula || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.supervisor || "").toLowerCase().includes(search.toLowerCase())
    );
    return d;
  }, [faltosos, campanhaFilter, supervisorFilter, turnoFilter, search]);

  // Agrupamento por campanha
  const porCampanha = useMemo(() => {
    const map = new Map<string, { campanha: string; faltas: number; supervisores: Set<string>; turnos: Set<string> }>();
    for (const d of faltososFiltrados) {
      const key = d.celula || "Sem campanha";
      if (!map.has(key)) map.set(key, { campanha: key, faltas: 0, supervisores: new Set(), turnos: new Set() });
      const entry = map.get(key)!;
      entry.faltas++;
      if (d.supervisor) entry.supervisores.add(d.supervisor);
      if (d.turno) entry.turnos.add(d.turno);
    }
    return Array.from(map.values());
  }, [faltososFiltrados]);

  // Agrupamento por supervisor
  const porSupervisor = useMemo(() => {
    const map = new Map<string, { supervisor: string; faltas: number; campanhas: Set<string>; agentes: string[] }>();
    for (const d of faltososFiltrados) {
      const key = d.supervisor || "Sem supervisor";
      if (!map.has(key)) map.set(key, { supervisor: key, faltas: 0, campanhas: new Set(), agentes: [] });
      const entry = map.get(key)!;
      entry.faltas++;
      if (d.celula) entry.campanhas.add(d.celula);
      entry.agentes.push(d.nome || "");
    }
    return Array.from(map.values());
  }, [faltososFiltrados]);

  function handleSort(col: string) {
    if (sortKey === col) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  }

  function sortRows<T extends Record<string, any>>(arr: T[]): T[] {
    return [...arr].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "desc" ? bv - av : av - bv;
      }
      return sortDir === "desc"
        ? String(bv).localeCompare(String(av), "pt-BR")
        : String(av).localeCompare(String(bv), "pt-BR");
    });
  }

  const totalFaltas = faltososFiltrados.length;
  const totalAtivos = dimAll.length;
  const taxaFalta = totalAtivos > 0 ? Math.round(totalFaltas / totalAtivos * 100) : 0;

  const dataHoraLabel = now.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  async function exportPng() {
    if (!exportRef.current) { toast.error("Nada para exportar"); return; }
    try {
      toast.info("Gerando imagem...");
      const url = await toPng(exportRef.current, {
        backgroundColor: "#0f1117",
        pixelRatio: 2,
        skipFonts: true,
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `faltas-carteira-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("Imagem exportada com sucesso");
    } catch {
      toast.error("Erro ao exportar imagem");
    }
  }

  const loading = isLoading || dimLoading;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Faltas por Carteira</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Operadores do dimensionamento que não logaram hoje — {totalFaltas} falta{totalFaltas !== 1 ? "s" : ""} de {totalAtivos} ativos ({taxaFalta}%)
          </p>
        </div>
        <Button onClick={exportPng} variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" /> Exportar PNG
        </Button>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className={`border rounded-xl p-4 ${totalFaltas > 0 ? "bg-red-500/5 border-red-500/30" : "bg-card border-border"}`}>
            <div className="flex items-center gap-2 mb-2">
              <UserX className="w-4 h-4 text-red-400" />
              <p className="text-xs text-muted-foreground">Total de Faltas</p>
            </div>
            <p className={`text-3xl font-black ${totalFaltas > 0 ? "text-red-400" : "text-foreground"}`}>{totalFaltas}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Operadores ausentes hoje</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-orange-400" />
              <p className="text-xs text-muted-foreground">Campanhas Afetadas</p>
            </div>
            <p className="text-3xl font-black text-orange-400">{porCampanha.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Com pelo menos 1 falta</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-purple-400" />
              <p className="text-xs text-muted-foreground">Supervisores com Gap</p>
            </div>
            <p className="text-3xl font-black text-purple-400">{porSupervisor.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Supervisores com ausências</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Modo de visão */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["agente", "campanha", "supervisor"] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => { setViewMode(v); setSortKey(v === "agente" ? "nome" : "faltas"); setSortDir("desc"); }}
              className={`px-3 py-2 text-xs font-semibold capitalize transition-colors border-r last:border-r-0 border-border ${
                viewMode === v ? "bg-orange-500/20 text-orange-300" : "text-muted-foreground hover:bg-card"
              }`}
            >
              {v === "agente" ? "Por Agente" : v === "campanha" ? "Por Campanha" : "Por Supervisor"}
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar agente, campanha ou supervisor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>

        {/* Filtros */}
        <Select value={campanhaFilter} onValueChange={setCampanhaFilter}>
          <SelectTrigger className="w-48 bg-card border-border">
            <SelectValue placeholder="Todas as campanhas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as campanhas</SelectItem>
            {campanhas.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={supervisorFilter} onValueChange={setSupervisorFilter}>
          <SelectTrigger className="w-44 bg-card border-border">
            <SelectValue placeholder="Todos os supervisores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os supervisores</SelectItem>
            {supervisores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={turnoFilter} onValueChange={setTurnoFilter}>
          <SelectTrigger className="w-36 bg-card border-border">
            <SelectValue placeholder="Todos os turnos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os turnos</SelectItem>
            {turnos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela exportável */}
      <div ref={exportRef} className="bg-[#0f1117] rounded-xl border border-border overflow-hidden">
        {/* Cabeçalho PNG */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0">DDM</div>
              <div>
                <p className="text-sm font-bold text-foreground">Faltas por Carteira</p>
                <p className="text-xs text-muted-foreground">Gerado em {dataHoraLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {campanhaFilter !== "all" && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-500/15 text-blue-300 font-medium">📁 {campanhaFilter}</span>
              )}
              {supervisorFilter !== "all" && (
                <span className="text-xs px-2 py-1 rounded-full bg-purple-500/15 text-purple-300 font-medium">👤 {supervisorFilter}</span>
              )}
              {turnoFilter !== "all" && (
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  turnoFilter === "MANHÃ" ? "bg-blue-500/15 text-blue-300" :
                  turnoFilter === "TARDE" ? "bg-orange-500/15 text-orange-300" :
                  "bg-purple-500/15 text-purple-300"
                }`}>🕐 {turnoFilter}</span>
              )}
              <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-300 font-semibold">
                ✗ {totalFaltas} Falta{totalFaltas !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 space-y-2">
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : totalFaltas === 0 ? (
          <div className="p-12 text-center">
            <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-foreground font-semibold">Nenhuma falta encontrada</p>
            <p className="text-muted-foreground text-sm mt-1">
              {faltosos.length === 0 ? "Todos os operadores ativos estão logados!" : "Nenhum resultado com os filtros aplicados."}
            </p>
          </div>
        ) : viewMode === "agente" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card/50">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">#</th>
                  {[
                    { key: "nome", label: "Agente" },
                    { key: "login", label: "Login" },
                    { key: "celula", label: "Campanha" },
                    { key: "supervisor", label: "Supervisor" },
                    { key: "turno", label: "Turno" },
                    { key: "entrada", label: "Horário Esperado" },
                  ].map(col => (
                    <th
                      key={col.key}
                      className="text-left px-4 py-3 text-muted-foreground font-medium text-xs cursor-pointer hover:text-foreground select-none"
                      onClick={() => handleSort(col.key)}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortRows(faltososFiltrados).map((d, i) => (
                  <tr key={i} className={`border-b border-border/50 hover:bg-red-500/5 ${i % 2 === 0 ? "" : "bg-card/10"}`}>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 text-foreground font-medium">{d.nome}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{d.login || "—"}</td>
                    <td className="px-4 py-2.5">
                      {d.celula
                        ? <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 text-xs">{d.celula}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{d.supervisor || "—"}</td>
                    <td className="px-4 py-2.5">
                      {d.turno
                        ? <span className={`px-1.5 py-0.5 rounded text-xs ${
                            d.turno === "MANHÃ" ? "bg-blue-500/15 text-blue-300" :
                            d.turno === "TARDE" ? "bg-orange-500/15 text-orange-300" :
                            "bg-purple-500/15 text-purple-300"
                          }`}>{d.turno}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-red-400">
                      {d.entrada && d.saida ? `${d.entrada} – ${d.saida}` : d.entrada || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === "campanha" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card/50">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">#</th>
                  {[
                    { key: "campanha", label: "Campanha" },
                    { key: "faltas", label: "Faltas" },
                    { key: "supervisores", label: "Supervisores" },
                    { key: "turnos", label: "Turnos" },
                  ].map(col => (
                    <th
                      key={col.key}
                      className="text-left px-4 py-3 text-muted-foreground font-medium text-xs cursor-pointer hover:text-foreground select-none"
                      onClick={() => handleSort(col.key)}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortRows(porCampanha.map(r => ({ ...r, supervisores: r.supervisores.size, turnos: Array.from(r.turnos).join(", ") }))).map((r, i) => (
                  <tr key={i} className={`border-b border-border/50 hover:bg-red-500/5 ${i % 2 === 0 ? "" : "bg-card/10"}`}>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 text-xs font-medium">{r.campanha}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-red-400 font-bold text-base">{r.faltas}</span>
                      <span className="text-muted-foreground text-xs ml-1">falta{r.faltas !== 1 ? "s" : ""}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.supervisores} supervisor{r.supervisores !== 1 ? "es" : ""}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.turnos || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card/50">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">#</th>
                  {[
                    { key: "supervisor", label: "Supervisor" },
                    { key: "faltas", label: "Faltas" },
                    { key: "campanhas", label: "Campanhas" },
                    { key: "agentes", label: "Operadores Ausentes" },
                  ].map(col => (
                    <th
                      key={col.key}
                      className="text-left px-4 py-3 text-muted-foreground font-medium text-xs cursor-pointer hover:text-foreground select-none"
                      onClick={() => handleSort(col.key)}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortRows(porSupervisor.map(r => ({ ...r, campanhas: r.campanhas.size }))).map((r, i) => (
                  <tr key={i} className={`border-b border-border/50 hover:bg-red-500/5 ${i % 2 === 0 ? "" : "bg-card/10"}`}>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-foreground font-semibold">{r.supervisor}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-red-400 font-bold text-base">{r.faltas}</span>
                      <span className="text-muted-foreground text-xs ml-1">falta{r.faltas !== 1 ? "s" : ""}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.campanhas} campanha{r.campanhas !== 1 ? "s" : ""}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {r.agentes.slice(0, 5).map((a, j) => (
                          <span key={j} className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 text-xs">{a}</span>
                        ))}
                        {r.agentes.length > 5 && (
                          <span className="px-1.5 py-0.5 rounded bg-card text-muted-foreground text-xs">+{r.agentes.length - 5}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
