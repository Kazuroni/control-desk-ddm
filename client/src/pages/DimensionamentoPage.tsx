import { useState, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Users, Search, Plus, Pencil, Trash2, Download, FileSpreadsheet,
  Image, Filter, Building2, Clock, MapPin, ChevronDown, ChevronUp, X,
  Upload, CheckCircle2, AlertCircle, Loader2, AlertTriangle, UserPlus
} from "lucide-react";
import { toPng } from "html-to-image";
import * as XLSX from "xlsx";

// UF → Estado completo
const UF_ESTADOS: Record<string, string> = {
  SP: "São Paulo",
  RJ: "Rio de Janeiro",
  MG: "Minas Gerais",
  RS: "Rio Grande do Sul",
  PR: "Paraná",
  SC: "Santa Catarina",
  BA: "Bahia",
  GO: "Goiás",
  ES: "Espírito Santo",
  DF: "Distrito Federal",
};

const STATUS_COLORS: Record<string, string> = {
  ATIVO: "bg-green-500/20 text-green-400 border-green-500/30",
  INATIVO: "bg-red-500/20 text-red-400 border-red-500/30",
  TO: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  AFASTADO: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const TURNO_COLORS: Record<string, string> = {
  MANHÃ: "bg-blue-500/20 text-blue-300",
  TARDE: "bg-orange-500/20 text-orange-300",
  INTEGRAL: "bg-purple-500/20 text-purple-300",
};

const EMPTY_FORM = {
  nome: "", login: "", loginOlos: "", email: "", supervisor: "",
  admissao: "", nascimento: "", cpf: "", funcao: "", cargo: "",
  departamento: "", uf: "", status: "ATIVO", discador: "", celula: "",
  skill: "", turno: "", escalaHora: "", escala: "", entrada: "", saida: "",
  entradaS: "", saidaS: "",
};

// ─── Cruzamento AgentDay x Dimensionamento ──────────────────────────────────────────────────────────────────────
function CrossCheckTab() {
  const utils = trpc.useUtils();
  const { data: sessions } = trpc.dashboard.getSessions.useQuery({ reportType: "AgentDay" });
  const latestAgentDaySession = useMemo(() => {
    if (!sessions || sessions.length === 0) return undefined;
    return sessions[0]?.id;
  }, [sessions]);

  const { data, isLoading } = trpc.dimensionamento.crossCheck.useQuery(
    { sessionIds: latestAgentDaySession ? [latestAgentDaySession] : undefined },
    { enabled: true }
  );

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterCampanha, setFilterCampanha] = useState("all");
  const [filterSupervisorCC, setFilterSupervisorCC] = useState("all");
  const [searchCC, setSearchCC] = useState("");

  const createMutation = trpc.dimensionamento.create.useMutation({
    onSuccess: () => {
      utils.dimensionamento.list.invalidate();
      utils.dimensionamento.stats.invalidate();
      utils.dimensionamento.crossCheck.invalidate();
      toast.success("Operador adicionado ao dimensionamento!");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const nao = useMemo(() => data?.naoNoDimensionamento ?? [], [data]);

  // Listas únicas para filtros
  const campanhasCC = useMemo(() => {
    const s = new Set(nao.map(a => a.campanha).filter(Boolean));
    return Array.from(s).sort() as string[];
  }, [nao]);
  const supervisoresCC = useMemo(() => {
    const s = new Set(nao.map((a: any) => a.supervisor).filter(Boolean));
    return Array.from(s).sort() as string[];
  }, [nao]);

  const naoFiltrado = useMemo(() => {
    let d = nao;
    if (filterCampanha !== "all") d = d.filter(a => a.campanha === filterCampanha);
    if (filterSupervisorCC !== "all") d = d.filter((a: any) => a.supervisor === filterSupervisorCC);
    if (searchCC) d = d.filter(a => a.agente?.toLowerCase().includes(searchCC.toLowerCase()) || a.login?.toLowerCase().includes(searchCC.toLowerCase()));
    return d;
  }, [nao, filterCampanha, filterSupervisorCC, searchCC]);

  const allSelected = naoFiltrado.length > 0 && naoFiltrado.every((_, i) => selectedIds.has(i));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(naoFiltrado.map((_, i) => i)));
    }
  }

  function toggleOne(i: number) {
    const next = new Set(selectedIds);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelectedIds(next);
  }

  function addToDimensionamento(a: { agente: string; login: string; campanha: string; uf: string }) {
    createMutation.mutate({
      nome: a.agente,
      login: a.login || undefined,
      uf: a.uf || undefined,
      celula: a.campanha || undefined,
      status: "ATIVO",
    });
  }

  async function addSelectedInBatch() {
    const toAdd = naoFiltrado.filter((_, i) => selectedIds.has(i));
    if (toAdd.length === 0) return;
    const toastId = toast.loading(`Adicionando ${toAdd.length} operador(es)...`);
    let ok = 0;
    let fail = 0;
    for (const a of toAdd) {
      try {
        await createMutation.mutateAsync({
          nome: a.agente,
          login: a.login || undefined,
          uf: a.uf || undefined,
          celula: a.campanha || undefined,
          status: "ATIVO",
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setSelectedIds(new Set());
    // Atualiza todas as listas automaticamente
    utils.dimensionamento.list.invalidate();
    utils.dimensionamento.stats.invalidate();
    utils.dimensionamento.crossCheck.invalidate();
    toast.dismiss(toastId);
    if (fail === 0) {
      toast.success(`✓ ${ok} operador(es) adicionado(s) ao dimensionamento com sucesso!`, { duration: 4000 });
    } else {
      toast.warning(`${ok} adicionado(s), ${fail} com erro. Verifique duplicatas.`, { duration: 5000 });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Cruzando dados...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/8 bg-white/3 p-4">
          <p className="text-xs text-gray-400 mb-1">Agentes no AgentDay</p>
          <p className="text-2xl font-black text-white">{data?.totalAgentDay ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">Sessão mais recente</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/3 p-4">
          <p className="text-xs text-gray-400 mb-1">No Dimensionamento</p>
          <p className="text-2xl font-black text-white">{data?.totalDimensionamento ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">Cadastros ativos</p>
        </div>
        <div className={`rounded-xl border p-4 ${nao.length > 0 ? "border-orange-500/30 bg-orange-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
          <p className="text-xs text-gray-400 mb-1">Não Cadastrados</p>
          <p className={`text-2xl font-black ${nao.length > 0 ? "text-orange-400" : "text-emerald-400"}`}>{nao.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">{nao.length === 0 ? "Todos cadastrados!" : "Precisam ser adicionados"}</p>
        </div>
      </div>

      {/* Tabela de não cadastrados */}
      {nao.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-white font-semibold">Todos os agentes estão cadastrados!</p>
          <p className="text-gray-400 text-sm mt-1">Nenhum agente do AgentDay está fora do dimensionamento.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-orange-500/20 overflow-hidden">
          {/* Toolbar com filtros */}
          <div className="px-4 py-3 bg-orange-500/5 border-b border-orange-500/15 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="text-sm font-semibold text-orange-300">{nao.length} agente{nao.length !== 1 ? "s" : ""} sem cadastro no Dimensionamento</span>
              {selectedIds.size > 0 && (
                <Button
                  size="sm"
                  onClick={addSelectedInBatch}
                  disabled={createMutation.isPending}
                  className="ml-auto gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs h-7"
                >
                  <UserPlus className="w-3 h-3" />
                  Adicionar {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
                </Button>
              )}
            </div>
            {/* Filtros */}
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <Input
                  placeholder="Buscar agente ou login..."
                  value={searchCC}
                  onChange={e => setSearchCC(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white/5 border-white/10"
                />
              </div>
              <Select value={filterCampanha} onValueChange={setFilterCampanha}>
                <SelectTrigger className="w-44 h-8 text-xs bg-white/5 border-white/10">
                  <SelectValue placeholder="Todas as campanhas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as campanhas</SelectItem>
                  {campanhasCC.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {supervisoresCC.length > 0 && (
                <Select value={filterSupervisorCC} onValueChange={setFilterSupervisorCC}>
                  <SelectTrigger className="w-44 h-8 text-xs bg-white/5 border-white/10">
                    <SelectValue placeholder="Todos os supervisores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os supervisores</SelectItem>
                    {supervisoresCC.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {(filterCampanha !== "all" || filterSupervisorCC !== "all" || searchCC) && (
                <Button size="sm" variant="ghost" onClick={() => { setFilterCampanha("all"); setFilterSupervisorCC("all"); setSearchCC(""); }} className="h-8 text-xs text-gray-400 hover:text-white px-2">
                  <X className="w-3.5 h-3.5" /> Limpar
                </Button>
              )}
            </div>
            {naoFiltrado.length !== nao.length && (
              <p className="text-xs text-gray-500">Exibindo {naoFiltrado.length} de {nao.length} agentes</p>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded accent-orange-500 cursor-pointer"
                    title="Selecionar todos"
                  />
                </th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Agente</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Login</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Produto/Célula</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">UF</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium text-xs">Ação</th>
              </tr>
            </thead>
            <tbody>
              {naoFiltrado.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-500 text-sm">Nenhum agente encontrado com os filtros aplicados.</td></tr>
              ) : naoFiltrado.map((a, i) => (
                <tr key={i} className={`border-b border-white/5 hover:bg-white/3 ${selectedIds.has(i) ? "bg-orange-500/8" : i % 2 === 0 ? "" : "bg-white/2"}`}>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(i)}
                      onChange={() => toggleOne(i)}
                      className="w-4 h-4 rounded accent-orange-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{a.agente}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{a.login || "—"}</td>
                  <td className="px-4 py-3 text-gray-300 text-xs">{a.campanha || "—"}</td>
                  <td className="px-4 py-3 text-blue-300 text-xs font-medium">{a.uf || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addToDimensionamento(a)}
                      disabled={createMutation.isPending}
                      className="gap-1.5 border-orange-500/30 text-orange-300 hover:bg-orange-500/10 hover:text-orange-200 text-xs h-7"
                    >
                      <UserPlus className="w-3 h-3" />
                      Adicionar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DimensionamentoPage() {
  const [search, setSearch] = useState("");
  const [filterCelula, setFilterCelula] = useState("all");
  const [filterSupervisor, setFilterSupervisor] = useState("all");
  const [filterTurno, setFilterTurno] = useState("all");
  const [filterUf, setFilterUf] = useState("all");
  const [filterStatus, setFilterStatus] = useState("ATIVO");
  const [viewMode, setViewMode] = useState<"tabela" | "celulas" | "cruzamento">("tabela");
  const [showFilters, setShowFilters] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number; errors: string[]; sheetName: string; totalRows: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  const { data: stats } = trpc.dimensionamento.stats.useQuery();
  const { data: operadores = [], isLoading } = trpc.dimensionamento.list.useQuery({
    celula: filterCelula !== "all" ? filterCelula : undefined,
    supervisor: filterSupervisor !== "all" ? filterSupervisor : undefined,
    turno: filterTurno !== "all" ? filterTurno : undefined,
    uf: filterUf !== "all" ? filterUf : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
    search: search || undefined,
  });

  const createMutation = trpc.dimensionamento.create.useMutation({
    onSuccess: () => {
      utils.dimensionamento.list.invalidate();
      utils.dimensionamento.stats.invalidate();
      setDialogOpen(false);
      setForm({ ...EMPTY_FORM });
      toast.success("Operador adicionado com sucesso!");
    },
    onError: (e) => toast.error("Erro ao adicionar: " + e.message),
  });

  const updateMutation = trpc.dimensionamento.update.useMutation({
    onSuccess: () => {
      utils.dimensionamento.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      toast.success("Operador atualizado com sucesso!");
    },
    onError: (e) => toast.error("Erro ao atualizar: " + e.message),
  });

  const deleteMutation = trpc.dimensionamento.delete.useMutation({
    onSuccess: () => {
      utils.dimensionamento.list.invalidate();
      utils.dimensionamento.stats.invalidate();
      setDeleteConfirm(null);
      toast.success("Operador removido.");
    },
    onError: (e) => toast.error("Erro ao remover: " + e.message),
  });

  // Agrupamento por célula
  const porCelula = useMemo(() => {
    const map: Record<string, typeof operadores> = {};
    for (const op of operadores) {
      const cel = op.celula || "Sem Célula";
      if (!map[cel]) map[cel] = [];
      map[cel].push(op);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [operadores]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(op: any) {
    setEditingId(op.id);
    setForm({
      nome: op.nome || "",
      login: op.login || "",
      loginOlos: op.loginOlos?.toString() || "",
      email: op.email || "",
      supervisor: op.supervisor || "",
      admissao: op.admissao || "",
      nascimento: op.nascimento || "",
      cpf: op.cpf || "",
      funcao: op.funcao || "",
      cargo: op.cargo || "",
      departamento: op.departamento || "",
      uf: op.uf || "",
      status: op.status || "ATIVO",
      discador: op.discador || "",
      celula: op.celula || "",
      skill: op.skill || "",
      turno: op.turno || "",
      escalaHora: op.escalaHora || "",
      escala: op.escala || "",
      entrada: op.entrada || "",
      saida: op.saida || "",
      entradaS: op.entradaS || "",
      saidaS: op.saidaS || "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const payload = {
      ...form,
      loginOlos: form.loginOlos ? parseInt(form.loginOlos) : undefined,
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  // Exportar Excel
  function exportExcel() {
    const rows = operadores.map(op => ({
      Nome: op.nome,
      Login: op.login,
      "Login OLOS": op.loginOlos,
      Email: op.email,
      Supervisor: op.supervisor,
      Célula: op.celula,
      Skill: op.skill,
      Turno: op.turno,
      UF: op.uf ? `${op.uf} - ${UF_ESTADOS[op.uf] || op.uf}` : "",
      Status: op.status,
      Cargo: op.cargo,
      Função: op.funcao,
      Entrada: op.entrada,
      Saída: op.saida,
      Escala: op.escala,
      Admissão: op.admissao,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dimensionamento");
    XLSX.writeFile(wb, `dimensionamento_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel exportado!");
  }

  // Exportar PNG
  async function exportPng() {
    if (!exportRef.current) return;
    try {
      const url = await toPng(exportRef.current, { backgroundColor: "#0f1117", pixelRatio: 2, skipFonts: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = `dimensionamento_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("PNG exportado!");
    } catch {
      toast.error("Erro ao exportar PNG.");
    }
  }

  // Importar Excel
  const handleImportFile = useCallback(async (file: File) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-dimensionamento", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro desconhecido");
      setImportResult(json);
      utils.dimensionamento.list.invalidate();
      utils.dimensionamento.stats.invalidate();
      toast.success(`Importação concluída: ${json.inserted} inseridos, ${json.updated} atualizados`);
    } catch (e: any) {
      toast.error("Erro na importação: " + e.message);
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }, [utils]);

  const handleImportDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file);
  }, [handleImportFile]);

  const celulas = stats?.celulas || [];
  const supervisores = stats?.supervisores || [];
  const turnos = ["MANHÃ", "TARDE", "INTEGRAL"];
  const ufs = stats?.ufs || [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-orange-400" />
            Quadro de Dimensionamento
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Gestão completa do quadro de operadores por célula e campanha
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} className="border-gray-700 text-gray-300 hover:text-white">
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPng} className="border-gray-700 text-gray-300 hover:text-white">
            <Image className="w-4 h-4 mr-1" /> PNG
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setImportResult(null); setImportDialogOpen(true); }}
            className="border-orange-500/50 text-orange-300 hover:bg-orange-500/10 hover:text-orange-200 gap-1"
          >
            <Upload className="w-4 h-4" /> Importar Excel
          </Button>
          <Button size="sm" onClick={openCreate} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 mr-1" /> Novo Operador
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Cadastrados", value: stats?.total || 0, icon: Users, color: "text-blue-400" },
          { label: "Ativos", value: stats?.ativos || 0, icon: Users, color: "text-green-400" },
          { label: "Células", value: celulas.length, icon: Building2, color: "text-orange-400" },
          { label: "Supervisores", value: supervisores.length, icon: Users, color: "text-purple-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-gray-400">{label}</span>
            </div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar por nome ou login..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="border-gray-700 text-gray-300 hover:text-white gap-1"
          >
            <Filter className="w-4 h-4" />
            Filtros
            {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          {(filterCelula !== "all" || filterSupervisor !== "all" || filterTurno !== "all" || filterUf !== "all" || filterStatus !== "ATIVO") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterCelula("all"); setFilterSupervisor("all"); setFilterTurno("all"); setFilterUf("all"); setFilterStatus("ATIVO"); }}
              className="text-gray-400 hover:text-white gap-1"
            >
              <X className="w-3 h-3" /> Limpar
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 pt-3 border-t border-gray-800">
            <Select value={filterCelula} onValueChange={setFilterCelula}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm">
                <SelectValue placeholder="Célula" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Células</SelectItem>
                {celulas.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSupervisor} onValueChange={setFilterSupervisor}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm">
                <SelectValue placeholder="Supervisor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Supervisores</SelectItem>
                {supervisores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterTurno} onValueChange={setFilterTurno}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm">
                <SelectValue placeholder="Turno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Turnos</SelectItem>
                {turnos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterUf} onValueChange={setFilterUf}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm">
                <SelectValue placeholder="UF / Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Estados</SelectItem>
                {ufs.map(u => <SelectItem key={u} value={u}>{u} — {UF_ESTADOS[u] || u}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="ATIVO">Ativo</SelectItem>
                <SelectItem value="INATIVO">Inativo</SelectItem>
                <SelectItem value="TO">TO</SelectItem>
                <SelectItem value="AFASTADO">Afastado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Resultado */}
      <div className="text-sm text-gray-400">
        {operadores.length} operador{operadores.length !== 1 ? "es" : ""} encontrado{operadores.length !== 1 ? "s" : ""}
      </div>

      {/* Tabs de visualização */}
      <Tabs value={viewMode} onValueChange={v => setViewMode(v as any)}>
        <TabsList className="bg-gray-900 border border-gray-800">
          <TabsTrigger value="tabela" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
            Tabela Geral
          </TabsTrigger>
          <TabsTrigger value="celulas" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
            Por Célula / Campanha
          </TabsTrigger>
          <TabsTrigger value="cruzamento" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Não Cadastrados
          </TabsTrigger>
        </TabsList>

        {/* Tabela Geral */}
        <TabsContent value="tabela">
          <div ref={exportRef} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {/* Header da tabela exportável */}
            <div className="hidden" id="export-header">
              <div className="p-4 border-b border-gray-800 flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">DDM</div>
                <div>
                  <div className="text-white font-bold">DDM Control Desk — Quadro de Dimensionamento</div>
                  <div className="text-gray-400 text-xs">{new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })} · {operadores.length} operadores</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-950">
                    <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Nome</th>
                    <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Login</th>
                    <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Supervisor</th>
                    <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Célula</th>
                    <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Skill</th>
                    <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Turno</th>
                    <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Horário</th>
                    <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">UF</th>
                    <th className="text-left p-3 text-gray-400 font-medium whitespace-nowrap">Status</th>
                    <th className="text-right p-3 text-gray-400 font-medium whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={10} className="text-center py-12 text-gray-500">Carregando...</td></tr>
                  ) : operadores.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-12 text-gray-500">Nenhum operador encontrado.</td></tr>
                  ) : operadores.map((op, i) => (
                    <tr key={op.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${i % 2 === 0 ? "" : "bg-gray-900/30"}`}>
                      <td className="p-3 text-white font-medium">{op.nome}</td>
                      <td className="p-3 text-gray-300 font-mono text-xs">{op.login || "—"}</td>
                      <td className="p-3 text-gray-300">{op.supervisor || "—"}</td>
                      <td className="p-3">
                        <span className="text-orange-300 font-medium">{op.celula || "—"}</span>
                      </td>
                      <td className="p-3 text-gray-400 text-xs">{op.skill || "—"}</td>
                      <td className="p-3">
                        {op.turno ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${TURNO_COLORS[op.turno] || "bg-gray-700 text-gray-300"}`}>
                            {op.turno}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-gray-400 text-xs whitespace-nowrap">
                        {op.entrada && op.saida ? `${op.entrada} – ${op.saida}` : "—"}
                      </td>
                      <td className="p-3">
                        {op.uf ? (
                          <span className="text-blue-300 text-xs font-medium" title={UF_ESTADOS[op.uf] || op.uf}>
                            {op.uf}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[op.status || ""] || "bg-gray-700 text-gray-300 border-gray-600"}`}>
                          {op.status || "—"}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-gray-400 hover:text-blue-400" onClick={() => openEdit(op)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-gray-400 hover:text-red-400" onClick={() => setDeleteConfirm(op.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Por Célula */}
        <TabsContent value="celulas">
          <div className="flex flex-col gap-4">
            {isLoading ? (
              <div className="text-center py-12 text-gray-500">Carregando...</div>
            ) : porCelula.length === 0 ? (
              <div className="text-center py-12 text-gray-500">Nenhum operador encontrado.</div>
            ) : porCelula.map(([celula, ops]) => {
              const ativos = ops.filter(o => o.status?.toUpperCase() === "ATIVO").length;
              const manha = ops.filter(o => o.turno === "MANHÃ").length;
              const tarde = ops.filter(o => o.turno === "TARDE").length;
              const integral = ops.filter(o => o.turno === "INTEGRAL").length;
              const supervisoresCell = Array.from(new Set(ops.map(o => o.supervisor).filter(Boolean)));
              const rj = ops.filter(o => o.uf === "RJ").length;
              const sp = ops.filter(o => o.uf === "SP").length;

              return (
                <div key={celula} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  {/* Cabeçalho da célula */}
                  <div className="p-4 bg-gray-950 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-orange-400" />
                      </div>
                      <div>
                        <div className="text-white font-bold">{celula}</div>
                        <div className="text-xs text-gray-400">
                          {supervisoresCell.length > 0 ? `Sup: ${supervisoresCell.join(", ")}` : "Sem supervisor"}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 rounded bg-green-500/20 text-green-400 border border-green-500/30">{ativos} Ativos</span>
                      <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400">{manha} Manhã</span>
                      <span className="px-2 py-1 rounded bg-orange-500/20 text-orange-400">{tarde} Tarde</span>
                      {integral > 0 && <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-400">{integral} Integral</span>}
                      {rj > 0 && <span className="px-2 py-1 rounded bg-gray-700 text-gray-300">RJ: {rj}</span>}
                      {sp > 0 && <span className="px-2 py-1 rounded bg-gray-700 text-gray-300">SP: {sp}</span>}
                    </div>
                  </div>

                  {/* Tabela de operadores da célula */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left p-2 px-4 text-gray-500 font-medium text-xs">Nome</th>
                          <th className="text-left p-2 text-gray-500 font-medium text-xs">Login</th>
                          <th className="text-left p-2 text-gray-500 font-medium text-xs">Supervisor</th>
                          <th className="text-left p-2 text-gray-500 font-medium text-xs">Skill</th>
                          <th className="text-left p-2 text-gray-500 font-medium text-xs">Turno</th>
                          <th className="text-left p-2 text-gray-500 font-medium text-xs">Horário</th>
                          <th className="text-left p-2 text-gray-500 font-medium text-xs">UF</th>
                          <th className="text-left p-2 text-gray-500 font-medium text-xs">Status</th>
                          <th className="text-right p-2 pr-4 text-gray-500 font-medium text-xs">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ops.map((op, i) => (
                          <tr key={op.id} className={`border-b border-gray-800/40 hover:bg-gray-800/20 ${i % 2 === 0 ? "" : "bg-gray-900/20"}`}>
                            <td className="p-2 px-4 text-white text-sm">{op.nome}</td>
                            <td className="p-2 text-gray-400 font-mono text-xs">{op.login || "—"}</td>
                            <td className="p-2 text-gray-300 text-xs">{op.supervisor || "—"}</td>
                            <td className="p-2 text-gray-400 text-xs">{op.skill || "—"}</td>
                            <td className="p-2">
                              {op.turno ? (
                                <span className={`px-1.5 py-0.5 rounded text-xs ${TURNO_COLORS[op.turno] || "bg-gray-700 text-gray-300"}`}>
                                  {op.turno}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="p-2 text-gray-400 text-xs whitespace-nowrap">
                              {op.entrada && op.saida ? `${op.entrada}–${op.saida}` : "—"}
                            </td>
                            <td className="p-2 text-xs">
                              {op.uf ? (
                                <span className="text-blue-300 font-medium" title={UF_ESTADOS[op.uf] || op.uf}>{op.uf}</span>
                              ) : "—"}
                            </td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded-full text-xs border ${STATUS_COLORS[op.status || ""] || "bg-gray-700 text-gray-300 border-gray-600"}`}>
                                {op.status || "—"}
                              </span>
                            </td>
                            <td className="p-2 pr-4">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="w-6 h-6 text-gray-500 hover:text-blue-400" onClick={() => openEdit(op)}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="w-6 h-6 text-gray-500 hover:text-red-400" onClick={() => setDeleteConfirm(op.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Cruzamento AgentDay x Dimensionamento */}
        <TabsContent value="cruzamento">
          <CrossCheckTab />
        </TabsContent>
      </Tabs>

      {/* Dialog de Criar/Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-400" />
              {editingId ? "Editar Operador" : "Novo Operador"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {[
              { label: "Nome Completo *", key: "nome", placeholder: "Ex: JOÃO DA SILVA" },
              { label: "Login", key: "login", placeholder: "Ex: joao.silva" },
              { label: "Login OLOS (ID)", key: "loginOlos", placeholder: "Ex: 1394", type: "number" },
              { label: "Email", key: "email", placeholder: "joao.silva@grupoddm.com.br" },
              { label: "Supervisor", key: "supervisor", placeholder: "Ex: LUCIANA" },
              { label: "Célula", key: "celula", placeholder: "Ex: CRUZEIRO" },
              { label: "Skill", key: "skill", placeholder: "Ex: YDUQS/CRUZEIRO" },
              { label: "Cargo", key: "cargo", placeholder: "Ex: ATENDENTE" },
              { label: "Função", key: "funcao", placeholder: "Ex: OPERADOR DE TELEMARKETING ATIVO" },
              { label: "Departamento", key: "departamento", placeholder: "Ex: COBRANÇA" },
              { label: "CPF", key: "cpf", placeholder: "000.000.000-00" },
              { label: "Admissão", key: "admissao", placeholder: "YYYY-MM-DD" },
              { label: "Escala", key: "escala", placeholder: "Ex: 6X1" },
              { label: "Entrada", key: "entrada", placeholder: "Ex: 08:00" },
              { label: "Saída", key: "saida", placeholder: "Ex: 14:00" },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                <Input
                  type={type || "text"}
                  placeholder={placeholder}
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 text-sm"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Turno</label>
              <Select value={form.turno} onValueChange={v => setForm(f => ({ ...f, turno: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Selecionar turno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANHÃ">MANHÃ</SelectItem>
                  <SelectItem value="TARDE">TARDE</SelectItem>
                  <SelectItem value="INTEGRAL">INTEGRAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">UF / Estado</label>
              <Select value={form.uf} onValueChange={v => setForm(f => ({ ...f, uf: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Selecionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RJ">RJ — Rio de Janeiro</SelectItem>
                  <SelectItem value="SP">SP — São Paulo</SelectItem>
                  <SelectItem value="MG">MG — Minas Gerais</SelectItem>
                  <SelectItem value="PR">PR — Paraná</SelectItem>
                  <SelectItem value="SC">SC — Santa Catarina</SelectItem>
                  <SelectItem value="RS">RS — Rio Grande do Sul</SelectItem>
                  <SelectItem value="BA">BA — Bahia</SelectItem>
                  <SelectItem value="GO">GO — Goiás</SelectItem>
                  <SelectItem value="ES">ES — Espírito Santo</SelectItem>
                  <SelectItem value="DF">DF — Distrito Federal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Status</label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATIVO">ATIVO</SelectItem>
                  <SelectItem value="INATIVO">INATIVO</SelectItem>
                  <SelectItem value="TO">TO</SelectItem>
                  <SelectItem value="AFASTADO">AFASTADO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Discador</label>
              <Select value={form.discador} onValueChange={v => setForm(f => ({ ...f, discador: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Discador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OLOS">OLOS</SelectItem>
                  <SelectItem value="MANUAL">MANUAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-700 text-gray-300">
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.nome || createMutation.isPending || updateMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createMutation.isPending || updateMutation.isPending ? "Salvando..." : editingId ? "Salvar Alterações" : "Adicionar Operador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Excel Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={v => { if (!importing) setImportDialogOpen(v); }}>
        <DialogContent className="max-w-lg bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-orange-400" />
              Importar Dimensionamento via Excel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Selecione ou arraste um arquivo <strong className="text-white">.xlsx</strong>.
              A planilha deve conter a aba <strong className="text-white">BaseQuadro</strong> com as colunas padrão.
              Operadores existentes serão <strong className="text-orange-300">atualizados</strong>, novos serão <strong className="text-green-300">inseridos</strong>.
            </p>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                importing ? "border-orange-500/50 bg-orange-500/5" : "border-gray-700 hover:border-orange-500/60 hover:bg-orange-500/5"
              }`}
              onDragOver={e => e.preventDefault()}
              onDrop={handleImportDrop}
              onClick={() => !importing && importInputRef.current?.click()}
            >
              {importing ? (
                <div className="flex flex-col items-center gap-2 text-orange-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm font-medium">Processando arquivo...</p>
                  <p className="text-xs text-gray-500">Aguarde enquanto os dados são importados</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <FileSpreadsheet className="w-10 h-10 text-orange-400/60" />
                  <p className="text-sm font-medium text-gray-300">Arraste o arquivo aqui</p>
                  <p className="text-xs">ou clique para selecionar</p>
                  <p className="text-[11px] text-gray-600 mt-1">.xlsx — máx. 20 MB</p>
                </div>
              )}
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
              />
            </div>
            {importResult && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-semibold">Importação concluída</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-xl font-bold text-green-400">{importResult.inserted}</p>
                    <p className="text-[11px] text-gray-500">Inseridos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-blue-400">{importResult.updated}</p>
                    <p className="text-[11px] text-gray-500">Atualizados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-400">{importResult.skipped}</p>
                    <p className="text-[11px] text-gray-500">Ignorados</p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-600">Aba: <strong className="text-gray-400">{importResult.sheetName}</strong> · {importResult.totalRows} linhas processadas</p>
                {importResult.errors.length > 0 && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                    <div className="flex items-center gap-1.5 text-red-400 mb-2">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="text-xs font-semibold">{importResult.errors.length} erro(s)</span>
                    </div>
                    <ul className="space-y-1">
                      {importResult.errors.map((err, i) => (
                        <li key={i} className="text-[11px] text-red-300/80">{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
              disabled={importing}
              className="border-gray-700 text-gray-300"
            >
              {importResult ? "Fechar" : "Cancelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Confirmar Exclusão
            </DialogTitle>
          </DialogHeader>
          <p className="text-gray-400 text-sm">Tem certeza que deseja remover este operador do quadro de dimensionamento? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-gray-700 text-gray-300">
              Cancelar
            </Button>
            <Button
              onClick={() => deleteConfirm !== null && deleteMutation.mutate({ id: deleteConfirm })}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
