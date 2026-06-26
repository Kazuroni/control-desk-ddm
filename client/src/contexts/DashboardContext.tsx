import React, { createContext, useContext, useState, useCallback } from "react";

export interface GlobalFilters {
  sessionIds: number[];
  agente: string;
  supervisor: string;
  campanha: string;
  uf: string;
}

interface DashboardContextValue {
  filters: GlobalFilters;
  setFilter: <K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => void;
  resetFilters: () => void;
  activeSection: string;
  setActiveSection: (section: string) => void;
}

const defaultFilters: GlobalFilters = {
  sessionIds: [],
  agente: "",
  supervisor: "",
  campanha: "",
  uf: "",
};

const DashboardContext = createContext<DashboardContextValue>({
  filters: defaultFilters,
  setFilter: () => {},
  resetFilters: () => {},
  activeSection: "upload",
  setActiveSection: () => {},
});

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(defaultFilters);
  const [activeSection, setActiveSection] = useState("upload");

  const setFilter = useCallback(<K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  return (
    <DashboardContext.Provider value={{ filters, setFilter, resetFilters, activeSection, setActiveSection }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  return useContext(DashboardContext);
}
