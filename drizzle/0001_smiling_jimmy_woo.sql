CREATE TABLE `agent_day_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`referenceDate` varchar(32),
	`agente` varchar(255),
	`login` varchar(128),
	`agentesLogados` int DEFAULT 0,
	`chamadasAtendidas` int DEFAULT 0,
	`chamadasManuais` int DEFAULT 0,
	`contatoEfetivo` int DEFAULT 0,
	`logins` int DEFAULT 0,
	`idAgente` varchar(64),
	`tabulacoesTotal` int DEFAULT 0,
	`totalChamadas` int DEFAULT 0,
	`totalContatos` int DEFAULT 0,
	`primeiroLogin` varchar(32),
	`tempoOcioso` varchar(32),
	`tempoPausa` varchar(32),
	`ultimoLogout` varchar(32),
	`pausas` int DEFAULT 0,
	`tabulacoesSucesso` int DEFAULT 0,
	`tabulacoesSucessoNegocio` int DEFAULT 0,
	`tempoTabulacao` varchar(32),
	`tempoLogado` varchar(32),
	`pausasImprodutivas` int DEFAULT 0,
	`uf` varchar(8),
	`produto` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_day_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_agent_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`agente` varchar(255),
	`login` varchar(128),
	`campanha` varchar(255),
	`logins` int DEFAULT 0,
	`nomeSupervisor` varchar(255),
	`totalChamadas` int DEFAULT 0,
	`totalContatos` int DEFAULT 0,
	`tabulacoesSucessoNegocio` int DEFAULT 0,
	`tabulacoesSucesso` int DEFAULT 0,
	`uf` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_agent_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `disposition_agent_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`agente` varchar(255),
	`login` varchar(128),
	`tabulacao` varchar(255),
	`nomeSupervisor` varchar(255),
	`tempoTabulacao` varchar(32),
	`totalChamadas` int DEFAULT 0,
	`uf` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `disposition_agent_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reason_agent_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`agente` varchar(255),
	`login` varchar(128),
	`motivoDePausa` varchar(255),
	`tempoTotalDePausa` varchar(32),
	`idAgente` varchar(64),
	`pausasTotalizadoPorCampanha` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reason_agent_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportType` enum('AgentDay','ReasonAgent','CampaignAgent','DispositionAgent') NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileKey` varchar(512),
	`referenceDate` varchar(32),
	`totalRows` int DEFAULT 0,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `upload_sessions_id` PRIMARY KEY(`id`)
);
