/*
  Warnings:

  - You are about to drop the `contribution_groups` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `contribution_members` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `contribution_payments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `contribution_schedules` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `contribution_members` DROP FOREIGN KEY `contribution_members_clientId_fkey`;

-- DropForeignKey
ALTER TABLE `contribution_members` DROP FOREIGN KEY `contribution_members_groupId_fkey`;

-- DropForeignKey
ALTER TABLE `contribution_payments` DROP FOREIGN KEY `contribution_payments_groupId_fkey`;

-- DropForeignKey
ALTER TABLE `contribution_payments` DROP FOREIGN KEY `contribution_payments_memberId_fkey`;

-- DropForeignKey
ALTER TABLE `contribution_schedules` DROP FOREIGN KEY `contribution_schedules_groupId_fkey`;

-- DropTable
DROP TABLE `contribution_groups`;

-- DropTable
DROP TABLE `contribution_members`;

-- DropTable
DROP TABLE `contribution_payments`;

-- DropTable
DROP TABLE `contribution_schedules`;

-- CreateTable
CREATE TABLE `savings_products` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `interestRate` DECIMAL(5, 2) NOT NULL,
    `minDeposit` DECIMAL(15, 0) NOT NULL DEFAULT 500,
    `minBalance` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `lockDurationMonths` INTEGER NOT NULL DEFAULT 0,
    `earlyWithdrawalPenalty` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `contributionFrequency` ENUM('DAILY', 'WEEKLY', 'MONTHLY') NULL,
    `contributionAmount` DECIMAL(15, 0) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `savings_products_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `savings_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `agencyId` VARCHAR(191) NOT NULL,
    `balance` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `totalDeposits` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `totalWithdrawals` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `interestEarned` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `nextContributionDate` DATETIME(3) NULL,
    `maturityDate` DATETIME(3) NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `savings_accounts_accountNumber_key`(`accountNumber`),
    INDEX `savings_accounts_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `savings_contributions` (
    `id` VARCHAR(191) NOT NULL,
    `savingsAccountId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(15, 0) NOT NULL,
    `balanceAfter` DECIMAL(15, 0) NOT NULL,
    `mobileMoneyProvider` ENUM('ORANGE_MONEY', 'MTN_MOMO', 'EXPRESS_UNION') NULL,
    `mobileMoneyPhone` VARCHAR(191) NULL,
    `mobileMoneyRef` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `savings_contributions_savingsAccountId_idx`(`savingsAccountId`),
    INDEX `savings_contributions_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cash_registers` (
    `id` VARCHAR(191) NOT NULL,
    `agencyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `openingBalance` DECIMAL(15, 0) NOT NULL,
    `closingBalance` DECIMAL(15, 0) NULL,
    `physicalBalance` DECIMAL(15, 0) NULL,
    `difference` DECIMAL(15, 0) NULL,
    `totalDeposits` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `totalWithdrawals` DECIMAL(15, 0) NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `notes` VARCHAR(191) NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `cash_registers_agencyId_idx`(`agencyId`),
    INDEX `cash_registers_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `savings_accounts` ADD CONSTRAINT `savings_accounts_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `savings_accounts` ADD CONSTRAINT `savings_accounts_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `savings_products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `savings_accounts` ADD CONSTRAINT `savings_accounts_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `savings_contributions` ADD CONSTRAINT `savings_contributions_savingsAccountId_fkey` FOREIGN KEY (`savingsAccountId`) REFERENCES `savings_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cash_registers` ADD CONSTRAINT `cash_registers_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cash_registers` ADD CONSTRAINT `cash_registers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
