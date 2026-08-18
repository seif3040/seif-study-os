CREATE TABLE `examLessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examId` int NOT NULL,
	`lessonId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `examLessons_id` PRIMARY KEY(`id`),
	CONSTRAINT `examLessons_exam_lesson_unique` UNIQUE(`examId`,`lessonId`)
);
--> statement-breakpoint
ALTER TABLE `examLessons` ADD CONSTRAINT `examLessons_examId_exams_id_fk` FOREIGN KEY (`examId`) REFERENCES `exams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examLessons` ADD CONSTRAINT `examLessons_lessonId_lessons_id_fk` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `examLessons_lesson_idx` ON `examLessons` (`lessonId`);