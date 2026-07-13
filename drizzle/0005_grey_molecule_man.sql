CREATE TABLE `pause_limits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`motivo` varchar(255) NOT NULL,
	`limiteSegundos` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pause_limits_id` PRIMARY KEY(`id`),
	CONSTRAINT `pause_limits_motivo_unique` UNIQUE(`motivo`)
);
