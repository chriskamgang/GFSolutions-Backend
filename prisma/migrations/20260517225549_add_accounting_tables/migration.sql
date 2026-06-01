-- CreateTable
CREATE TABLE `account_plan` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `parentCode` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `account_plan_code_key`(`code`),
    INDEX `account_plan_parentCode_idx`(`parentCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_entries` (
    `id` VARCHAR(191) NOT NULL,
    `entryNumber` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `debit` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `credit` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `label` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `sourceModule` VARCHAR(191) NULL,
    `sourceId` VARCHAR(191) NULL,
    `agencyId` VARCHAR(191) NOT NULL,
    `periodId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `journal_entries_entryNumber_key`(`entryNumber`),
    INDEX `journal_entries_date_idx`(`date`),
    INDEX `journal_entries_accountId_idx`(`accountId`),
    INDEX `journal_entries_agencyId_idx`(`agencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounting_periods` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `closedAt` DATETIME(3) NULL,
    `closedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `account_plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `accounting_periods`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
