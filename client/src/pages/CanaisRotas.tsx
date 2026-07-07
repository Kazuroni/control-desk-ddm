import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Plus, Pencil, Trash2, Search, ChevronUp, ChevronDown, ChevronsUpDown,
  Radio, Network, BookOpen, Bot, TrendingUp, TrendingDown,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="w-3 h-3 text-orange-400" />
    : <ChevronDown className="w-3 h-3 text-orange-400" />;
}

function qualidadeBadge(q: string | null) {
  if (!q) return null;
  const map: Record<string, string> = {
    ALTA: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    MÉDIA: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    BAIXA: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${map[q] ?? "bg-white/10 text-white/60"}`}>
      {q}
    </span>
  );
}

function custoBadge(c: string | null) {
  if (!c) return null;
  const map: Record<string, string> = {
    "MUITO ELEVADO": "bg-red-500/15 text-red-300 border-red-500/30",
    "ELEVADO": "bg-orange-500/15 text-orange-300 border-orange-500/30",
    "BAIXO": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    "MUITO BAIXO": "bg-teal-500/15 text-teal-300 border-teal-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${map[c] ?? "bg-white/10 text-white/60"}`}>
      {c}
    </span>
  );
}

function ativoBadge(a: string | null) {
  if (a === "Sim") return <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-xs">Ativo</Badge>;
  if (a === "Não" || a === "Nao") return <Badge className="bg-red-500/15 text-red-300 border-red-500/30 text-xs">Inativo</Badge>;
  return <Badge className="bg-white/10 text-white/40 border-white/10 text-xs">{a ?? "—"}</Badge>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${color}`}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5">
        {icon}
      </div>
      <div>
        <p className="text-xs text-white/40 font-medium">{label}</p>
        <p className="text-2xl font-black text-white tabular-nums">{value}</p>
        {sub && <p className="text-xs text-white/40 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Aba Campanhas ────────────────────────────────────────────────────────────
function CampanhasTab() {
  const utils = trpc.useUtils();
  const { data: campanhas = [], isLoading } = trpc.canaisRotas.getCampanhas.useQuery();
  const { data: rotas = [] } = trpc.canaisRotas.getRotas.useQuery();
  const upsert = trpc.canaisRotas.upsertCampanha.useMutation({
    onSuccess: () => { utils.canaisRotas.getCampanhas.invalidate(); utils.canaisRotas.getSummary.invalidate(); toast.success("Campanha salva!"); setModalOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.canaisRotas.deleteCampanha.useMutation({
    onSuccess: () => { utils.canaisRotas.getCampanhas.invalidate(); utils.canaisRotas.getSummary.invalidate(); toast.success("Campanha removida."); },
    onError: (e) => toast.error(e.message),
  });

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"campanha" | "solicitado" | "alocado" | "saldo" | "rotaCadastrada">("campanha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ campanha: "", ativo: "Sim", solicitado: 0, alocado: 0, rotaCadastrada: "", observacao: "" });
  // Edição inline de alocado
  const [inlineEdit, setInlineEdit] = useState<{ id: number; value: string } | null>(null);

  function toggleSort(k: typeof sortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const rows = campanhas.filter(r =>
      r.campanha.toLowerCase().includes(q) ||
      (r.rotaCadastrada ?? "").toLowerCase().includes(q)
    );
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      if (typeof va === "number" && typeof vb === "number")
        return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [campanhas, search, sortKey, sortDir]);

  function openNew() {
    setEditing(null);
    setForm({ campanha: "", ativo: "Sim", solicitado: 0, alocado: 0, rotaCadastrada: "", observacao: "" });
    setModalOpen(true);
  }
  function openEdit(r: any) {
    setEditing(r);
    setForm({ campanha: r.campanha, ativo: r.ativo ?? "Sim", solicitado: r.solicitado ?? 0, alocado: r.alocado ?? 0, rotaCadastrada: r.rotaCadastrada ?? "", observacao: r.observacao ?? "" });
    setModalOpen(true);
  }
  function handleSave() {
    upsert.mutate({ id: editing?.id, ...form, solicitado: Number(form.solicitado), alocado: Number(form.alocado), rotaCadastrada: form.rotaCadastrada || null, observacao: form.observacao || null });
  }

  const totalSolicitado = campanhas.reduce((s, r) => s + (r.solicitado ?? 0), 0);
  const totalAlocado = campanhas.reduce((s, r) => s + (r.alocado ?? 0), 0);
  // KPIs dinâmicos de canais (calculados a partir das rotas)
  const totalCanaisRotas = rotas.reduce((s, r) => s + (r.quantidadeCanais ?? 0), 0);
  const canaisLivres = Math.max(0, totalCanaisRotas - totalAlocado);

  function commitInlineEdit(r: any) {
    if (!inlineEdit) return;
    const newAlocado = Number(inlineEdit.value);
    if (isNaN(newAlocado)) { setInlineEdit(null); return; }
    upsert.mutate({ id: r.id, campanha: r.campanha, ativo: r.ativo ?? "Sim", solicitado: r.solicitado ?? 0, alocado: newAlocado, rotaCadastrada: r.rotaCadastrada ?? null, observacao: r.observacao ?? null });
    setInlineEdit(null);
  }

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <KpiCard label="Campanhas" value={campanhas.length} sub={`${campanhas.filter(r => r.ativo === "Sim").length} ativas`} icon={<Radio className="w-5 h-5 text-orange-400" />} color="border-orange-500/20 bg-orange-500/5" />
        <KpiCard label="Canais Totais" value={totalCanaisRotas} sub="Soma das rotas" icon={<Network className="w-5 h-5 text-blue-400" />} color="border-blue-500/20 bg-blue-500/5" />
        <KpiCard label="Canais Alocados" value={totalAlocado} sub={`${totalCanaisRotas > 0 ? Math.round(totalAlocado / totalCanaisRotas * 100) : 0}% em uso`} icon={<TrendingUp className="w-5 h-5 text-emerald-400" />} color="border-emerald-500/20 bg-emerald-500/5" />
        <KpiCard label="Canais Livres" value={canaisLivres} sub={canaisLivres === 0 ? "Capacidade máxima" : "Disponíveis"} icon={<TrendingDown className="w-5 h-5 text-cyan-400" />} color={`border-cyan-500/20 ${canaisLivres === 0 ? "bg-red-500/5" : "bg-cyan-500/5"}`} />
        <KpiCard label="Saldo Campanha" value={totalSolicitado - totalAlocado} sub={totalSolicitado - totalAlocado < 0 ? "Excedendo" : "Disponível"} icon={<TrendingDown className="w-5 h-5 text-amber-400" />} color="border-amber-500/20 bg-amber-500/5" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar campanha ou rota..." className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9" />
        </div>
        <Button onClick={openNew} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-white/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/4 border-b border-white/8">
              <th className="text-left px-4 py-3 text-white/50 font-semibold w-8">#</th>
              <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("campanha")}>
                <span className="flex items-center gap-1 text-white/70 font-semibold">Campanha <SortIcon active={sortKey === "campanha"} dir={sortDir} /></span>
              </th>
              <th className="text-center px-4 py-3 text-white/50 font-semibold">Status</th>
              <th className="text-center px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("solicitado")}>
                <span className="flex items-center justify-center gap-1 text-white/70 font-semibold">Solicitado <SortIcon active={sortKey === "solicitado"} dir={sortDir} /></span>
              </th>
              <th className="text-center px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("alocado")}>
                <span className="flex items-center justify-center gap-1 text-white/70 font-semibold">Alocado <SortIcon active={sortKey === "alocado"} dir={sortDir} /></span>
              </th>
              <th className="text-center px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("saldo")}>
                <span className="flex items-center justify-center gap-1 text-white/70 font-semibold">Saldo <SortIcon active={sortKey === "saldo"} dir={sortDir} /></span>
              </th>
              <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("rotaCadastrada")}>
                <span className="flex items-center gap-1 text-white/70 font-semibold">Rota <SortIcon active={sortKey === "rotaCadastrada"} dir={sortDir} /></span>
              </th>
              <th className="text-left px-4 py-3 text-white/50 font-semibold">Observação</th>
              <th className="text-center px-4 py-3 text-white/50 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>              <td colSpan={9} className="px-4 py-3"><Skeleton className="h-5 bg-white/5" /></td></tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-white/30">Nenhuma campanha encontrada.</td></tr>
            ) : filtered.map((r, i) => (
              <tr key={r.id} className={`border-b border-white/5 hover:bg-white/3 ${i % 2 === 0 ? "" : "bg-white/2"}`}>
                <td className="px-4 py-3 text-white/25 text-xs">{i + 1}</td>
                <td className="px-4 py-3 text-white font-medium">{r.campanha}</td>
                <td className="px-4 py-3 text-center">{ativoBadge(r.ativo)}</td>
                <td className="px-4 py-3 text-center text-white tabular-nums">{r.solicitado ?? 0}</td>
                <td className="px-4 py-3 text-center">
                  {inlineEdit?.id === r.id ? (
                    <input
                      type="number"
                      autoFocus
                      value={inlineEdit.value}
                      onChange={e => setInlineEdit({ id: r.id, value: e.target.value })}
                      onBlur={() => commitInlineEdit(r)}
                      onKeyDown={e => { if (e.key === "Enter") commitInlineEdit(r); if (e.key === "Escape") setInlineEdit(null); }}
                      className="w-16 text-center bg-orange-500/15 border border-orange-500/40 rounded px-1 py-0.5 text-white text-sm tabular-nums outline-none"
                    />
                  ) : (
                    <span
                      className="tabular-nums text-white cursor-pointer hover:text-orange-300 hover:underline transition-colors"
                      title="Clique para editar"
                      onClick={() => setInlineEdit({ id: r.id, value: String(r.alocado ?? 0) })}
                    >
                      {r.alocado ?? 0}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`font-bold tabular-nums ${(r.saldo ?? 0) < 0 ? "text-red-400" : (r.saldo ?? 0) === 0 ? "text-white/50" : "text-emerald-400"}`}>
                    {(r.saldo ?? 0) > 0 ? "+" : ""}{r.saldo ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.rotaCadastrada ? (
                    <span className="text-xs px-2 py-1 rounded bg-white/8 text-white/70 font-mono">{r.rotaCadastrada}</span>
                  ) : <span className="text-white/25">—</span>}
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  {r.observacao ? (
                    <span className="text-xs text-white/50 leading-relaxed line-clamp-2" title={r.observacao}>{r.observacao}</span>
                  ) : <span className="text-white/20">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (confirm(`Remover "${r.campanha}"?`)) del.mutate({ id: r.id }); }} className="p-1.5 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="bg-[#1a1d27] border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar Campanha" : "Nova Campanha"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-white/70 text-xs mb-1.5 block">Nome da Campanha *</Label>
              <Input value={form.campanha} onChange={e => setForm(f => ({ ...f, campanha: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="Ex: Cruzeiro_Ativo" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-white/70 text-xs mb-1.5 block">Status</Label>
                <Select value={form.ativo} onValueChange={v => setForm(f => ({ ...f, ativo: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Sim">Ativo</SelectItem><SelectItem value="Não">Inativo</SelectItem><SelectItem value="-">—</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-white/70 text-xs mb-1.5 block">Solicitado</Label>
                <Input type="number" value={form.solicitado} onChange={e => setForm(f => ({ ...f, solicitado: Number(e.target.value) }))} className="bg-white/5 border-white/10 text-white h-9" />
              </div>
              <div><Label className="text-white/70 text-xs mb-1.5 block">Alocado</Label>
                <Input type="number" value={form.alocado} onChange={e => setForm(f => ({ ...f, alocado: Number(e.target.value) }))} className="bg-white/5 border-white/10 text-white h-9" />
              </div>
            </div>
            <div><Label className="text-white/70 text-xs mb-1.5 block">Rota Cadastrada</Label>
              <Input value={form.rotaCadastrada} onChange={e => setForm(f => ({ ...f, rotaCadastrada: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="Ex: PONTALTECH" />
            </div>
            <div><Label className="text-white/70 text-xs mb-1.5 block">Observação</Label>
              <Textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} className="bg-white/5 border-white/10 text-white resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-white/10 text-white/60">Cancelar</Button>
            <Button onClick={handleSave} disabled={upsert.isPending || !form.campanha} className="bg-orange-500 hover:bg-orange-600 text-white">
              {upsert.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Aba Rotas ────────────────────────────────────────────────────────────────
function RotasTab() {
  const utils = trpc.useUtils();
  const { data: rotas = [], isLoading } = trpc.canaisRotas.getRotas.useQuery();
  // Campanhas para calcular canais em uso por rota
  const { data: campanhas = [] } = trpc.canaisRotas.getCampanhas.useQuery();
  const upsert = trpc.canaisRotas.upsertRota.useMutation({
    onSuccess: () => { utils.canaisRotas.getRotas.invalidate(); utils.canaisRotas.getSummary.invalidate(); toast.success("Rota salva!"); setModalOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.canaisRotas.deleteRota.useMutation({
    onSuccess: () => { utils.canaisRotas.getRotas.invalidate(); utils.canaisRotas.getSummary.invalidate(); toast.success("Rota removida."); },
    onError: (e) => toast.error(e.message),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", quantidadeCanais: 0, qualidade: "", custo: "", limite: "", observacao: "" });

  // Canais em uso por rota (soma dos alocados das campanhas)
  const canaisEmUsoPorRota = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of campanhas) {
      if (!c.rotaCadastrada) continue;
      map.set(c.rotaCadastrada, (map.get(c.rotaCadastrada) ?? 0) + (c.alocado ?? 0));
    }
    return map;
  }, [campanhas]);

  function openNew() { setEditing(null); setForm({ nome: "", quantidadeCanais: 0, qualidade: "", custo: "", limite: "", observacao: "" }); setModalOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm({ nome: r.nome, quantidadeCanais: r.quantidadeCanais ?? 0, qualidade: r.qualidade ?? "", custo: r.custo ?? "", limite: r.limite ?? "", observacao: r.observacao ?? "" }); setModalOpen(true); }
  function handleSave() {
    upsert.mutate({ id: editing?.id, ...form, quantidadeCanais: Number(form.quantidadeCanais), qualidade: form.qualidade || null, custo: form.custo || null, limite: form.limite || null, observacao: form.observacao || null });
  }

  const totalCanais = rotas.reduce((s, r) => s + (r.quantidadeCanais ?? 0), 0);
  const totalEmUso = Array.from(canaisEmUsoPorRota.values()).reduce((s, v) => s + v, 0);
  const totalLivres = Math.max(0, totalCanais - totalEmUso);

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard label="Rotas Cadastradas" value={rotas.length} icon={<Network className="w-5 h-5 text-orange-400" />} color="border-orange-500/20 bg-orange-500/5" />
        <KpiCard label="Total de Canais" value={totalCanais} sub="Soma de todos os telecoms" icon={<Radio className="w-5 h-5 text-blue-400" />} color="border-blue-500/20 bg-blue-500/5" />
        <KpiCard label="Canais em Uso" value={totalEmUso} sub={`${totalCanais > 0 ? Math.round(totalEmUso / totalCanais * 100) : 0}% da capacidade`} icon={<TrendingUp className="w-5 h-5 text-amber-400" />} color="border-amber-500/20 bg-amber-500/5" />
        <KpiCard label="Canais Livres" value={totalLivres} sub={totalLivres === 0 ? "Capacidade máxima" : "Disponíveis"} icon={<TrendingDown className="w-5 h-5 text-emerald-400" />} color={`border-emerald-500/20 ${totalLivres === 0 ? "bg-red-500/5" : "bg-emerald-500/5"}`} />
      </div>

      <div className="flex justify-end mb-4">
        <Button onClick={openNew} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
          <Plus className="w-4 h-4" /> Nova Rota
        </Button>
      </div>

      {/* Cards de rotas */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl bg-white/5" />)}
        </div>
      ) : rotas.length === 0 ? (
        <p className="text-center py-12 text-white/30">Nenhuma rota cadastrada.</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {rotas.map(r => {
            const total = r.quantidadeCanais ?? 0;
            const emUso = canaisEmUsoPorRota.get(r.nome) ?? 0;
            const livres = Math.max(0, total - emUso);
            const pct = total > 0 ? Math.min(100, Math.round(emUso / total * 100)) : 0;
            const overloaded = emUso > total && total > 0;
            const barColor = overloaded ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : pct > 50 ? 'bg-blue-500' : 'bg-emerald-500';
            return (
              <div key={r.id} className={`rounded-xl border p-5 flex flex-col gap-3 hover:border-white/15 transition-colors ${
                overloaded ? 'border-red-500/40 bg-red-500/5' : 'border-white/8 bg-white/3'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-base">{r.nome}</p>
                    {/* Barra de uso */}
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">{emUso} em uso / {total} total</span>
                        <span className={`font-semibold ${
                          overloaded ? 'text-red-400' : livres === 0 && total > 0 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {overloaded ? `+${emUso - total} acima` : total === 0 ? 'N/A' : `${livres} livres`}
                        </span>
                      </div>
                      {total > 0 && (
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { if (confirm(`Remover "${r.nome}"?`)) del.mutate({ id: r.id }); }} className="p-1.5 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {qualidadeBadge(r.qualidade)}
                  {custoBadge(r.custo)}
                  {r.limite && <span className="text-xs px-2 py-0.5 rounded-full border border-white/10 text-white/40">Limite: {r.limite}</span>}
                </div>
                {r.observacao && <p className="text-xs text-white/40 leading-relaxed border-t border-white/5 pt-2">{r.observacao}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="bg-[#1a1d27] border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar Rota" : "Nova Rota"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-white/70 text-xs mb-1.5 block">Nome da Rota *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="Ex: PONTALTECH" />
            </div>
            <div><Label className="text-white/70 text-xs mb-1.5 block">Quantidade de Canais</Label>
              <Input type="number" value={form.quantidadeCanais} onChange={e => setForm(f => ({ ...f, quantidadeCanais: Number(e.target.value) }))} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-white/70 text-xs mb-1.5 block">Qualidade</Label>
                <Select value={form.qualidade} onValueChange={v => setForm(f => ({ ...f, qualidade: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALTA">ALTA</SelectItem>
                    <SelectItem value="MÉDIA">MÉDIA</SelectItem>
                    <SelectItem value="BAIXA">BAIXA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-white/70 text-xs mb-1.5 block">Custo</Label>
                <Select value={form.custo} onValueChange={v => setForm(f => ({ ...f, custo: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MUITO ELEVADO">MUITO ELEVADO</SelectItem>
                    <SelectItem value="ELEVADO">ELEVADO</SelectItem>
                    <SelectItem value="BAIXO">BAIXO</SelectItem>
                    <SelectItem value="MUITO BAIXO">MUITO BAIXO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-white/70 text-xs mb-1.5 block">Limite</Label>
                <Input value={form.limite} onChange={e => setForm(f => ({ ...f, limite: e.target.value }))} className="bg-white/5 border-white/10 text-white h-9" placeholder="Ex: 0" />
              </div>
            </div>
            <div><Label className="text-white/70 text-xs mb-1.5 block">Observação</Label>
              <Textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} className="bg-white/5 border-white/10 text-white resize-none" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-white/10 text-white/60">Cancelar</Button>
            <Button onClick={handleSave} disabled={upsert.isPending || !form.nome} className="bg-orange-500 hover:bg-orange-600 text-white">
              {upsert.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Aba Diário de Bordo ──────────────────────────────────────────────────────
function DiarioTab() {
  const utils = trpc.useUtils();
  const { data: diario = [], isLoading } = trpc.canaisRotas.getDiario.useQuery();
  const add = trpc.canaisRotas.addDiario.useMutation({
    onSuccess: () => { utils.canaisRotas.getDiario.invalidate(); toast.success("Movimentação registrada!"); setModalOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.canaisRotas.deleteDiario.useMutation({
    onSuccess: () => { utils.canaisRotas.getDiario.invalidate(); toast.success("Registro removido."); },
    onError: (e) => toast.error(e.message),
  });

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ data: new Date().toISOString().slice(0, 16), rota: "", movimentacao: "" });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return diario.filter(r =>
      (r.rota ?? "").toLowerCase().includes(q) ||
      (r.movimentacao ?? "").toLowerCase().includes(q)
    );
  }, [diario, search]);

  function handleSave() {
    add.mutate({ data: form.data, rota: form.rota, movimentacao: form.movimentacao });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar rota ou movimentação..." className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9" />
        </div>
        <Button onClick={() => { setForm({ data: new Date().toISOString().slice(0, 16), rota: "", movimentacao: "" }); setModalOpen(true); }} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
          <Plus className="w-4 h-4" /> Registrar Movimentação
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl bg-white/5" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-white/30">Nenhuma movimentação registrada.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="flex items-start gap-4 rounded-xl border border-white/8 bg-white/3 px-5 py-4 hover:border-white/15 transition-colors">
              <div className="shrink-0 text-right min-w-[100px]">
                <p className="text-xs text-white/40 font-mono">{r.data ? new Date(r.data).toLocaleDateString("pt-BR") : "—"}</p>
                <p className="text-xs text-white/25 font-mono">{r.data ? new Date(r.data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</p>
              </div>
              <div className="shrink-0">
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">{r.rota ?? "—"}</span>
              </div>
              <p className="flex-1 text-sm text-white/70 leading-relaxed">{r.movimentacao}</p>
              <button onClick={() => { if (confirm("Remover este registro?")) del.mutate({ id: r.id }); }} className="shrink-0 p-1.5 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="bg-[#1a1d27] border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle>Registrar Movimentação</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-white/70 text-xs mb-1.5 block">Data e Hora</Label>
                <Input type="datetime-local" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className="bg-white/5 border-white/10 text-white" />
              </div>
              <div><Label className="text-white/70 text-xs mb-1.5 block">Rota</Label>
                <Input value={form.rota} onChange={e => setForm(f => ({ ...f, rota: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="Ex: VONEX" />
              </div>
            </div>
            <div><Label className="text-white/70 text-xs mb-1.5 block">Movimentação *</Label>
              <Textarea value={form.movimentacao} onChange={e => setForm(f => ({ ...f, movimentacao: e.target.value }))} className="bg-white/5 border-white/10 text-white resize-none" rows={4} placeholder="Descreva a movimentação realizada..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-white/10 text-white/60">Cancelar</Button>
            <Button onClick={handleSave} disabled={add.isPending || !form.movimentacao} className="bg-orange-500 hover:bg-orange-600 text-white">
              {add.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Aba Canais IA ────────────────────────────────────────────────────────────
function CanaisIATab() {
  const utils = trpc.useUtils();
  const { data: ia = [], isLoading } = trpc.canaisRotas.getCanaisIA.useQuery();
  const upsert = trpc.canaisRotas.upsertCanaisIA.useMutation({
    onSuccess: () => { utils.canaisRotas.getCanaisIA.invalidate(); utils.canaisRotas.getSummary.invalidate(); toast.success("Célula IA salva!"); setModalOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.canaisRotas.deleteCanaisIA.useMutation({
    onSuccess: () => { utils.canaisRotas.getCanaisIA.invalidate(); utils.canaisRotas.getSummary.invalidate(); toast.success("Célula IA removida."); },
    onError: (e) => toast.error(e.message),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ celula: "", qtdCanais: 0, canaisName: "", qtdFluxo: 0, fluxosName: "" });

  function openNew() { setEditing(null); setForm({ celula: "", qtdCanais: 0, canaisName: "", qtdFluxo: 0, fluxosName: "" }); setModalOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm({ celula: r.celula, qtdCanais: r.qtdCanais ?? 0, canaisName: r.canaisName ?? "", qtdFluxo: r.qtdFluxo ?? 0, fluxosName: r.fluxosName ?? "" }); setModalOpen(true); }
  function handleSave() {
    upsert.mutate({ id: editing?.id, ...form, qtdCanais: Number(form.qtdCanais), qtdFluxo: Number(form.qtdFluxo), canaisName: form.canaisName || null, fluxosName: form.fluxosName || null });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-white/40">{ia.length} células IA cadastradas</p>
        <Button onClick={openNew} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
          <Plus className="w-4 h-4" /> Nova Célula IA
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl bg-white/5" />)}</div>
      ) : ia.length === 0 ? (
        <p className="text-center py-12 text-white/30">Nenhuma célula IA cadastrada.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {ia.map(r => (
            <div key={r.id} className="rounded-xl border border-white/8 bg-white/3 p-5 hover:border-white/15 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-violet-400" />
                  <p className="text-white font-bold">{r.celula}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { if (confirm(`Remover "${r.celula}"?`)) del.mutate({ id: r.id }); }} className="p-1.5 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white/4 rounded-lg p-3">
                  <p className="text-white/40 text-xs mb-1">Canais IA</p>
                  <p className="text-white font-bold text-lg tabular-nums">{r.qtdCanais ?? 0}</p>
                  {r.canaisName && <p className="text-white/35 text-xs mt-1 leading-snug">{r.canaisName}</p>}
                </div>
                <div className="bg-white/4 rounded-lg p-3">
                  <p className="text-white/40 text-xs mb-1">Fluxos</p>
                  <p className="text-white font-bold text-lg tabular-nums">{r.qtdFluxo ?? 0}</p>
                  {r.fluxosName && <p className="text-white/35 text-xs mt-1 leading-snug">{r.fluxosName}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="bg-[#1a1d27] border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar Célula IA" : "Nova Célula IA"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-white/70 text-xs mb-1.5 block">Célula *</Label>
              <Input value={form.celula} onChange={e => setForm(f => ({ ...f, celula: e.target.value }))} className="bg-white/5 border-white/10 text-white" placeholder="Ex: Cruzeiro Ativo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-white/70 text-xs mb-1.5 block">Qtd. Canais IA</Label>
                <Input type="number" value={form.qtdCanais} onChange={e => setForm(f => ({ ...f, qtdCanais: Number(e.target.value) }))} className="bg-white/5 border-white/10 text-white" />
              </div>
              <div><Label className="text-white/70 text-xs mb-1.5 block">Qtd. Fluxos</Label>
                <Input type="number" value={form.qtdFluxo} onChange={e => setForm(f => ({ ...f, qtdFluxo: Number(e.target.value) }))} className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>
            <div><Label className="text-white/70 text-xs mb-1.5 block">Nomes dos Canais</Label>
              <Textarea value={form.canaisName} onChange={e => setForm(f => ({ ...f, canaisName: e.target.value }))} className="bg-white/5 border-white/10 text-white resize-none" rows={2} />
            </div>
            <div><Label className="text-white/70 text-xs mb-1.5 block">Nomes dos Fluxos</Label>
              <Textarea value={form.fluxosName} onChange={e => setForm(f => ({ ...f, fluxosName: e.target.value }))} className="bg-white/5 border-white/10 text-white resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-white/10 text-white/60">Cancelar</Button>
            <Button onClick={handleSave} disabled={upsert.isPending || !form.celula} className="bg-orange-500 hover:bg-orange-600 text-white">
              {upsert.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function CanaisRotasPage() {
  const { data: summary } = trpc.canaisRotas.getSummary.useQuery();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Network className="w-6 h-6 text-orange-400" />
            Canais & Rotas
          </h1>
          <p className="text-white/40 text-sm mt-1">Gestão de telecoms, rotas e alocação de canais — Olos</p>
        </div>
        {summary && (
          <div className="flex items-center gap-4 text-sm text-white/40">
            <span><span className="text-white font-bold">{summary.totalCampanhas}</span> campanhas</span>
            <span className="text-white/15">·</span>
            <span><span className="text-white font-bold">{summary.totalRotas}</span> rotas</span>
            <span className="text-white/15">·</span>
            <span><span className="text-white font-bold">{summary.totalCanaisRotas}</span> canais totais</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="campanhas" className="space-y-4">
        <TabsList className="bg-white/5 border border-white/8">
          <TabsTrigger value="campanhas" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white gap-2">
            <Radio className="w-4 h-4" /> Campanhas
          </TabsTrigger>
          <TabsTrigger value="rotas" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white gap-2">
            <Network className="w-4 h-4" /> Rotas
          </TabsTrigger>
          <TabsTrigger value="diario" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white gap-2">
            <BookOpen className="w-4 h-4" /> Diário de Bordo
          </TabsTrigger>
          <TabsTrigger value="ia" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white gap-2">
            <Bot className="w-4 h-4" /> Canais IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas" className="m-0"><CampanhasTab /></TabsContent>
        <TabsContent value="rotas" className="m-0"><RotasTab /></TabsContent>
        <TabsContent value="diario" className="m-0"><DiarioTab /></TabsContent>
        <TabsContent value="ia" className="m-0"><CanaisIATab /></TabsContent>
      </Tabs>
    </div>
  );
}
