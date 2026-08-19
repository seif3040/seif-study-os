CREATE TABLE `assistantMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assistantMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dailyStudySummaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`summaryDate` date NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dailyStudySummaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `dailyStudySummaries_user_date_unique` UNIQUE(`userId`,`summaryDate`)
);
--> statement-breakpoint
ALTER TABLE `assistantMessages` ADD CONSTRAINT `assistantMessages_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dailyStudySummaries` ADD CONSTRAINT `dailyStudySummaries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dailyStudySummaries` ADD CONSTRAINT `dailyStudySummaries_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `assistantMessages_user_created_idx` ON `assistantMessages` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `dailyStudySummaries_cycle_date_idx` ON `dailyStudySummaries` (`cycleId`,`summaryDate`);