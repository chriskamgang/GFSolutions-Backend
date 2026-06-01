-- AlterTable
ALTER TABLE `clients` ADD COLUMN `signatureRule` ENUM('SINGLE', 'JOINT') NOT NULL DEFAULT 'SINGLE';

-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `signataireId` VARCHAR(191) NULL,
    ADD COLUMN `signataireVerifie` BOOLEAN NOT NULL DEFAULT false;
