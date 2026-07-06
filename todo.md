# Agent Performance Dashboard - TODO

## Schema & Backend
- [x] Schema: tabela upload_sessions (histórico de uploads)
- [x] Schema: tabela agent_day_records (Performance em Tempo Real)
- [x] Schema: tabela reason_agent_records (Controle de Pausas)
- [x] Schema: tabela campaign_agent_records (Performance por Célula/Campanha)
- [x] Schema: tabela disposition_agent_records (Tabulações Excedidas)
- [x] Parser: HTML (.xls) para AgentDay
- [x] Parser: HTML (.xls) para ReasonAgent
- [x] Parser: HTML (.xls) para CampaignAgent
- [x] Parser: HTML (.xls) para DispositionAgent
- [x] API: upload de arquivo (processamento via tRPC)
- [x] API: listagem de sessões de upload (histórico)
- [x] API: dados de AgentDay por sessão
- [x] API: dados de ReasonAgent por sessão
- [x] API: dados de CampaignAgent por sessão
- [x] API: dados de DispositionAgent por sessão
- [x] API: dados consolidados (cards de resumo executivo)
- [x] API: filtros (agente, supervisor, campanha, UF)

## Frontend - Layout & Tema
- [x] Tema escuro configurado em index.css (OKLCH)
- [x] Fontes Inter via Google Fonts
- [x] Layout com sidebar lateral colapsável
- [x] Sidebar com navegação entre as 4 faixas + upload
- [x] Página de upload com drag-and-drop
- [x] Cards de resumo executivo no topo (7 KPIs)
- [x] Filtros globais no header (agente, supervisor, campanha, UF)
- [x] DashboardContext para estado global

## Frontend - Faixa 1: Performance em Tempo Real
- [x] Tabela interativa com KPIs por agente
- [x] Colunas: chamadas atendidas, contatos efetivos, tempo logado, tempo ocioso, tabulações, pausas improdutivas
- [x] Ordenação por coluna (clicável)
- [x] Filtros por agente e UF
- [x] Resumo exportável top 5 melhores / ofensores
- [x] Exportação PNG via html-to-image

## Frontend - Faixa 2: Controle de Pausas
- [x] Gráfico de barras com motivos de pausa
- [x] Gráfico de pizza com distribuição de pausas
- [x] Ranking dos maiores ofensores por tempo total de pausa
- [x] Tabela de motivos com tempo total
- [x] Exportação PNG

## Frontend - Faixa 3: Performance por Célula/Campanha
- [x] Tabela comparativa de campanhas
- [x] Colunas: total chamadas, contatos, tabulações sucesso, sucesso negócio, conversão %
- [x] Segmentação por supervisor
- [x] Gráfico de barras agrupado comparativo
- [x] Top 5 campanhas por chamadas e conversão
- [x] Exportação PNG

## Frontend - Faixa 4: Tabulações Excedidas
- [x] Ranking de agentes com maior tempo excedido
- [x] Ranking de supervisores
- [x] Gráfico horizontal de barras (agentes)
- [x] Gráfico de barras (supervisores)
- [x] Exportação PNG

## Frontend - Histórico
- [x] Histórico de uploads agrupado por tipo de relatório
- [x] Seleção de sessões para análise (multi-seleção)
- [x] Indicador de sessões ativas na sidebar

## Frontend - Exportação PNG
- [x] html-to-image instalado
- [x] Botão de exportação em cada faixa
- [x] Geração de PNG com top 5 melhores e top 5 ofensores
- [x] Exportação 100% no frontend (sem servidor)

## Testes
- [x] Testes unitários para parsers (10 testes)
- [x] Testes para auth.logout (1 teste)
- [x] Total: 11 testes passando

## Bugs Reportados (26/06/2026)

- [x] BUG: Agentes duplicados na faixa "Performance em Tempo Real" — corrigido: deduplicação por agente+data no parser
- [x] BUG: Cards de resumo executivo não responsivos — corrigido: layout grid responsivo com breakpoints sm/md/lg
- [x] BUG: Linha de TOTAL ainda aparece — corrigido: filtro isTotalRow() robusto em todos os parsers
- [x] BUG: Números quebrados com decimais — corrigido: safeInt() remove separadores de milhar brasileiros antes do parseInt
- [x] BUG: Filtro de supervisores exibe IDs numéricos — corrigido: regex /^\d+$/ filtra valores puramente numéricos
- [x] BUG: Tela "Tabulações Excedidas" não exibe dados — corrigido: detectReportType() agora identifica DispositionAgent corretamente
- [x] BUG: Pausas improdutivas com valor absurdo — corrigido: campo alterado para varchar HH:MM:SS, parser usa normalizeTime()
- [x] MELHORIA: Faixa CampaignAgent — adicionada aba "Por Agente/Célula" com tabela individual por agente+campanha

## Melhorias Solicitadas (26/06/2026 - v2)

- [x] MELHORIA: Faixa 1 - Exportação PNG com quartil de agentes (Chamadas, CPC, Ocioso, Tab. Sucesso, Sucesso Neg., Pausas Improdutivas)
- [x] MELHORIA: Faixa 1 - Quartil visual com gráficos + dados tabulares por agente
- [x] MELHORIA: Faixa 2 - Filtrar "Atendimento Chat" como NÃO improdutiva; manter apenas pausas realmente estouradas (Descanso 1/2/3, Lanche, Banheiro >10min)
- [x] MELHORIA: Faixa 3 - Visão hierárquica agente → células (expansível), conforme imagem ATTCEL

## Ajustes Solicitados (29/06/2026)

- [x] BUG: Modo de sessão — corrigido: createUploadSession() apaga sessões e registros antigos do mesmo tipo antes de inserir
- [x] BUG: BOTs sem campo "login" — corrigido: filtro no banco (isNotNull + ne login vazio) em getAgentDayRecords; afeta tabela, KPIs e filtros
- [x] BUG: Filtros — corrigido: getAgentDayRecords agora sempre aplica condições com fallback para última sessão; filtros de supervisor sem IDs numéricos
- [x] MELHORIA: Exportação PNG dupla — botão 'PNG Tabela' (tableExportRef) + botão 'PNG Quartil' (exportRef) separados e independentes

## Gaps de Filtros Identificados (29/06/2026)

- [x] Alinhar filtros globais com cada faixa: GlobalFilters agora é contextual por SECTION_FILTERS, exibindo apenas filtros aplicáveis por faixa ativa
- [x] Testes cobrindo filtros por faixa: 5 testes adicionados em SECTION_FILTERS contextual logic (18 testes total)

## Correções Solicitadas (29/06/2026 - v4)

- [x] BUG: Exportação PNG do quartil — corrigido: forceMount na TabsContent do quartil garante que o DOM existe mesmo quando a aba não está ativa
- [x] BUG: Tabulações Excedidas — corrigido: contagem de ocorrências como métrica principal; ranking ordenado por qtd; tempo total como métrica secundária
- [x] MELHORIA: Tabulações Excedidas — filtros de supervisor, minTempo e minChamadas adicionados no router e no frontend
- [x] BUG: Controle de Pausas — corrigido: isImprodutiva() agora exclui apenas Feedback, Erro de Sistema e Atendimento Chat; todas as demais são improdutivas por padrão

## Relatório Executivo Consolidado (29/06/2026)

- [x] Endpoint tRPC getExecutiveReport retornando top5/bottom5 das 4 faixas
- [x] Componente ExecutiveReportModal com layout visual dark para exportação PNG
- [x] Botão "Relatório Executivo" na sidebar e no top bar
- [x] Exportação PNG consolidado com toPng (skipFonts, cacheBust)

## Melhorias Solicitadas (29/06/2026 - v5)

- [x] Rebranding: logo DDM, nome "DDM Control Desk", tema laranja/azul
- [x] Relatório Executivo: layout responsivo, métricas corretas
- [x] Controle de Pausas: aba "Abusadores de Pausa" com limites por tipo, filtro por motivo e busca de agente
- [x] Controle de Pausas: badge de severidade (Crítico/Alerta/Atenção) baseado em tempo excedido
- [x] Tabulações Excedidas: aba "Ranking Unificado" com agente+tabulação, filtro dinâmico por tabulação
- [x] Tabulações Excedidas: filtro por supervisor mantido em todas as abas
- [x] Tabulações Excedidas: campo tabulacao adicionado ao retorno do backend (agenteTabRanking)

## Importação de Excel no Dimensionamento (03/07/2026)
- [x] Rota Express POST /api/upload-dimensionamento para receber arquivo .xlsx via multipart
- [x] Lógica de upsert: atualiza se login/nome já existe, insere se novo
- [x] Componente ImportDimensionamentoDialog com drag-and-drop e feedback de progresso
- [x] Botão 'Importar Excel' na tela de Dimensionamento
- [x] Exibir resumo pós-importação: X inseridos, Y atualizados, Z ignorados

- [x] Canais & Rotas: criar schema DB (canais_rotas_campanhas, canais_rotas_rotas, canais_rotas_diario, canais_rotas_ia)
- [x] Canais & Rotas: endpoints tRPC CRUD completos (getCampanhas, upsertCampanha, deleteCampanha, bulkInsert, getRotas, upsertRota, deleteRota, getDiario, addDiario, deleteDiario, getCanaisIA, upsertCanaisIA, deleteCanaisIA, getSummary)
- [x] Canais & Rotas: página com 4 abas (Campanhas, Rotas, Diário de Bordo, Canais IA)
- [x] Canais & Rotas: popular banco com 46 campanhas + 11 rotas + 3 células IA do xlsx
- [x] Canais & Rotas: adicionar no menu lateral do DDM Control Desk
