import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import { Users, Phone, Target, Clock, TrendingUp, AlertTriangle, LayoutGrid } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function KpiCard({
  icon: Icon,
  label,
  value,
  colorClass,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  colorClass: string;
  loading?: boolean;
}) {
  return (
    <div className="kpi-card flex flex-col gap-2 p-3 min-w-0">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${colorClass}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider leading-tight truncate">
          {label}
        </p>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <p className="text-xl font-bold text-foreground tabular-nums leading-none">
          {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
        </p>
      )}
    </div>
  );
}

export default function SummaryCards() {
  const { filters } = useDashboard();
  const { data, isLoading } = trpc.dashboard.getSummary.useQuery({
    sessionIds: filters.sessionIds.length > 0 ? filters.sessionIds : undefined,
  });

  const cards = [
    {
      icon: Users,
      label: "Agentes Logados",
      value: data?.agentesLogados ?? 0,
      colorClass: "bg-blue-500/15 text-blue-400",
    },
    {
      icon: Phone,
      label: "Total de Chamadas",
      value: data?.totalChamadas ?? 0,
      colorClass: "bg-violet-500/15 text-violet-400",
    },
    {
      icon: Target,
      label: "Total de Contatos",
      value: data?.totalContatos ?? 0,
      colorClass: "bg-emerald-500/15 text-emerald-400",
    },
    {
      icon: Clock,
      label: "Total de Pausas",
      value: data?.totalPausas ?? 0,
      colorClass: "bg-amber-500/15 text-amber-400",
    },
    {
      icon: TrendingUp,
      label: "Tab. Sucesso",
      value: data?.totalTabulacoesSucesso ?? 0,
      colorClass: "bg-cyan-500/15 text-cyan-400",
    },
    {
      icon: AlertTriangle,
      label: "Tab. Excedidas",
      value: data?.totalTabulacoesExcedidas ?? 0,
      colorClass: "bg-red-500/15 text-red-400",
    },
    {
      icon: LayoutGrid,
      label: "Campanhas",
      value: data?.totalCampanhas ?? 0,
      colorClass: "bg-pink-500/15 text-pink-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} loading={isLoading} />
      ))}
    </div>
  );
}
