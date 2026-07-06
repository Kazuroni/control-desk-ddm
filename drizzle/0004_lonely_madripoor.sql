CREATE TABLE `canais_rotas_campanhas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campanha` varchar(255) NOT NULL,
	`ativo` varchar(16) DEFAULT 'Sim',
	`solicitado` int DEFAULT 0,
	`alocado` int DEFAULT 0,
	`saldo` int DEFAULT 0,
	`rotaCadastrada` varchar(128),
	`observacao` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `canais_rotas_campanhas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `canais_rotas_diario` (
	`id` int AUTO_INCREMENT NOT NULL,
	`data` varchar(32),
	`rota` varchar(128),
	`movimentacao` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `canais_rotas_diario_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `canais_rotas_ia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`celula` varchar(255) NOT NULL,
	`qtdCanais` int DEFAULT 0,
	`canaisName` text,
	`qtdFluxo` int DEFAULT 0,
	`fluxosName` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `canais_rotas_ia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `canais_rotas_rotas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(128) NOT NULL,
	`quantidadeCanais` int DEFAULT 0,
	`qualidade` varchar(32),
	`custo` varchar(64),
	`limite` varchar(32),
	`observacao` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `canais_rotas_rotas_id` PRIMARY KEY(`id`)
);
