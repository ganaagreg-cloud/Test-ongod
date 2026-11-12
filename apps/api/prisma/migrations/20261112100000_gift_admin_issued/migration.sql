-- AlterTable
ALTER TABLE `Gift` ADD COLUMN `adminIssued` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `note` VARCHAR(200) NULL,
    ADD COLUMN `issueKey` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Gift_issueKey_idx` ON `Gift`(`issueKey`);
