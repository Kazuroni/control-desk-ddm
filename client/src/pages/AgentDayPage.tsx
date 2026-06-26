import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import { ChevronUp, ChevronDown, ChevronsUpDown, Download, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toPng } from "html-to-image";
import { toast } from "sonner";

type SortKey = "agente" | "chamadasAtendidas" | "contatoEfetivo" | "tempoLogado" | "tempoOcioso" | "tabulacoesSucesso" | "pausasImprodutivas" | "tabulacoesSucessoNegocio";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-muted-foreground/50" />;
  return dir === "asc" ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
}

export default function AgentDayPage() {
  const { filters } = useDashboard();
  const [sortKey, setSortKey] = useState<SortKey>("chamadasAtendidas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [ufFilter, setUfFilter] = useState("all");
  const exportRef = useRef<HTMLDivElement>(null);

  const { data: rows = [], isLoading } = trpc.dashboard.getAgentDay.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
    agente: filters.agente || undefined,
    uf: filters.uf || undefined,
  });

  const ufs = useMemo(() => {
    const set = new Set(rows.map(r => r.uf).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [rows]);

  const filtered = useMemo(() => {
    let data = [...rows];
    if (search) data = data.filter(r => r.agente?.toLowerCase().includes(search.toLowerCase()) || r.login?.toLowerCase().includes(search.toLowerCase()));
    if (ufFilter && ufFilter !== "all") data = data.filter(r => r.uf === ufFilter);
    data.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return data;
  }, [rows, search, ufFilter, sortKey, sortDir]);

  const top5 = useMemo(() => filtered.slice(0, 5), [filtered]);
  const bottom5 = useMemo(() => [...filtered].sort((a, b) => (a.chamadasAtendidas ?? 0) - (b.chamadasAtendidas ?? 0)).slice(0, 5), [filtered]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const handleExport = async () => {
    if (!exportRef.current) return;
    try {
      const url = await toPng(exportRef.current, { backgroundColor: "#1a1d2e", pixelRatio: 2 });
      const a = document.createElement("a"); a.href = url; a.download = "performance-tempo-real.png"; a.click();
      toast.success("Imagem exportada com sucesso");
    } catch { toast.error("Erro ao exportar imagem"); }
  };

  const cols: { key: SortKey; label: string; align?: string }[] = [
    { key: "agente", label: "Agente" },
    { key: "chamadasAtendidas", label: "Chamadas", align: "text-right" },
    { key: "contatoEfetivo", label: "Contatos", align: "text-right" },
    { key: "tempoLogado", label: "Tempo Logado", align: "text-center" },
    { key: "tempoOcioso", label: "Tempo Ocioso", align: "text-center" },
    { key: "tabulacoesSucesso", label: "Tab. Sucesso", align: "text-right" },
    { key: "tabulacoesSucessoNegocio", label: "Sucesso Neg.", align: "text-right" },
    { key: "pausasImprodutivas", label: "Pausas Improd.", align: "text-right" },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Performance em Tempo Real</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Relatório AgentDay — {filtered.length} agentes
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" /> Exportar PNG
        </Button>
      </div>

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
        <Select value={ufFilter} onValueChange={setUfFilter}>
          <SelectTrigger className="w-32 bg-card border-border">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas UFs</SelectItem>
            {ufs.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                {cols.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none ${col.align || "text-left"}`}
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
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    Nenhum dado disponível. Importe um relatório AgentDay.
                  </td>
                </tr>
              ) : (
                filtered.map((row, i) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{row.agente}</p>
                        <p className="text-xs text-muted-foreground">{row.login}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-blue-400 tabular-nums">{(row.chamadasAtendidas ?? 0).toLocaleString("pt-BR")}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-emerald-400 tabular-nums">{(row.contatoEfetivo ?? 0).toLocaleString("pt-BR")}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-foreground font-mono">{row.tempoLogado || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-mono ${(row.tempoOcioso || "00:00:00") > "00:30:00" ? "text-amber-400" : "text-foreground"}`}>
                        {row.tempoOcioso || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-cyan-400 tabular-nums">{(row.tabulacoesSucesso ?? 0).toLocaleString("pt-BR")}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-violet-400 tabular-nums">{(row.tabulacoesSucessoNegocio ?? 0).toLocaleString("pt-BR")}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm tabular-nums font-semibold ${(row.pausasImprodutivas ?? 0) > 3 ? "text-red-400" : "text-foreground"}`}>
                        {(row.pausasImprodutivas ?? 0).toLocaleString("pt-BR")}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumo exportável */}
      {filtered.length > 0 && (
        <div ref={exportRef} className="grid grid-cols-2 gap-4 p-6 bg-card border border-border rounded-xl">
          <div>
            <h4 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Top 5 — Mais Chamadas
            </h4>
            <div className="space-y-2">
              {top5.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4 tabular-nums">{i + 1}.</span>
                    <span className="text-sm text-foreground truncate max-w-40">{r.agente}</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-400 tabular-nums">{(r.chamadasAtendidas ?? 0).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              Top 5 — Menos Chamadas
            </h4>
            <div className="space-y-2">
              {bottom5.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4 tabular-nums">{i + 1}.</span>
                    <span className="text-sm text-foreground truncate max-w-40">{r.agente}</span>
                  </div>
                  <span className="text-sm font-bold text-red-400 tabular-nums">{(r.chamadasAtendidas ?? 0).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
