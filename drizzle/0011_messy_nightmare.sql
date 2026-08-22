CREATE TABLE `lessonSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`subject` varchar(80) NOT NULL,
	`platform` varchar(180) NOT NULL,
	`teacherName` varchar(180) NOT NULL,
	`delivery` enum('online','in_person','hybrid') NOT NULL DEFAULT 'online',
	`role` enum('primary','review','support') NOT NULL DEFAULT 'primary',
	`url` varchar(768),
	`location` varchar(255),
	`weeklyPlan` varchar(255),
	`notes` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lessonSources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `lessonSources` ADD CONSTRAINT `lessonSources_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `lessonSources_user_subject_idx` ON `lessonSources` (`userId`,`subject`);--> statement-breakpoint
CREATE INDEX `lessonSources_user_active_idx` ON `lessonSources` (`userId`,`active`);