import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";

export default function GlobalFilters() {
  const { filters, setFilter, resetFilters } = useDashboard();

  const { data: filterOptions } = trpc.dashboard.getFilters.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
  });

  const hasActiveFilters = filters.agente || filters.supervisor || filters.campanha || filters.uf;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
        <Filter className="w-3.5 h-3.5" />
        <span className="font-medium">Filtros</span>
      </div>

      <Select value={filters.agente || "all"} onValueChange={v => setFilter("agente", v === "all" ? "" : v)}>
        <SelectTrigger className="h-8 w-44 text-xs bg-card border-border">
          <SelectValue placeholder="Agente" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os agentes</SelectItem>
          {(filterOptions?.agentes ?? []).map(a => (
            <SelectItem key={a} value={a}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.supervisor || "all"} onValueChange={v => setFilter("supervisor", v === "all" ? "" : v)}>
        <SelectTrigger className="h-8 w-44 text-xs bg-card border-border">
          <SelectValue placeholder="Supervisor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os supervisores</SelectItem>
          {(filterOptions?.supervisores ?? []).map(s => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.campanha || "all"} onValueChange={v => setFilter("campanha", v === "all" ? "" : v)}>
        <SelectTrigger className="h-8 w-44 text-xs bg-card border-border">
          <SelectValue placeholder="Campanha" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as campanhas</SelectItem>
          {(filterOptions?.campanhas ?? []).map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.uf || "all"} onValueChange={v => setFilter("uf", v === "all" ? "" : v)}>
        <SelectTrigger className="h-8 w-20 text-xs bg-card border-border">
          <SelectValue placeholder="UF" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {(filterOptions?.ufs ?? []).map(uf => (
            <SelectItem key={uf} value={uf}>{uf}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
        >
          <X className="w-3 h-3" />
          Limpar
        </Button>
      )}
    </div>
  );
}
