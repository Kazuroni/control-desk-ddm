import { useRef, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Download, Search, TrendingUp, Users, LayoutGrid } from "lucide-react";
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

export default function CampaignAgentPage() {
  const { filters } = useDashboard();
  const [search, setSearch] = useState("");
  const [searchAgente, setSearchAgente] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalChamadas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sortKeyAgente, setSortKeyAgente] = useState<SortKey>("totalChamadas");
  const [sortDirAgente, setSortDirAgente] = useState<SortDir>("desc");
  const exportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = trpc.dashboard.getCampaignAgent.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
    campanha: filters.campanha || undefined,
    supervisor: filters.supervisor || undefined,
  });

  const campanhaChart = data?.campanhaChart ?? [];
  const agenteCampanhaList = data?.agenteCampanhaList ?? [];

  // Visão por campanha — filtro + ordenação
  const filteredCampanhas = useMemo(() => {
    let list = campanhaChart.filter(c =>
      !search ||
      c.campanha.toLowerCase().includes(search.toLowerCase()) ||
      c.supervisores.toLowerCase().includes(search.toLowerCase())
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
  }, [campanhaChart, search, sortKey, sortDir]);

  // Visão por agente/célula — filtro + ordenação
  const filteredAgentes = useMemo(() => {
    let list = agenteCampanhaList.filter(r =>
      !searchAgente ||
      r.agente.toLowerCase().includes(searchAgente.toLowerCase()) ||
      r.campanha.toLowerCase().includes(searchAgente.toLowerCase()) ||
      r.nomeSupervisor.toLowerCase().includes(searchAgente.toLowerCase())
    );
    list = [...list].sort((a, b) => {
      const aVal = sortKeyAgente === "conv"
        ? (a.totalChamadas > 0 ? a.totalContatos / a.totalChamadas : 0)
        : (a as any)[sortKeyAgente] ?? 0;
      const bVal = sortKeyAgente === "conv"
        ? (b.totalChamadas > 0 ? b.totalContatos / b.totalChamadas : 0)
        : (b as any)[sortKeyAgente] ?? 0;
      if (typeof aVal === "string") return sortDirAgente === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDirAgente === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [agenteCampanhaList, searchAgente, sortKeyAgente, sortDirAgente]);

  const barData = useMemo(() =>
    filteredCampanhas.slice(0, 12).map(c => ({
      name: c.campanha.length > 16 ? c.campanha.slice(0, 16) + "\u2026" : c.campanha,
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
      const url = await toPng(exportRef.current, { backgroundColor: "#1a1d2e", pixelRatio: 2 });
      const a = document.createElement("a"); a.href = url; a.download = "performance-celula-campanha.png"; a.click();
      toast.success("Imagem exportada com sucesso");
    } catch { toast.error("Erro ao exportar imagem"); }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const toggleSortAgente = (key: SortKey) => {
    if (sortKeyAgente === key) setSortDirAgente(d => d === "asc" ? "desc" : "asc");
    else { setSortKeyAgente(key); setSortDirAgente("desc"); }
  };

  const SortIcon = ({ k, cur, dir }: { k: SortKey; cur: SortKey; dir: SortDir }) =>
    cur === k ? <span className="ml-1 text-[10px]">{dir === "asc" ? "\u25b2" : "\u25bc"}</span> : null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Performance por C\u00e9lula/Campanha</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Relat\u00f3rio CampaignAgent \u2014 {campanhaChart.length} campanhas \u00b7 {agenteCampanhaList.length} combina\u00e7\u00f5es agente/c\u00e9lula
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" /> Exportar PNG
        </Button>
      </div>

      <Tabs defaultValue="campanha">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="campanha" className="gap-2">
            <LayoutGrid className="w-3.5 h-3.5" /> Por Campanha
          </TabsTrigger>
          <TabsTrigger value="agente" className="gap-2">
            <Users className="w-3.5 h-3.5" /> Por Agente/C\u00e9lula
          </TabsTrigger>
        </TabsList>

        {/* ── Aba: Por Campanha ── */}
        <TabsContent value="campanha" className="space-y-4 mt-4">
          {/* Gr\u00e1fico */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Comparativo por Campanha (Top 12)</h3>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : barData.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                Sem dados dispon\u00edveis. Importe um relat\u00f3rio CampaignAgent.
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

          {/* Filtro + tabela */}
          <div className="space-y-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar campanha ou supervisor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
            </div>
            <div ref={exportRef} className="bg-card border border-border rounded-xl overflow-hidden">
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
                          onClick={() => !col.noSort && toggleSort(col.key)}
                          className={`px-4 py-3 text-${col.align} text-xs font-semibold text-muted-foreground uppercase tracking-wider ${!col.noSort ? "cursor-pointer hover:text-foreground select-none" : ""}`}
                        >
                          {col.label}
                          {!col.noSort && <SortIcon k={col.key} cur={sortKey} dir={sortDir} />}
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
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">Nenhum dado dispon\u00edvel.</td></tr>
                    ) : filteredCampanhas.map(c => {
                      const conv = c.totalChamadas > 0 ? ((c.totalContatos / c.totalChamadas) * 100).toFixed(1) : "0.0";
                      const convNum = parseFloat(conv);
                      return (
                        <tr key={c.campanha} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                          <td className="px-4 py-3"><span className="text-sm font-medium text-foreground">{c.campanha}</span></td>
                          <td className="px-4 py-3"><span className="text-xs text-muted-foreground truncate max-w-40 block">{c.supervisores || "\u2014"}</span></td>
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
                <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-emerald-400" /><h3 className="text-sm font-semibold text-foreground">Top 5 \u2014 Mais Chamadas</h3></div>
                <div className="space-y-2">
                  {[...filteredCampanhas].sort((a, b) => b.totalChamadas - a.totalChamadas).slice(0, 5).map((c, i) => (
                    <div key={c.campanha} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0"><span className="text-xs text-muted-foreground w-4 tabular-nums shrink-0">{i + 1}.</span><span className="text-sm text-foreground truncate">{c.campanha}</span></div>
                      <span className="text-sm font-bold text-blue-400 tabular-nums shrink-0">{c.totalChamadas.toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-amber-400" /><h3 className="text-sm font-semibold text-foreground">Top 5 \u2014 Maior Convers\u00e3o</h3></div>
                <div className="space-y-2">
                  {[...filteredCampanhas].filter(c => c.totalChamadas > 0).map(c => ({ ...c, conv: (c.totalContatos / c.totalChamadas) * 100 })).sort((a, b) => b.conv - a.conv).slice(0, 5).map((c, i) => (
                    <div key={c.campanha} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0"><span className="text-xs text-muted-foreground w-4 tabular-nums shrink-0">{i + 1}.</span><span className="text-sm text-foreground truncate">{c.campanha}</span></div>
                      <span className="text-sm font-bold text-amber-400 tabular-nums shrink-0">{c.conv.toFixed(1)} %</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Aba: Por Agente/C\u00e9lula ── */}
        <TabsContent value="agente" className="space-y-4 mt-4">
          <div className="space-y-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar agente, c\u00e9lula ou supervisor..." value={searchAgente} onChange={e => setSearchAgente(e.target.value)} className="pl-9 bg-card border-border" />
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full data-table">
                  <thead>
                    <tr className="border-b border-border">
                      {[
                        { key: "agente" as SortKey, label: "Agente", align: "left" },
                        { key: "campanha" as SortKey, label: "C\u00e9lula/Campanha", align: "left" },
                        { key: "campanha" as SortKey, label: "Supervisor", align: "left", noSort: true },
                        { key: "totalChamadas" as SortKey, label: "Chamadas", align: "right" },
                        { key: "totalContatos" as SortKey, label: "Contatos", align: "right" },
                        { key: "tabulacoesSucesso" as SortKey, label: "Tab. Sucesso", align: "right" },
                        { key: "tabulacoesSucessoNegocio" as SortKey, label: "Sucesso Neg.", align: "right" },
                        { key: "conv" as SortKey, label: "Conv. %", align: "right" },
                      ].map(col => (
                        <th
                          key={col.label}
                          onClick={() => !col.noSort && toggleSortAgente(col.key)}
                          className={`px-4 py-3 text-${col.align} text-xs font-semibold text-muted-foreground uppercase tracking-wider ${!col.noSort ? "cursor-pointer hover:text-foreground select-none" : ""}`}
                        >
                          {col.label}
                          {!col.noSort && <SortIcon k={col.key} cur={sortKeyAgente} dir={sortDirAgente} />}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}
                        </tr>
                      ))
                    ) : filteredAgentes.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">Nenhum dado dispon\u00edvel.</td></tr>
                    ) : filteredAgentes.map((r, idx) => {
                      const conv = r.totalChamadas > 0 ? ((r.totalContatos / r.totalChamadas) * 100).toFixed(1) : "0.0";
                      const convNum = parseFloat(conv);
                      return (
                        <tr key={`${r.agente}||${r.campanha}||${idx}`} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                          <td className="px-4 py-3"><span className="text-sm font-medium text-foreground">{r.agente}</span></td>
                          <td className="px-4 py-3"><span className="text-sm text-violet-400">{r.campanha}</span></td>
                          <td className="px-4 py-3"><span className="text-xs text-muted-foreground truncate max-w-36 block">{r.nomeSupervisor || "\u2014"}</span></td>
                          <td className="px-4 py-3 text-right"><span className="text-sm font-semibold text-blue-400 tabular-nums">{r.totalChamadas.toLocaleString("pt-BR")}</span></td>
                          <td className="px-4 py-3 text-right"><span className="text-sm font-semibold text-emerald-400 tabular-nums">{r.totalContatos.toLocaleString("pt-BR")}</span></td>
                          <td className="px-4 py-3 text-right"><span className="text-sm text-cyan-400 tabular-nums">{r.tabulacoesSucesso.toLocaleString("pt-BR")}</span></td>
                          <td className="px-4 py-3 text-right"><span className="text-sm text-amber-400 tabular-nums">{r.tabulacoesSucessoNegocio.toLocaleString("pt-BR")}</span></td>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
