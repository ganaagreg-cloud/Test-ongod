-- AlterTable
ALTER TABLE `Episode` ADD COLUMN `notifyOnPublish` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `pushText` TEXT NULL,
    ADD COLUMN `seriesId` VARCHAR(191) NULL,
    ADD COLUMN `seriesPart` INTEGER NULL;

-- CreateTable
CREATE TABLE `Series` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL DEFAULT (''),
    `coverPath` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Series_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Playlist` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL DEFAULT (''),
    `coverPath` VARCHAR(191) NULL,
    `showOnHome` BOOLEAN NOT NULL DEFAULT false,
    `homeOrder` INTEGER NOT NULL DEFAULT 0,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Playlist_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlaylistItem` (
    `playlistId` VARCHAR(191) NOT NULL,
    `episodeId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `PlaylistItem_episodeId_idx`(`episodeId`),
    PRIMARY KEY (`playlistId`, `episodeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tag` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Tag_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EpisodeTag` (
    `episodeId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,

    INDEX `EpisodeTag_tagId_idx`(`tagId`),
    PRIMARY KEY (`episodeId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Episode_seriesId_idx` ON `Episode`(`seriesId`);

-- CreateIndex
CREATE UNIQUE INDEX `Episode_seriesId_seriesPart_key` ON `Episode`(`seriesId`, `seriesPart`);

-- AddForeignKey
ALTER TABLE `Episode` ADD CONSTRAINT `Episode_seriesId_fkey` FOREIGN KEY (`seriesId`) REFERENCES `Series`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaylistItem` ADD CONSTRAINT `PlaylistItem_playlistId_fkey` FOREIGN KEY (`playlistId`) REFERENCES `Playlist`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaylistItem` ADD CONSTRAINT `PlaylistItem_episodeId_fkey` FOREIGN KEY (`episodeId`) REFERENCES `Episode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EpisodeTag` ADD CONSTRAINT `EpisodeTag_episodeId_fkey` FOREIGN KEY (`episodeId`) REFERENCES `Episode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EpisodeTag` ADD CONSTRAINT `EpisodeTag_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

