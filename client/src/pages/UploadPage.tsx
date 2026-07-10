import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2,
  RefreshCw, Info, ArrowRight, RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDashboard } from "@/contexts/DashboardContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const REPORT_TYPES = [
  { key: "AgentDay", label: "AgentDay", desc: "Performance em Tempo Real", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  { key: "ReasonAgent", label: "ReasonAgent", desc: "Controle de Pausas", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  { key: "CampaignAgent", label: "CampaignAgent", desc: "Performance por Célula/Campanha", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  { key: "DispositionAgent", label: "DispositionAgent", desc: "Tabulações Excedidas", color: "bg-red-500/15 text-red-400 border-red-500/20" },
];

interface UploadItem {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  reportType?: string;
  message?: string;
  rows?: number;
  sessionId?: number;
}

export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setActiveSection } = useDashboard();

  const utils = trpc.useUtils();
  const { data: sessions, refetch: refetchSessions } = trpc.dashboard.getSessions.useQuery({});
  const processReport = trpc.dashboard.processReport.useMutation();
  const syncAgentDay = trpc.dimensionamento.syncAgentDay.useMutation();
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done">("idle");
  const [syncResult, setSyncResult] = useState<{ totalAutoAdded: number; totalStillMissing: number } | null>(null);

  // Conta quantos tipos de relatório já foram importados na sessão atual
  const importedTypes = items.filter(i => i.status === "success").map(i => i.reportType);
  const allImported = REPORT_TYPES.every(rt => importedTypes.includes(rt.key));

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file, "iso-8859-1");
    });

  const processFile = useCallback(async (file: File, index: number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, status: "uploading" } : item));
    try {
      const content = await readFileAsText(file);
      const result = await processReport.mutateAsync({
        htmlContent: content,
        fileName: file.name,
      });
      setItems(prev => prev.map((item, i) =>
        i === index
          ? { ...item, status: "success", reportType: result.reportType, rows: result.totalRows, sessionId: result.sessionId, message: `${result.totalRows} registros` }
          : item
      ));
      toast.success(`${result.reportType} importado — ${result.totalRows} registros`);
      // Invalida todas as queries para forçar recarregamento com dados novos
      utils.dashboard.getSessions.invalidate();
      utils.dashboard.getSummary.invalidate();
      utils.dashboard.getAgentDay.invalidate();
      utils.dashboard.getReasonAgent.invalidate();
      utils.dashboard.getCampaignAgent.invalidate();
      utils.dashboard.getDispositionAgent.invalidate();
      utils.dashboard.getFilters.invalidate();
      // Se for AgentDay, aciona sync automático com o Dimensionamento
      if (result.reportType === "AgentDay") {
        setSyncStatus("syncing");
        setSyncResult(null);
        try {
          const syncRes = await syncAgentDay.mutateAsync({ sessionIds: [result.sessionId] });
          setSyncResult(syncRes);
          setSyncStatus("done");
          // Invalida dimensionamento e agentday após sync
          utils.dimensionamento.list.invalidate();
          utils.dimensionamento.stats.invalidate();
          utils.dimensionamento.crossCheck.invalidate();
          utils.dashboard.getAgentDay.invalidate();
          if (syncRes.totalAutoAdded > 0) {
            toast.success(`✅ Sincronização concluída: ${syncRes.totalAutoAdded} agente(s) adicionado(s) ao Dimensionamento automaticamente`, { duration: 6000 });
          } else {
            toast.info("✓ Dimensionamento já está sincronizado — nenhum agente novo encontrado", { duration: 4000 });
          }
        } catch {
          setSyncStatus("idle");
          toast.warning("AgentDay importado, mas a sincronização automática falhou. Use 'Não Cadastrados' no Dimensionamento.");
        }
      }
    } catch (err: any) {
      const msg = err?.message || "Erro ao processar arquivo";
      setItems(prev => prev.map((item, i) => i === index ? { ...item, status: "error", message: msg } : item));
      toast.error(msg);
    }
  }, [processReport, utils]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.name.match(/\.xls$/i));
    if (arr.length === 0) {
      toast.error("Apenas arquivos .xls exportados do sistema de discagem são aceitos");
      return;
    }
    const newItems: UploadItem[] = arr.map(file => ({ file, status: "pending" }));
    setItems(prev => {
      const updated = [...prev, ...newItems];
      newItems.forEach((_, idx) => {
        setTimeout(() => processFile(arr[idx], prev.length + idx), 150 * idx);
      });
      return updated;
    });
  }, [processFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const resetUpload = () => setItems([]);

  // Sessão mais recente por tipo (apenas 1 por tipo — modo diário)
  const latestByType = REPORT_TYPES.map(rt => ({
    ...rt,
    session: sessions?.find(s => s.reportType === rt.key),
  }));

  return (
    <div className="space-y-8 animate-fade-in-up max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar Relatórios</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Arraste os 4 arquivos exportados do sistema de discagem. Cada importação <strong>substitui</strong> o relatório anterior do mesmo tipo — os dados sempre refletem a última importação.
        </p>
      </div>

      {/* Aviso de modo diário */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-300">
          <strong>Modo Relatório Diário:</strong> ao importar um arquivo, os dados anteriores do mesmo tipo são substituídos automaticamente. Não há acúmulo histórico — o dashboard sempre exibe o snapshot mais recente.
        </div>
      </div>

      {/* Zona de drop */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200
          ${isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-card/50"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xls"
          className="hidden"
          onChange={e => e.target.files && addFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isDragging ? "gradient-primary" : "bg-muted"}`}>
            <Upload className={`w-6 h-6 ${isDragging ? "text-white" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className="font-semibold text-foreground">Arraste os arquivos aqui</p>
            <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar — arquivos .xls exportados do sistema</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {REPORT_TYPES.map(rt => (
              <span key={rt.key} className={`text-xs px-2 py-0.5 rounded-full border ${rt.color}`}>{rt.label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de arquivos em processamento */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Importação em andamento</h3>
            <Button variant="ghost" size="sm" onClick={resetUpload} className="text-muted-foreground hover:text-foreground gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Limpar
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-lg px-4 py-3 border transition-all ${
                item.status === "success" ? "bg-emerald-500/5 border-emerald-500/20" :
                item.status === "error" ? "bg-red-500/5 border-red-500/20" :
                "bg-card border-border"
              }`}>
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground flex-1 truncate">{item.file.name}</span>
                {item.reportType && (
                  <Badge variant="outline" className="text-xs shrink-0">{item.reportType}</Badge>
                )}
                <span className="text-xs text-muted-foreground shrink-0">{item.message}</span>
                {item.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
                {item.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                {item.status === "error" && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
              </div>
            ))}
          </div>

          {/* Indicador visual de sincronização com Dimensionamento */}
          {syncStatus === "syncing" && (
            <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl animate-pulse">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-300">Sincronizando Dimensionamento...</p>
                <p className="text-xs text-blue-400/70 mt-0.5">Verificando agentes não cadastrados e fazendo de-para automático.</p>
              </div>
            </div>
          )}
          {syncStatus === "done" && syncResult && (
            <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
              syncResult.totalAutoAdded > 0
                ? "bg-emerald-500/10 border-emerald-500/20"
                : "bg-slate-500/10 border-slate-500/20"
            }`}>
              <CheckCircle2 className={`w-5 h-5 shrink-0 ${syncResult.totalAutoAdded > 0 ? "text-emerald-400" : "text-slate-400"}`} />
              <div className="flex-1">
                <p className={`text-sm font-semibold ${syncResult.totalAutoAdded > 0 ? "text-emerald-300" : "text-slate-300"}`}>
                  {syncResult.totalAutoAdded > 0
                    ? `✅ ${syncResult.totalAutoAdded} agente(s) sincronizado(s) com o Dimensionamento`
                    : "✓ Dimensionamento já está atualizado"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {syncResult.totalStillMissing > 0
                    ? `${syncResult.totalStillMissing} agente(s) ainda pendente(s) — acesse Dimensionamento > Não Cadastrados`
                    : "Performance em Tempo Real atualizada com turno, célula e supervisor."}
                </p>
              </div>
            </div>
          )}

          {/* CTA para ir ao dashboard após todos importados */}
          {allImported && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-300">Todos os 4 relatórios importados!</p>
                <p className="text-xs text-emerald-400/70 mt-0.5">O dashboard está pronto para visualização.</p>
              </div>
              <Button
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
                onClick={() => setActiveSection("agentday")}
              >
                Ver Dashboard <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Status atual dos relatórios no banco */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Relatórios Ativos</h3>
          <Button variant="ghost" size="sm" onClick={() => refetchSessions()} className="text-muted-foreground gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Exibe o relatório mais recente de cada tipo. Ao importar novamente, o anterior é substituído.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {latestByType.map(({ key, label, desc, color, session }) => (
            <div key={key} className={`rounded-xl border p-4 transition-all ${
              session ? "bg-card border-border" : "bg-muted/20 border-border/50 opacity-60"
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>{label}</span>
                  <p className="text-xs text-muted-foreground mt-1.5">{desc}</p>
                </div>
                {session
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  : <AlertCircle className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                }
              </div>
              {session ? (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-foreground truncate font-medium">{session.fileName}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{session.totalRows} registros</span>
                    <span>·</span>
                    <span>{session.referenceDate || "—"}</span>
                    <span>·</span>
                    <span>{format(new Date(session.createdAt), "dd/MM HH:mm", { locale: ptBR })}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground/60 italic">Nenhum arquivo importado</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
