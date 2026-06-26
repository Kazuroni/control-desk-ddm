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
