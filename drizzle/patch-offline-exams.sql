CREATE TABLE IF NOT EXISTS `offlineExamWrites` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `requestKey` VARCHAR(36) NOT NULL,
  `attemptId` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `offlineExamWrites_user_request` (`userId`, `requestKey`),
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);