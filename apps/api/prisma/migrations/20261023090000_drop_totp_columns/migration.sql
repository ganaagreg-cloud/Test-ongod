-- AlterTable
ALTER TABLE `User` DROP COLUMN `totpEnabledAt`,
    DROP COLUMN `totpLastStep`,
    DROP COLUMN `totpSecret`;

-- AlterTable
ALTER TABLE `Session` DROP COLUMN `totpVerifiedAt`;
