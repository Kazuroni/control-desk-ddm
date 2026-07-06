import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  CheckCircle2, XCircle, Download, Search, LogIn, LogOut, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toPng } from "html-to-image";
import { toast } from "sonner";

export default function LoginLogoutPage() {
  const { filters } = useDashboard();
  const [loginTab, setLoginTab] = useState<"logados" | "nao_logados">("logados");
  const [campanhaFilter, setCampanhaFilter] = useState("all");
  const [search, setSearch] = useState("");
  const exportRef = useRef<HTMLDivElement>(null);

  // Dados do AgentDay (mesmo template da Performance em Tempo Real)
  const { data: rows = [], isLoading } = trpc.dashboard.getAgentDay.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
  });

  // Filtrar BOTs
  const humanRows = useMemo(() =>
    rows.filter(r => r.login && r.login.trim() !== ""),
    [rows]
  );

  // Quem LOGOU: está no AgentDay
  const logadosHoje = useMemo(() => humanRows.map(r => ({
    agente: r.agente || "",
    login: r.login || "",
    campanha: (r as any).celula || (r as any).produto || "",
    supervisor: (r as any).supervisorDim || "",
    primeiroLogin: r.primeiroLogin || "",
    ultimoLogout: r.ultimoLogout || "",
    tempoLogado: r.tempoLogado || "",
  })), [humanRows]);

  // Quem NÃO LOGOU: está no dimensionamento ativo mas não apareceu no AgentDay
  const { data: dimAll = [], isLoading: dimLoading } = trpc.dimensionamento.list.useQuery({ status: "ATIVO" });
  const naoLogados = useMemo(() => {
    const logadosNomes = new Set(humanRows.map(r => (r.agente || "").trim().toUpperCase()));
    const logadosLogins = new Set(humanRows.map(r => (r.login || "").trim().toLowerCase()).filter(Boolean));
    return dimAll.filter(d => {
      const nomeUp = (d.nome || "").trim().toUpperCase();
      const loginLow = (d.login || "").trim().toLowerCase();
      return !logadosNomes.has(nomeUp) && !(loginLow && logadosLogins.has(loginLow));
    });
  }, [dimAll, humanRows]);

  // Campanhas únicas para filtro
  const campanhasLogados = useMemo(() => {
    const s = new Set(logadosHoje.map(r => r.campanha).filter(Boolean));
    return Array.from(s).sort();
  }, [logadosHoje]);
  const campanhasNaoLogados = useMemo(() => {
    const s = new Set(naoLogados.map(r => r.celula || "").filter(Boolean));
    return Array.from(s).sort();
  }, [naoLogados]);

  const logadosFiltrados = useMemo(() => {
    let d = logadosHoje;
    if (campanhaFilter !== "all") d = d.filter(r => r.campanha === campanhaFilter);
    if (search) d = d.filter(r =>
      r.agente.toLowerCase().includes(search.toLowerCase()) ||
      r.login.toLowerCase().includes(search.toLowerCase())
    );
    return d;
  }, [logadosHoje, campanhaFilter, search]);

  const naoLogadosFiltrados = useMemo(() => {
    let d = naoLogados;
    if (campanhaFilter !== "all") d = d.filter(r => (r.celula || "") === campanhaFilter);
    if (search) d = d.filter(r =>
      (r.nome || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.login || "").toLowerCase().includes(search.toLowerCase())
    );
    return d;
  }, [naoLogados, campanhaFilter, search]);

  const taxaLogin = useMemo(() => {
    const total = logadosHoje.length + naoLogados.length;
    return total > 0 ? Math.round(logadosHoje.length / total * 100) : 0;
  }, [logadosHoje, naoLogados]);

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
      a.download = `login-logout-${new Date().toISOString().slice(0, 10)}.png`;
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
          <h2 className="text-xl font-bold text-foreground">Login &amp; Logout</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Controle de presença — {logadosHoje.length} logados · {naoLogados.length} ausentes
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
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <LogIn className="w-4 h-4 text-emerald-400" />
              <p className="text-xs text-muted-foreground">Logados Hoje</p>
            </div>
            <p className="text-3xl font-black text-emerald-400">{logadosHoje.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Aparecem no AgentDay</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <LogOut className="w-4 h-4 text-red-400" />
              <p className="text-xs text-muted-foreground">Não Logados</p>
            </div>
            <p className={`text-3xl font-black ${naoLogados.length > 0 ? "text-red-400" : "text-emerald-400"}`}>{naoLogados.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">No dimensionamento, sem login</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-400" />
              <p className="text-xs text-muted-foreground">Taxa de Login</p>
            </div>
            <p className="text-3xl font-black text-foreground">{taxaLogin}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">{logadosHoje.length} de {logadosHoje.length + naoLogados.length} ativos</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Toggle Logados / Não Logados */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => { setLoginTab("logados"); setCampanhaFilter("all"); setSearch(""); }}
            className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              loginTab === "logados" ? "bg-emerald-500/20 text-emerald-300" : "text-muted-foreground hover:bg-card"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Logados ({logadosHoje.length})
          </button>
          <button
            onClick={() => { setLoginTab("nao_logados"); setCampanhaFilter("all"); setSearch(""); }}
            className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors border-l border-border ${
              loginTab === "nao_logados" ? "bg-red-500/20 text-red-300" : "text-muted-foreground hover:bg-card"
            }`}
          >
            <XCircle className="w-3.5 h-3.5" /> Não Logados ({naoLogados.length})
          </button>
        </div>

        {/* Busca */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar agente ou login..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>

        {/* Filtro campanha */}
        <Select value={campanhaFilter} onValueChange={v => { setCampanhaFilter(v); }}>
          <SelectTrigger className="w-52 bg-card border-border">
            <SelectValue placeholder="Todas as campanhas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as campanhas</SelectItem>
            {(loginTab === "logados" ? campanhasLogados : campanhasNaoLogados).map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela exportável */}
      <div ref={exportRef} className="bg-[#0f1117] rounded-xl border border-border overflow-hidden">
        {/* Header do export */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">DDM</div>
            <div>
              <p className="text-sm font-bold text-foreground">Controle de Login &amp; Logout</p>
              <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
            loginTab === "logados" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
          }`}>
            {loginTab === "logados"
              ? `✓ ${logadosFiltrados.length} Logados`
              : `✗ ${naoLogadosFiltrados.length} Não Logados`}
          </span>
        </div>

        {loading ? (
          <div className="p-8 space-y-2">
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : loginTab === "logados" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card/50">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">#</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Agente</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Login</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Campanha</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Supervisor</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium text-xs">1º Login</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium text-xs">Últ. Logout</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium text-xs">T. Logado</th>
                </tr>
              </thead>
              <tbody>
                {logadosFiltrados.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum agente logado encontrado.</td></tr>
                ) : logadosFiltrados.map((r, i) => (
                  <tr key={i} className={`border-b border-border/50 hover:bg-card/30 ${i % 2 === 0 ? "" : "bg-card/10"}`}>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 text-foreground font-medium">{r.agente}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{r.login || "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.campanha
                        ? <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 text-xs">{r.campanha}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.supervisor || "—"}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-xs font-mono text-emerald-400">{r.primeiroLogin || "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-xs font-mono text-amber-400">{r.ultimoLogout || "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-xs font-mono text-foreground">{r.tempoLogado || "—"}</span>
                    </td>
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
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Agente</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Login</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Campanha</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Supervisor</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Turno</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">Horário</th>
                </tr>
              </thead>
              <tbody>
                {naoLogadosFiltrados.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">
                    {naoLogados.length === 0 ? "Todos os operadores ativos estão logados! ✓" : "Nenhum resultado com os filtros aplicados."}
                  </td></tr>
                ) : naoLogadosFiltrados.map((d, i) => (
                  <tr key={i} className={`border-b border-border/50 hover:bg-card/30 ${i % 2 === 0 ? "" : "bg-card/10"}`}>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 text-foreground font-medium">{d.nome}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{d.login || "—"}</td>
                    <td className="px-4 py-2.5">
                      {d.celula
                        ? <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 text-xs">{d.celula}</span>
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
                    <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">
                      {d.entrada && d.saida ? `${d.entrada}–${d.saida}` : "—"}
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
