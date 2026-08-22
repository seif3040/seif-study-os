ALTER TABLE `studyVideoSessions` ADD `lessonTitle` varchar(220);--> statement-breakpoint
ALTER TABLE `studyVideoSessions` ADD `subject` enum('arabic','history','english','programming_ai','german','other') DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `studyVideoSessions` ADD `sourceMode` enum('embedded','external') DEFAULT 'embedded' NOT NULL;--> statement-breakpoint
ALTER TABLE `studyVideoSessions` ADD `manualProgress` enum('started','middle','finished','reviewed') DEFAULT 'started' NOT NULL;--> statement-breakpoint
ALTER TABLE `studyVideoSessions` ADD `timerRunning` boolean DEFAULT false NOT NULL;