-- AlterTable
ALTER TABLE `Subscription` ADD COLUMN `checkoutUrl` TEXT NULL,
    ADD COLUMN `paymentProvider` ENUM('WIRE', 'MOCK', 'NONE') NOT NULL DEFAULT 'NONE',
    ADD COLUMN `wirePaymentIntentId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `WebhookEvent` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Subscription_wirePaymentIntentId_key` ON `Subscription`(`wirePaymentIntentId`);

