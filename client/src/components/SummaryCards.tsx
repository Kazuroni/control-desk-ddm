import { trpc } from "@/lib/trpc";
import { useDashboard } from "@/contexts/DashboardContext";
import { Users, Phone, Target, Clock, TrendingUp, AlertTriangle, LayoutGrid } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  colorClass,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  colorClass: string;
  loading?: boolean;
}) {
  return (
    <div className="kpi-card flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-20 mt-1" />
        ) : (
          <p className="text-2xl font-bold text-foreground mt-0.5 tabular-nums">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </p>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
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
      label: "Tabulações Sucesso",
      value: data?.totalTabulacoesSucesso ?? 0,
      colorClass: "bg-cyan-500/15 text-cyan-400",
    },
    {
      icon: AlertTriangle,
      label: "Tabulações Excedidas",
      value: data?.totalTabulacoesExcedidas ?? 0,
      colorClass: "bg-red-500/15 text-red-400",
    },
    {
      icon: LayoutGrid,
      label: "Campanhas Ativas",
      value: data?.totalCampanhas ?? 0,
      colorClass: "bg-pink-500/15 text-pink-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} loading={isLoading} />
      ))}
    </div>
  );
}
