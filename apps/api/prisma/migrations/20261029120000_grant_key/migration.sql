-- AlterTable
ALTER TABLE `Subscription` ADD COLUMN `grantKey` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Subscription_grantKey_key` ON `Subscription`(`grantKey`);
