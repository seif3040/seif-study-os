CREATE TABLE `notebookSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notebookId` int NOT NULL,
	`fileName` varchar(320) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(768) NOT NULL,
	`extractedText` text,
	`characterCount` int NOT NULL DEFAULT 0,
	`isTruncated` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notebookSources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notebookSources` ADD CONSTRAINT `notebookSources_notebookId_notebooks_id_fk` FOREIGN KEY (`notebookId`) REFERENCES `notebooks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notebookSources_notebook_idx` ON `notebookSources` (`notebookId`);