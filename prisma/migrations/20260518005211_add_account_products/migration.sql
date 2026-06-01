-- AlterTable
ALTER TABLE `accounts` ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT 'XAF',
    ADD COLUMN `managerId` VARCHAR(191) NULL,
    ADD COLUMN `productId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `account_products` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `interestRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `minOpeningDeposit` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `openingFees` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `minBalance` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `maintenanceFees` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `maintenanceFrequency` VARCHAR(191) NULL,
    `lockDurationMonths` INTEGER NOT NULL DEFAULT 0,
    `earlyWithdrawalPenalty` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `account_products_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `account_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
