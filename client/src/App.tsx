import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import RequireAuth from "./components/RequireAuth";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DashboardProvider } from "./contexts/DashboardContext";
import Home from "./pages/Home";
import CanaisRotas from "./pages/CanaisRotas";

function Router() {
  return (
    <Switch>
      <Route path={"/"}>
        <RequireAuth>
          <Home />
        </RequireAuth>
      </Route>
      <Route path={"/canais-rotas"}>
        <RequireAuth>
          <CanaisRotas />
        </RequireAuth>
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <DashboardProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </DashboardProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
