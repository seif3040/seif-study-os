ALTER TABLE `exams` ADD `origin` enum('manual','notebook_ai') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `exams` ADD `notebookId` int;--> statement-breakpoint
ALTER TABLE `exams` ADD `quizPayload` json;