-- AlterTable
ALTER TABLE `User` ADD COLUMN `totpEnabledAt` DATETIME(3) NULL,
    ADD COLUMN `totpLastStep` INTEGER NULL;

-- AlterTable
ALTER TABLE `Session` ADD COLUMN `totpVerifiedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Subscription` ADD COLUMN `reminderSentAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Subscription_status_endsAt_idx` ON `Subscription`(`status`, `endsAt`);

-- CreateIndex
CREATE INDEX `AuditLog_createdAt_idx` ON `AuditLog`(`createdAt`);
