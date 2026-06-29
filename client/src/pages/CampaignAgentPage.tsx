import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Download, Search, TrendingUp, Users, LayoutGrid, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toPng } from "html-to-image";
import { toast } from "sonner";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-foreground mb-1 max-w-48 truncate">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill || p.color }}>
          {p.name}: {Number(p.value).toLocaleString("pt-BR")}
        </p>
      ))}
    </div>
  );
};

type SortKey = "campanha" | "agente" | "totalChamadas" | "totalContatos" | "tabulacoesSucesso" | "tabulacoesSucessoNegocio" | "conv";
type SortDir = "asc" | "desc";

// Estrutura hierárquica: agente → lista de células
type AgenteComCelulas = {
  agente: string;
  nomeSupervisor: string;
  totalChamadas: number;
  totalContatos: number;
  tabulacoesSucesso: number;
  tabulacoesSucessoNegocio: number;
  celulas: {
    campanha: string;
    totalChamadas: number;
    totalContatos: number;
    tabulacoesSucesso: number;
    tabulacoesSucessoNegocio: number;
  }[];
};

export default function CampaignAgentPage() {
  const { filters } = useDashboard();
  const [search, setSearch] = useState("");
  const [searchAgente, setSearchAgente] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalChamadas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedAgentes, setExpandedAgentes] = useState<Set<string>>(new Set());
  const exportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = trpc.dashboard.getCampaignAgent.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
    campanha: filters.campanha || undefined,
    supervisor: filters.supervisor || undefined,
  });

  const campanhaChart = data?.campanhaChart ?? [];
  const agenteCampanhaList = data?.agenteCampanhaList ?? [];

  // Constrói estrutura hierárquica: agente → células
  const agenteHierarquia = useMemo((): AgenteComCelulas[] => {
    const byAgente: Record<string, AgenteComCelulas> = {};
    for (const row of agenteCampanhaList) {
      if (!row.agente) continue;
      if (!byAgente[row.agente]) {
        byAgente[row.agente] = {
          agente: row.agente,
          nomeSupervisor: row.nomeSupervisor || "",
          totalChamadas: 0,
          totalContatos: 0,
          tabulacoesSucesso: 0,
          tabulacoesSucessoNegocio: 0,
          celulas: [],
        };
      }
      byAgente[row.agente].totalChamadas += row.totalChamadas;
      byAgente[row.agente].totalContatos += row.totalContatos;
      byAgente[row.agente].tabulacoesSucesso += row.tabulacoesSucesso;
      byAgente[row.agente].tabulacoesSucessoNegocio += row.tabulacoesSucessoNegocio;
      byAgente[row.agente].celulas.push({
        campanha: row.campanha,
        totalChamadas: row.totalChamadas,
        totalContatos: row.totalContatos,
        tabulacoesSucesso: row.tabulacoesSucesso,
        tabulacoesSucessoNegocio: row.tabulacoesSucessoNegocio,
      });
    }
    return Object.values(byAgente);
  }, [agenteCampanhaList]);

  // Filtro + ordenação da hierarquia
  const filteredHierarquia = useMemo(() => {
    let list = agenteHierarquia.filter(a =>
      !searchAgente ||
      a.agente.toLowerCase().includes(searchAgente.toLowerCase()) ||
      a.nomeSupervisor.toLowerCase().includes(searchAgente.toLowerCase()) ||
      a.celulas.some(c => c.campanha.toLowerCase().includes(searchAgente.toLowerCase()))
    );
    list = [...list].sort((a, b) => {
      const aVal = sortKey === "conv"
        ? (a.totalChamadas > 0 ? a.totalContatos / a.totalChamadas : 0)
        : (a as any)[sortKey] ?? 0;
      const bVal = sortKey === "conv"
        ? (b.totalChamadas > 0 ? b.totalContatos / b.totalChamadas : 0)
        : (b as any)[sortKey] ?? 0;
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [agenteHierarquia, searchAgente, sortKey, sortDir]);

  // Visão por campanha — filtro + ordenação
  const [searchCampanha, setSearchCampanha] = useState("");
  const [sortCampKey, setSortCampKey] = useState<SortKey>("totalChamadas");
  const [sortCampDir, setSortCampDir] = useState<SortDir>("desc");

  const filteredCampanhas = useMemo(() => {
    let list = campanhaChart.filter(c =>
      !searchCampanha ||
      c.campanha.toLowerCase().includes(searchCampanha.toLowerCase()) ||
      c.supervisores.toLowerCase().includes(searchCampanha.toLowerCase())
    );
    list = [...list].sort((a, b) => {
      const aVal = sortCampKey === "conv"
        ? (a.totalChamadas > 0 ? a.totalContatos / a.totalChamadas : 0)
        : (a as any)[sortCampKey] ?? 0;
      const bVal = sortCampKey === "conv"
        ? (b.totalChamadas > 0 ? b.totalContatos / b.totalChamadas : 0)
        : (b as any)[sortCampKey] ?? 0;
      if (typeof aVal === "string") return sortCampDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortCampDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [campanhaChart, searchCampanha, sortCampKey, sortCampDir]);

  const barData = useMemo(() =>
    filteredCampanhas.slice(0, 12).map(c => ({
      name: c.campanha.length > 16 ? c.campanha.slice(0, 16) + "…" : c.campanha,
      fullName: c.campanha,
      "Chamadas": c.totalChamadas,
      "Contatos": c.totalContatos,
      "Tab. Sucesso": c.tabulacoesSucesso,
      "Sucesso Neg.": c.tabulacoesSucessoNegocio,
    })),
    [filteredCampanhas]
  );

  const handleExport = async () => {
    if (!exportRef.current) return;
    try {
      toast.info("Gerando imagem...");
      const url = await toPng(exportRef.current, { backgroundColor: "#0f1117", pixelRatio: 2, skipFonts: true, cacheBust: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = `performance-celula-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("Imagem exportada com sucesso");
    } catch { toast.error("Erro ao exportar imagem"); }
  };

  const toggleAgente = (agente: string) => {
    setExpandedAgentes(prev => {
      const next = new Set(prev);
      if (next.has(agente)) next.delete(agente);
      else next.add(agente);
      return next;
    });
  };

  const expandAll = () => setExpandedAgentes(new Set(filteredHierarquia.map(a => a.agente)));
  const collapseAll = () => setExpandedAgentes(new Set());

  const SortIcon = ({ k, cur, dir }: { k: SortKey; cur: SortKey; dir: SortDir }) =>
    cur === k ? <span className="ml-1 text-[10px]">{dir === "asc" ? "▲" : "▼"}</span> : null;

  const toggleSort = (key: SortKey, cur: SortKey, dir: SortDir, setKey: (k: SortKey) => void, setDir: (d: SortDir) => void) => {
    if (cur === key) setDir(dir === "asc" ? "desc" : "asc");
    else { setKey(key); setDir("desc"); }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Performance por Célula/Campanha</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Relatório CampaignAgent — {campanhaChart.length} campanhas · {agenteHierarquia.length} agentes
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" /> Exportar PNG
        </Button>
      </div>

      <Tabs defaultValue="agente">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="agente" className="gap-2">
            <Users className="w-3.5 h-3.5" /> Por Agente/Célula
          </TabsTrigger>
          <TabsTrigger value="campanha" className="gap-2">
            <LayoutGrid className="w-3.5 h-3.5" /> Por Campanha
          </TabsTrigger>
        </TabsList>

        {/* ── Aba: Por Agente/Célula (hierárquica, como ATTCEL) ── */}
        <TabsContent value="agente" className="space-y-4 mt-4">
          {/* Filtro + controles */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar agente, célula ou supervisor..."
                value={searchAgente}
                onChange={e => setSearchAgente(e.target.value)}
                className="pl-9 bg-card border-border"
              />
            </div>
            <Button variant="outline" size="sm" onClick={expandAll} className="text-xs">
              Expandir Todos
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs">
              Recolher Todos
            </Button>
          </div>

          {/* Tabela hierárquica */}
          <div ref={exportRef} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8"></th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("agente", sortKey, sortDir, setSortKey, setSortDir)}
                    >
                      Agentes <SortIcon k="agente" cur={sortKey} dir={sortDir} />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("totalChamadas", sortKey, sortDir, setSortKey, setSortDir)}
                    >
                      Total Chamadas <SortIcon k="totalChamadas" cur={sortKey} dir={sortDir} />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("totalContatos", sortKey, sortDir, setSortKey, setSortDir)}
                    >
                      CPC <SortIcon k="totalContatos" cur={sortKey} dir={sortDir} />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("tabulacoesSucesso", sortKey, sortDir, setSortKey, setSortDir)}
                    >
                      Tab. Sucesso <SortIcon k="tabulacoesSucesso" cur={sortKey} dir={sortDir} />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("tabulacoesSucessoNegocio", sortKey, sortDir, setSortKey, setSortDir)}
                    >
                      Sucesso Neg. <SortIcon k="tabulacoesSucessoNegocio" cur={sortKey} dir={sortDir} />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("conv", sortKey, sortDir, setSortKey, setSortDir)}
                    >
                      Conv. % <SortIcon k="conv" cur={sortKey} dir={sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}
                      </tr>
                    ))
                  ) : filteredHierarquia.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        Nenhum dado disponível. Importe um relatório CampaignAgent.
                      </td>
                    </tr>
                  ) : (
                    filteredHierarquia.map((agente) => {
                      const isExpanded = expandedAgentes.has(agente.agente);
                      const conv = agente.totalChamadas > 0
                        ? ((agente.totalContatos / agente.totalChamadas) * 100).toFixed(1)
                        : "0.0";
                      const convNum = parseFloat(conv);

                      return [
                        // Linha do agente (cabeçalho expandível)
                        <tr
                          key={`agente-${agente.agente}`}
                          className="border-b border-border/70 bg-accent/10 hover:bg-accent/20 cursor-pointer transition-colors"
                          onClick={() => toggleAgente(agente.agente)}
                        >
                          <td className="px-4 py-3 text-center">
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4 text-primary inline" />
                              : <ChevronRight className="w-4 h-4 text-muted-foreground inline" />
                            }
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{agente.agente}</p>
                              {agente.nomeSupervisor && (
                                <p className="text-xs text-muted-foreground mt-0.5">{agente.nomeSupervisor}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-bold text-blue-400 tabular-nums">{agente.totalChamadas.toLocaleString("pt-BR")}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-bold text-emerald-400 tabular-nums">{agente.totalContatos.toLocaleString("pt-BR")}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-cyan-400 tabular-nums">{agente.tabulacoesSucesso.toLocaleString("pt-BR")}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-amber-400 tabular-nums">{agente.tabulacoesSucessoNegocio.toLocaleString("pt-BR")}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-bold tabular-nums ${convNum >= 15 ? "text-emerald-400" : convNum >= 8 ? "text-amber-400" : "text-red-400"}`}>
                              {conv} %
                            </span>
                          </td>
                        </tr>,

                        // Linhas das células (expandíveis)
                        ...(isExpanded ? agente.celulas.map((celula, ci) => {
                          const celulaConv = celula.totalChamadas > 0
                            ? ((celula.totalContatos / celula.totalChamadas) * 100).toFixed(1)
                            : "0.0";
                          const celulaConvNum = parseFloat(celulaConv);
                          return (
                            <tr
                              key={`celula-${agente.agente}-${celula.campanha}-${ci}`}
                              className={`border-b border-border/30 transition-colors ${ci % 2 === 0 ? "bg-muted/5" : "bg-transparent"} hover:bg-accent/10`}
                            >
                              <td className="px-4 py-2.5"></td>
                              <td className="px-4 py-2.5 pl-10">
                                <span className="text-sm text-violet-300">{celula.campanha}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="text-sm text-blue-300/80 tabular-nums">{celula.totalChamadas.toLocaleString("pt-BR")}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="text-sm text-emerald-300/80 tabular-nums">{celula.totalContatos.toLocaleString("pt-BR")}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="text-sm text-cyan-300/80 tabular-nums">{celula.tabulacoesSucesso.toLocaleString("pt-BR")}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="text-sm text-amber-300/80 tabular-nums">{celula.tabulacoesSucessoNegocio.toLocaleString("pt-BR")}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`text-sm tabular-nums ${celulaConvNum >= 15 ? "text-emerald-300/80" : celulaConvNum >= 8 ? "text-amber-300/80" : "text-red-300/80"}`}>
                                  {celulaConv} %
                                </span>
                              </td>
                            </tr>
                          );
                        }) : []),
                      ];
                    })
                  )}
                </tbody>
                {/* Totais gerais */}
                {filteredHierarquia.length > 0 && !isLoading && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20">
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase">Total Geral</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-blue-400 tabular-nums">
                          {filteredHierarquia.reduce((s, a) => s + a.totalChamadas, 0).toLocaleString("pt-BR")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-emerald-400 tabular-nums">
                          {filteredHierarquia.reduce((s, a) => s + a.totalContatos, 0).toLocaleString("pt-BR")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-cyan-400 tabular-nums">
                          {filteredHierarquia.reduce((s, a) => s + a.tabulacoesSucesso, 0).toLocaleString("pt-BR")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-amber-400 tabular-nums">
                          {filteredHierarquia.reduce((s, a) => s + a.tabulacoesSucessoNegocio, 0).toLocaleString("pt-BR")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const totalCham = filteredHierarquia.reduce((s, a) => s + a.totalChamadas, 0);
                          const totalCont = filteredHierarquia.reduce((s, a) => s + a.totalContatos, 0);
                          const pct = totalCham > 0 ? ((totalCont / totalCham) * 100).toFixed(1) : "0.0";
                          const pctNum = parseFloat(pct);
                          return (
                            <span className={`text-sm font-bold tabular-nums ${pctNum >= 15 ? "text-emerald-400" : pctNum >= 8 ? "text-amber-400" : "text-red-400"}`}>
                              {pct} %
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Aba: Por Campanha ── */}
        <TabsContent value="campanha" className="space-y-4 mt-4">
          {/* Gráfico */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Comparativo por Campanha (Top 12)</h3>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : barData.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                Sem dados disponíveis. Importe um relatório CampaignAgent.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} margin={{ top: 0, right: 10, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.012 240)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: "oklch(0.55 0.01 240)", fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.55 0.01 240)", paddingTop: 8 }} />
                  <Bar dataKey="Chamadas" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Contatos" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Tab. Sucesso" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Sucesso Neg." fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Filtro + tabela por campanha */}
          <div className="space-y-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar campanha ou supervisor..."
                value={searchCampanha}
                onChange={e => setSearchCampanha(e.target.value)}
                className="pl-9 bg-card border-border"
              />
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full data-table">
                  <thead>
                    <tr className="border-b border-border">
                      {[
                        { key: "campanha" as SortKey, label: "Campanha", align: "left" },
                        { key: "campanha" as SortKey, label: "Supervisor(es)", align: "left", noSort: true },
                        { key: "totalChamadas" as SortKey, label: "Chamadas", align: "right" },
                        { key: "totalContatos" as SortKey, label: "Contatos", align: "right" },
                        { key: "tabulacoesSucesso" as SortKey, label: "Tab. Sucesso", align: "right" },
                        { key: "tabulacoesSucessoNegocio" as SortKey, label: "Sucesso Neg.", align: "right" },
                        { key: "conv" as SortKey, label: "Conv. %", align: "right" },
                      ].map(col => (
                        <th
                          key={col.label}
                          onClick={() => !col.noSort && toggleSort(col.key, sortCampKey, sortCampDir, setSortCampKey, setSortCampDir)}
                          className={`px-4 py-3 text-${col.align} text-xs font-semibold text-muted-foreground uppercase tracking-wider ${!col.noSort ? "cursor-pointer hover:text-foreground select-none" : ""}`}
                        >
                          {col.label}
                          {!col.noSort && <SortIcon k={col.key} cur={sortCampKey} dir={sortCampDir} />}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}
                        </tr>
                      ))
                    ) : filteredCampanhas.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">Nenhum dado disponível.</td></tr>
                    ) : filteredCampanhas.map(c => {
                      const conv = c.totalChamadas > 0 ? ((c.totalContatos / c.totalChamadas) * 100).toFixed(1) : "0.0";
                      const convNum = parseFloat(conv);
                      return (
                        <tr key={c.campanha} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                          <td className="px-4 py-3"><span className="text-sm font-medium text-foreground">{c.campanha}</span></td>
                          <td className="px-4 py-3"><span className="text-xs text-muted-foreground truncate max-w-40 block">{c.supervisores || "—"}</span></td>
                          <td className="px-4 py-3 text-right"><span className="text-sm font-semibold text-blue-400 tabular-nums">{c.totalChamadas.toLocaleString("pt-BR")}</span></td>
                          <td className="px-4 py-3 text-right"><span className="text-sm font-semibold text-emerald-400 tabular-nums">{c.totalContatos.toLocaleString("pt-BR")}</span></td>
                          <td className="px-4 py-3 text-right"><span className="text-sm text-cyan-400 tabular-nums">{c.tabulacoesSucesso.toLocaleString("pt-BR")}</span></td>
                          <td className="px-4 py-3 text-right"><span className="text-sm text-amber-400 tabular-nums">{c.tabulacoesSucessoNegocio.toLocaleString("pt-BR")}</span></td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-semibold tabular-nums ${convNum >= 15 ? "text-emerald-400" : convNum >= 8 ? "text-amber-400" : "text-red-400"}`}>{conv} %</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Top 5 */}
          {filteredCampanhas.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-foreground">Top 5 — Mais Chamadas</h3>
                </div>
                <div className="space-y-2">
                  {[...filteredCampanhas].sort((a, b) => b.totalChamadas - a.totalChamadas).slice(0, 5).map((c, i) => (
                    <div key={c.campanha} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground w-4 tabular-nums shrink-0">{i + 1}.</span>
                        <span className="text-sm text-foreground truncate">{c.campanha}</span>
                      </div>
                      <span className="text-sm font-bold text-blue-400 tabular-nums shrink-0">{c.totalChamadas.toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-foreground">Top 5 — Maior Conversão</h3>
                </div>
                <div className="space-y-2">
                  {[...filteredCampanhas]
                    .filter(c => c.totalChamadas > 0)
                    .map(c => ({ ...c, conv: (c.totalContatos / c.totalChamadas) * 100 }))
                    .sort((a, b) => b.conv - a.conv)
                    .slice(0, 5)
                    .map((c, i) => (
                      <div key={c.campanha} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground w-4 tabular-nums shrink-0">{i + 1}.</span>
                          <span className="text-sm text-foreground truncate">{c.campanha}</span>
                        </div>
                        <span className="text-sm font-bold text-amber-400 tabular-nums shrink-0">{c.conv.toFixed(1)} %</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
