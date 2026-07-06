import { useState } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import SummaryCards from "@/components/SummaryCards";
import GlobalFilters from "@/components/GlobalFilters";
import ExecutiveReportModal from "@/components/ExecutiveReportModal";
import UploadPage from "./UploadPage";
import AgentDayPage from "./AgentDayPage";
import ReasonAgentPage from "./ReasonAgentPage";
import CampaignAgentPage from "./CampaignAgentPage";
import DispositionAgentPage from "./DispositionAgentPage";
import DimensionamentoPage from "./DimensionamentoPage";
import CanaisRotasPage from "./CanaisRotas";
import LoginLogoutPage from "./LoginLogoutPage";
import {
  Upload, Activity, PauseCircle, BarChart3, AlertTriangle,
  ChevronLeft, ChevronRight, Trophy, Users, Network, LogIn
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "upload", label: "Importar Dados", icon: Upload, badge: null, color: "text-orange-400" },
  { id: "agentday", label: "Performance em Tempo Real", icon: Activity, badge: "AgentDay", color: "text-orange-400" },
  { id: "loginlogout", label: "Login & Logout", icon: LogIn, badge: null, color: "text-emerald-400" },
  { id: "reasonagent", label: "TEMPOS", icon: PauseCircle, badge: "ReasonAgent", color: "text-blue-400" },
  { id: "campaignagent", label: "Performance por Célula/Campanha", icon: BarChart3, badge: "CampaignAgent", color: "text-emerald-400" },
  { id: "dispositionagent", label: "Tabulações Excedidas", icon: AlertTriangle, badge: "DispositionAgent", color: "text-red-400" },
  { id: "dimensionamento", label: "Dimensionamento", icon: Users, badge: null, color: "text-purple-400" },
  { id: "canaisrotas", label: "Canais & Rotas", icon: Network, badge: null, color: "text-cyan-400" },
];

export default function Home() {
  const { activeSection, setActiveSection } = useDashboard();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [executiveOpen, setExecutiveOpen] = useState(false);

  const currentNav = NAV_ITEMS.find(n => n.id === activeSection) || NAV_ITEMS[0];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-all duration-300 shrink-0",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo DDM */}
        <div className={cn(
          "flex items-center gap-3 px-4 py-4 border-b border-sidebar-border",
          sidebarCollapsed && "justify-center px-2"
        )}>
          <img
            src="/manus-storage/ddm-logo_7a072db6.png"
            alt="DDM"
            className="w-9 h-9 rounded-lg object-cover shrink-0"
          />
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-sidebar-foreground leading-tight">DDM Control Desk</p>
              <p className="text-[11px] text-muted-foreground">Call Center Analytics</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group",
                  isActive
                    ? "bg-primary/15 border border-primary/30 text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 border border-transparent"
                )}
              >
                <Icon className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive ? item.color : "text-muted-foreground group-hover:text-sidebar-foreground"
                )} />
                {!sidebarCollapsed && (
                  <span className={cn(
                    "text-sm font-medium leading-tight flex-1 min-w-0",
                    isActive ? "text-foreground" : "text-sidebar-foreground"
                  )}>
                    {item.label}
                  </span>
                )}
                {!sidebarCollapsed && item.badge && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0",
                    isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Botão Relatório Executivo */}
        <div className={cn("px-2 pb-2", sidebarCollapsed && "px-1")}>
          <button
            onClick={() => setExecutiveOpen(true)}
            title={sidebarCollapsed ? "Relatório Executivo" : undefined}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group",
              "bg-primary/10 hover:bg-primary/20 border border-primary/25 hover:border-primary/50",
              sidebarCollapsed && "justify-center px-0"
            )}
          >
            <Trophy className="w-4 h-4 shrink-0 text-primary" />
            {!sidebarCollapsed && (
              <span className="text-sm font-semibold text-primary leading-tight">
                Relatório Executivo
              </span>
            )}
          </button>
        </div>

        {/* Collapse toggle */}
        <div className="p-2 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(c => !c)}
            className={cn("w-full text-muted-foreground hover:text-foreground", sidebarCollapsed ? "px-0 justify-center" : "justify-end")}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border bg-background/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <currentNav.icon className={cn("w-5 h-5 shrink-0", currentNav.color)} />
            <div className="min-w-0">
              <h1 className="text-base font-bold text-foreground leading-tight truncate">{currentNav.label}</h1>
              {currentNav.badge && (
                <p className="text-xs text-muted-foreground font-mono">{currentNav.badge}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeSection !== "upload" && (
              <Button
                onClick={() => setExecutiveOpen(true)}
                variant="outline"
                size="sm"
                className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/50 text-xs"
              >
                <Trophy className="w-3.5 h-3.5" />
                Relatório Executivo
              </Button>
            )}
            {activeSection !== "upload" && <GlobalFilters />}
          </div>
        </header>

        {/* Summary cards */}
        {activeSection !== "upload" && (
          <div className="px-6 pt-4 shrink-0">
            <SummaryCards />
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-6 py-4">
          {activeSection === "upload" && <UploadPage />}
          {activeSection === "agentday" && <AgentDayPage />}
          {activeSection === "loginlogout" && <LoginLogoutPage />}
          {activeSection === "reasonagent" && <ReasonAgentPage />}
          {activeSection === "campaignagent" && <CampaignAgentPage />}
          {activeSection === "dispositionagent" && <DispositionAgentPage />}
          {activeSection === "dimensionamento" && <DimensionamentoPage />}
          {activeSection === "canaisrotas" && <CanaisRotasPage />}
        </main>
      </div>

      {/* Modal do Relatório Executivo */}
      <ExecutiveReportModal
        open={executiveOpen}
        onClose={() => setExecutiveOpen(false)}
      />
    </div>
  );
}
