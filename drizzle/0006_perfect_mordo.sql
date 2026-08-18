CREATE TABLE `flashcardDecks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`color` varchar(16) NOT NULL DEFAULT '#8B5CF6',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flashcardDecks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flashcards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deckId` int NOT NULL,
	`prompt` text NOT NULL,
	`answer` text NOT NULL,
	`state` enum('new','learning','mastered') NOT NULL DEFAULT 'new',
	`nextReviewAt` timestamp,
	`lastReviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flashcards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `flashcardDecks` ADD CONSTRAINT `flashcardDecks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flashcardDecks` ADD CONSTRAINT `flashcardDecks_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flashcards` ADD CONSTRAINT `flashcards_deckId_flashcardDecks_id_fk` FOREIGN KEY (`deckId`) REFERENCES `flashcardDecks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `flashcardDecks_user_cycle_idx` ON `flashcardDecks` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `flashcards_deck_state_idx` ON `flashcards` (`deckId`,`state`);