ALTER TABLE `pomodoroSessions` ADD `pausedAt` timestamp;
ALTER TABLE `pomodoroSessions` ADD `pausedSeconds` int DEFAULT 0 NOT NULL;
