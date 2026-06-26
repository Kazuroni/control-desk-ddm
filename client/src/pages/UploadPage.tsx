import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, History, Trash2, RefreshCw } from "lucide-react";
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
}

export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { filters, setFilter } = useDashboard();

  const utils = trpc.useUtils();
  const { data: sessions, refetch: refetchSessions } = trpc.dashboard.getSessions.useQuery({});
  const processReport = trpc.dashboard.processReport.useMutation();

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
        i === index ? { ...item, status: "success", reportType: result.reportType, rows: result.totalRows, message: `${result.totalRows} registros importados` } : item
      ));
      toast.success(`${result.reportType} importado com sucesso — ${result.totalRows} registros`);
      refetchSessions();
      utils.dashboard.getSummary.invalidate();
    } catch (err: any) {
      const msg = err?.message || "Erro ao processar arquivo";
      setItems(prev => prev.map((item, i) => i === index ? { ...item, status: "error", message: msg } : item));
      toast.error(msg);
    }
  }, [processReport, refetchSessions, utils]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.name.match(/\.xls$/i));
    if (arr.length === 0) { toast.error("Apenas arquivos .xls (HTML) exportados do sistema de discagem são aceitos"); return; }
    const newItems: UploadItem[] = arr.map(file => ({ file, status: "pending" }));
    setItems(prev => {
      const updated = [...prev, ...newItems];
      // Processa automaticamente
      newItems.forEach((_, idx) => {
        setTimeout(() => processFile(arr[idx], prev.length + idx), 100 * idx);
      });
      return updated;
    });
  }, [processFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const toggleSession = (id: number) => {
    const current = filters.sessionIds;
    const next = current.includes(id) ? current.filter(s => s !== id) : [...current, id];
    setFilter("sessionIds", next);
  };

  const clearItems = () => setItems([]);

  const groupedSessions = sessions ? REPORT_TYPES.map(rt => ({
    ...rt,
    sessions: sessions.filter(s => s.reportType === rt.key),
  })) : [];

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar Relatórios</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Arraste os arquivos exportados do sistema de discagem para importar automaticamente.
        </p>
      </div>

      {/* Tipos de relatório */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {REPORT_TYPES.map(rt => (
          <div key={rt.key} className="kpi-card flex flex-col gap-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border w-fit ${rt.color}`}>{rt.label}</span>
            <span className="text-xs text-muted-foreground mt-1">{rt.desc}</span>
          </div>
        ))}
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
        </div>
      </div>

      {/* Lista de arquivos em processamento */}
      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Arquivos desta sessão</h3>
            <Button variant="ghost" size="sm" onClick={clearItems} className="text-muted-foreground hover:text-foreground">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpar
            </Button>
          </div>
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground flex-1 truncate">{item.file.name}</span>
              {item.reportType && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {item.reportType}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground shrink-0">{item.message}</span>
              {item.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
              {item.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {item.status === "error" && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {/* Histórico de uploads */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Histórico de Importações</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetchSessions()} className="text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
          </Button>
        </div>

        {filters.sessionIds.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <span className="text-xs text-primary font-medium">
              {filters.sessionIds.length} sessão(ões) selecionada(s) para análise
            </span>
            <Button variant="ghost" size="sm" className="text-primary h-auto py-0 px-2 text-xs" onClick={() => setFilter("sessionIds", [])}>
              Limpar seleção
            </Button>
          </div>
        )}

        {groupedSessions.map(group => group.sessions.length > 0 && (
          <div key={group.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${group.color}`}>{group.label}</span>
              <span className="text-xs text-muted-foreground">{group.desc}</span>
            </div>
            <div className="space-y-1">
              {group.sessions.map(session => {
                const isSelected = filters.sessionIds.includes(session.id);
                return (
                  <button
                    key={session.id}
                    onClick={() => toggleSession(session.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all duration-150 ${
                      isSelected
                        ? "bg-primary/10 border-primary/30 text-foreground"
                        : "bg-card border-border text-foreground hover:border-border/80 hover:bg-card/80"
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? "bg-primary" : "bg-muted-foreground/30"}`} />
                    <span className="text-sm font-medium flex-1 truncate">{session.fileName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {session.referenceDate || "—"}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {session.totalRows} registros
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(session.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {(!sessions || sessions.length === 0) && (
          <div className="text-center py-10 text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum arquivo importado ainda</p>
          </div>
        )}
      </div>
    </div>
  );
}
