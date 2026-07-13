import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";

// Bloqueia o acesso ao painel para quem não está autenticado.
// O backend já exige login em todos os endpoints (protectedProcedure);
// este componente só evita que a tela fique quebrada mostrando erros de
// tRPC — em vez disso, mostra uma tela de login clara.
export default function RequireAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <img
          src="/manus-storage/ddm-logo_7a072db6.png"
          alt="DDM"
          className="w-14 h-14 rounded-xl object-cover"
        />
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground">
            DDM Control Desk
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Faça login para acessar o painel.
          </p>
        </div>
        <Button
          onClick={() => {
            window.location.href = getLoginUrl();
          }}
          className="gap-2"
        >
          <LogIn className="w-4 h-4" />
          Entrar
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
