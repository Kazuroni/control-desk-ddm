import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw, Save, Settings } from "lucide-react";
import { toast } from "sonner";

// Antes: limites de pausa (NR17) eram uma constante fixa no código do
// servidor. Qualquer mudança de política exigia alterar código e reimplantar.
// Agora: valores padrão continuam existindo (fallback), mas podem ser
// sobrescritos aqui — e o sistema mostra qual motivo está usando um valor
// customizado ("Custom") ou o padrão ("Padrão").
export default function PauseLimitsSettings() {
  const utils = trpc.useUtils();
  const { data: limits, isLoading } =
    trpc.dashboard.pauseLimits.list.useQuery();
  const [edits, setEdits] = useState<Record<string, string>>({});

  const upsertMutation = trpc.dashboard.pauseLimits.upsert.useMutation({
    onSuccess: () => {
      utils.dashboard.pauseLimits.list.invalidate();
      utils.dashboard.getReasonAgent.invalidate();
      toast.success("Limite atualizado.");
    },
    onError: (e: any) => toast.error("Erro ao salvar: " + e.message),
  });

  const resetMutation = trpc.dashboard.pauseLimits.reset.useMutation({
    onSuccess: () => {
      utils.dashboard.pauseLimits.list.invalidate();
      utils.dashboard.getReasonAgent.invalidate();
      toast.success("Restaurado para o padrão.");
    },
    onError: (e: any) => toast.error("Erro ao restaurar: " + e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Settings className="w-4 h-4" />
        <span>
          Limites de tempo (em minutos) usados para marcar uma pausa como
          "excedida". Valores sem edição usam o padrão do sistema.
        </span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                Motivo
              </th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-28">
                Limite (min)
              </th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">
                Origem
              </th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {(limits ?? []).map((l: any) => {
              const editValue = edits[l.motivo] ?? String(l.limiteMin);
              const dirty = editValue !== String(l.limiteMin);
              return (
                <tr key={l.motivo} className="border-t border-border/50">
                  <td className="px-3 py-2 capitalize">{l.motivo}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={1}
                      max={480}
                      value={editValue}
                      onChange={e =>
                        setEdits(prev => ({
                          ...prev,
                          [l.motivo]: e.target.value,
                        }))
                      }
                      className="h-8 w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={l.isCustom ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {l.isCustom ? "Custom" : "Padrão"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      {dirty && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 gap-1"
                          disabled={upsertMutation.isPending}
                          onClick={() => {
                            const n = parseInt(editValue, 10);
                            if (isNaN(n) || n <= 0) {
                              toast.error(
                                "Informe um número de minutos válido."
                              );
                              return;
                            }
                            upsertMutation.mutate({
                              motivo: l.motivo,
                              limiteMin: n,
                            });
                          }}
                        >
                          <Save className="w-3 h-3" /> Salvar
                        </Button>
                      )}
                      {l.isCustom && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 gap-1 text-muted-foreground"
                          disabled={resetMutation.isPending}
                          onClick={() => {
                            setEdits(prev => {
                              const n = { ...prev };
                              delete n[l.motivo];
                              return n;
                            });
                            resetMutation.mutate({ motivo: l.motivo });
                          }}
                        >
                          <RotateCcw className="w-3 h-3" /> Padrão
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
