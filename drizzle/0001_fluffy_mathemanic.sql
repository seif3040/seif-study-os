CREATE TABLE `achievements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`catalogId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` varchar(280) NOT NULL,
	`category` varchar(40) NOT NULL,
	`rarity` enum('common','uncommon','rare','epic','legendary','mythic') NOT NULL,
	`metric` varchar(64) NOT NULL,
	`target` int NOT NULL,
	CONSTRAINT `achievements_id` PRIMARY KEY(`id`),
	CONSTRAINT `achievements_catalogId_unique` UNIQUE(`catalogId`)
);
--> statement-breakpoint
CREATE TABLE `calendarEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`eventType` enum('important_date','custom') NOT NULL DEFAULT 'important_date',
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calendarEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chapters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coinTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`amount` int NOT NULL,
	`type` enum('earn','spend') NOT NULL,
	`reason` varchar(255) NOT NULL,
	`referenceKey` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coinTransactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `coinTransactions_referenceKey_unique` UNIQUE(`referenceKey`)
);
--> statement-breakpoint
CREATE TABLE `examAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`examId` int NOT NULL,
	`totalQuestions` int NOT NULL,
	`correctAnswers` int NOT NULL,
	`incorrectAnswers` int NOT NULL,
	`score` int NOT NULL,
	`difficulty` enum('easy','medium','hard') NOT NULL DEFAULT 'medium',
	`missedTopics` json,
	`comprehensionScore` int NOT NULL,
	`completionRewarded` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `examAttempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `examAttempts_exam_attempt_unique` UNIQUE(`examId`,`id`)
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`subjectId` int,
	`chapterId` int,
	`lessonId` int,
	`title` varchar(200) NOT NULL,
	`scheduledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goalMilestones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`goalId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`targetPercent` int NOT NULL,
	`completedAt` timestamp,
	CONSTRAINT `goalMilestones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`deadline` timestamp,
	`progress` int NOT NULL DEFAULT 0,
	`status` enum('active','completed') NOT NULL DEFAULT 'active',
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `habitCompletions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`habitId` int NOT NULL,
	`cycleId` int NOT NULL,
	`completedOn` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `habitCompletions_id` PRIMARY KEY(`id`),
	CONSTRAINT `habitCompletions_habit_date_unique` UNIQUE(`habitId`,`completedOn`)
);
--> statement-breakpoint
CREATE TABLE `habits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`frequency` enum('daily','weekly') NOT NULL DEFAULT 'daily',
	`target` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `habits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lessonProgress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lessonId` int NOT NULL,
	`status` enum('not_started','in_progress','completed') NOT NULL DEFAULT 'not_started',
	`progress` int NOT NULL DEFAULT 0,
	`completedAt` timestamp,
	`lastReviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lessonProgress_id` PRIMARY KEY(`id`),
	CONSTRAINT `lessonProgress_user_lesson_unique` UNIQUE(`userId`,`lessonId`)
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chapterId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`estimatedMinutes` int NOT NULL DEFAULT 30,
	`notes` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lessons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notebooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notebooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notebookId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pomodoroSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`subjectId` int,
	`plannedMinutes` int NOT NULL,
	`completedMinutes` int NOT NULL DEFAULT 0,
	`state` enum('running','paused','completed','cancelled') NOT NULL DEFAULT 'running',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pomodoroSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rewardPurchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`rewardId` int NOT NULL,
	`cost` int NOT NULL,
	`referenceKey` varchar(160) NOT NULL,
	`purchasedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rewardPurchases_id` PRIMARY KEY(`id`),
	CONSTRAINT `rewardPurchases_referenceKey_unique` UNIQUE(`referenceKey`)
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`catalogId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`cost` int NOT NULL,
	`rarity` enum('common','uncommon','rare','epic','legendary','mythic') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `rewards_id` PRIMARY KEY(`id`),
	CONSTRAINT `rewards_catalogId_unique` UNIQUE(`catalogId`)
);
--> statement-breakpoint
CREATE TABLE `studyCycles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleKey` varchar(96) NOT NULL,
	`startAt` timestamp NOT NULL,
	`endAt` timestamp NOT NULL,
	`status` enum('active','completed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studyCycles_id` PRIMARY KEY(`id`),
	CONSTRAINT `studyCycles_user_cycleKey_unique` UNIQUE(`userId`,`cycleKey`)
);
--> statement-breakpoint
CREATE TABLE `studyEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`subjectId` int,
	`eventType` enum('lesson_complete','lesson_review','task_complete','habit_complete','goal_complete','pomodoro_complete','video_block','exam_complete') NOT NULL,
	`referenceId` varchar(100) NOT NULL,
	`durationMinutes` int NOT NULL DEFAULT 0,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studyEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `studyEvents_user_reference_unique` UNIQUE(`userId`,`referenceId`)
);
--> statement-breakpoint
CREATE TABLE `studyVideoSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`videoUrl` text NOT NULL,
	`activeSeconds` int NOT NULL DEFAULT 0,
	`completedBlocks` int NOT NULL DEFAULT 0,
	`phase` enum('watching','break','completed') NOT NULL DEFAULT 'watching',
	`breakEndsAt` timestamp,
	`lastPlaybackAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `studyVideoSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`color` varchar(16) NOT NULL DEFAULT '#10B981',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`scheduledFor` date,
	`deadline` timestamp,
	`priority` enum('urgent','medium','low') NOT NULL DEFAULT 'medium',
	`status` enum('open','completed') NOT NULL DEFAULT 'open',
	`category` varchar(80) NOT NULL DEFAULT 'دراسة',
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userAchievements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cycleId` int NOT NULL,
	`achievementId` int NOT NULL,
	`unlockedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userAchievements_id` PRIMARY KEY(`id`),
	CONSTRAINT `userAchievements_cycle_achievement_unique` UNIQUE(`userId`,`cycleId`,`achievementId`)
);
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD CONSTRAINT `calendarEvents_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD CONSTRAINT `calendarEvents_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chapters` ADD CONSTRAINT `chapters_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coinTransactions` ADD CONSTRAINT `coinTransactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coinTransactions` ADD CONSTRAINT `coinTransactions_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examAttempts` ADD CONSTRAINT `examAttempts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examAttempts` ADD CONSTRAINT `examAttempts_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examAttempts` ADD CONSTRAINT `examAttempts_examId_exams_id_fk` FOREIGN KEY (`examId`) REFERENCES `exams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_chapterId_chapters_id_fk` FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_lessonId_lessons_id_fk` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goalMilestones` ADD CONSTRAINT `goalMilestones_goalId_goals_id_fk` FOREIGN KEY (`goalId`) REFERENCES `goals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goals` ADD CONSTRAINT `goals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goals` ADD CONSTRAINT `goals_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `habitCompletions` ADD CONSTRAINT `habitCompletions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `habitCompletions` ADD CONSTRAINT `habitCompletions_habitId_habits_id_fk` FOREIGN KEY (`habitId`) REFERENCES `habits`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `habitCompletions` ADD CONSTRAINT `habitCompletions_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `habits` ADD CONSTRAINT `habits_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `habits` ADD CONSTRAINT `habits_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lessonProgress` ADD CONSTRAINT `lessonProgress_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lessonProgress` ADD CONSTRAINT `lessonProgress_lessonId_lessons_id_fk` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_chapterId_chapters_id_fk` FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notebooks` ADD CONSTRAINT `notebooks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notebooks` ADD CONSTRAINT `notebooks_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notes` ADD CONSTRAINT `notes_notebookId_notebooks_id_fk` FOREIGN KEY (`notebookId`) REFERENCES `notebooks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pomodoroSessions` ADD CONSTRAINT `pomodoroSessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pomodoroSessions` ADD CONSTRAINT `pomodoroSessions_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pomodoroSessions` ADD CONSTRAINT `pomodoroSessions_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rewardPurchases` ADD CONSTRAINT `rewardPurchases_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rewardPurchases` ADD CONSTRAINT `rewardPurchases_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rewardPurchases` ADD CONSTRAINT `rewardPurchases_rewardId_rewards_id_fk` FOREIGN KEY (`rewardId`) REFERENCES `rewards`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studyCycles` ADD CONSTRAINT `studyCycles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studyEvents` ADD CONSTRAINT `studyEvents_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studyEvents` ADD CONSTRAINT `studyEvents_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studyEvents` ADD CONSTRAINT `studyEvents_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studyVideoSessions` ADD CONSTRAINT `studyVideoSessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studyVideoSessions` ADD CONSTRAINT `studyVideoSessions_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userAchievements` ADD CONSTRAINT `userAchievements_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userAchievements` ADD CONSTRAINT `userAchievements_cycleId_studyCycles_id_fk` FOREIGN KEY (`cycleId`) REFERENCES `studyCycles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userAchievements` ADD CONSTRAINT `userAchievements_achievementId_achievements_id_fk` FOREIGN KEY (`achievementId`) REFERENCES `achievements`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `calendarEvents_user_cycle_date_idx` ON `calendarEvents` (`userId`,`cycleId`,`startsAt`);--> statement-breakpoint
CREATE INDEX `chapters_subject_idx` ON `chapters` (`subjectId`);--> statement-breakpoint
CREATE INDEX `coinTransactions_user_cycle_idx` ON `coinTransactions` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `examAttempts_user_cycle_idx` ON `examAttempts` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `exams_user_cycle_idx` ON `exams` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `goalMilestones_goal_idx` ON `goalMilestones` (`goalId`);--> statement-breakpoint
CREATE INDEX `goals_user_cycle_idx` ON `goals` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `habitCompletions_user_cycle_idx` ON `habitCompletions` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `habits_user_cycle_idx` ON `habits` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `lessonProgress_user_status_idx` ON `lessonProgress` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `lessons_chapter_idx` ON `lessons` (`chapterId`);--> statement-breakpoint
CREATE INDEX `notebooks_user_cycle_idx` ON `notebooks` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `notes_notebook_idx` ON `notes` (`notebookId`);--> statement-breakpoint
CREATE INDEX `pomodoroSessions_user_cycle_idx` ON `pomodoroSessions` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `rewardPurchases_user_cycle_idx` ON `rewardPurchases` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `studyCycles_user_status_idx` ON `studyCycles` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `studyEvents_user_cycle_date_idx` ON `studyEvents` (`userId`,`cycleId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `studyVideoSessions_user_cycle_idx` ON `studyVideoSessions` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `subjects_user_cycle_idx` ON `subjects` (`userId`,`cycleId`);--> statement-breakpoint
CREATE INDEX `tasks_user_cycle_date_idx` ON `tasks` (`userId`,`cycleId`,`scheduledFor`);