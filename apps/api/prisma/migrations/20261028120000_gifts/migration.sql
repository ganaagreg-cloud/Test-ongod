-- CreateTable
CREATE TABLE `Gift` (
    `id` VARCHAR(191) NOT NULL,
    `buyerId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING_PAYMENT', 'PAID', 'REDEEMED', 'CANCELLED', 'EXPIRED', 'VOID') NOT NULL DEFAULT 'PENDING_PAYMENT',
    `amountMnt` INTEGER NOT NULL,
    `durationDays` INTEGER NOT NULL,
    `code` VARCHAR(191) NULL,
    `paymentProvider` ENUM('WIRE', 'MOCK', 'NONE') NOT NULL DEFAULT 'NONE',
    `wirePaymentIntentId` VARCHAR(191) NULL,
    `checkoutUrl` TEXT NULL,
    `paidAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `redeemedById` VARCHAR(191) NULL,
    `redeemedAt` DATETIME(3) NULL,
    `subscriptionId` VARCHAR(191) NULL,
    `voidedById` VARCHAR(191) NULL,
    `voidReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Gift_code_key`(`code`),
    UNIQUE INDEX `Gift_wirePaymentIntentId_key`(`wirePaymentIntentId`),
    UNIQUE INDEX `Gift_subscriptionId_key`(`subscriptionId`),
    INDEX `Gift_buyerId_status_idx`(`buyerId`, `status`),
    INDEX `Gift_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Gift_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Gift` ADD CONSTRAINT `Gift_buyerId_fkey` FOREIGN KEY (`buyerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Gift` ADD CONSTRAINT `Gift_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Gift` ADD CONSTRAINT `Gift_redeemedById_fkey` FOREIGN KEY (`redeemedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Gift` ADD CONSTRAINT `Gift_voidedById_fkey` FOREIGN KEY (`voidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Gift` ADD CONSTRAINT `Gift_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

