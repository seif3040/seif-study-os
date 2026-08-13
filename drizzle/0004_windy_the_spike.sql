CREATE TABLE `videoNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`content` text NOT NULL,
	`timestampSeconds` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `videoNotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `videoNotes` ADD CONSTRAINT `videoNotes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `videoNotes` ADD CONSTRAINT `videoNotes_sessionId_studyVideoSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `studyVideoSessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `videoNotes_user_session_idx` ON `videoNotes` (`userId`,`sessionId`);--> statement-breakpoint
CREATE INDEX `videoNotes_session_timestamp_idx` ON `videoNotes` (`sessionId`,`timestampSeconds`);