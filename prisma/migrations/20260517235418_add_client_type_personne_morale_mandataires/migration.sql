-- AlterTable
ALTER TABLE `clients` ADD COLUMN `clientType` ENUM('PHYSIQUE', 'MORALE') NOT NULL DEFAULT 'PHYSIQUE',
    ADD COLUMN `dateConstitution` DATETIME(3) NULL,
    ADD COLUMN `dateExpirationPiece` DATETIME(3) NULL,
    ADD COLUMN `formeJuridique` ENUM('SA', 'SARL', 'SAS', 'ASSOCIATION', 'GIE', 'COOPERATIVE') NULL,
    ADD COLUMN `identifiantFiscal` VARCHAR(191) NULL,
    ADD COLUMN `lieuNaissance` VARCHAR(191) NULL,
    ADD COLUMN `numeroEnregistrement` VARCHAR(191) NULL,
    ADD COLUMN `phoneSecondaire` VARCHAR(191) NULL,
    ADD COLUMN `profession` VARCHAR(191) NULL,
    ADD COLUMN `raisonSociale` VARCHAR(191) NULL,
    ADD COLUMN `revenuMensuel` DECIMAL(15, 0) NULL,
    ADD COLUMN `secteurActivite` VARCHAR(191) NULL,
    MODIFY `firstName` VARCHAR(191) NULL,
    MODIFY `lastName` VARCHAR(191) NULL,
    MODIFY `gender` ENUM('MALE', 'FEMALE') NULL,
    MODIFY `dateOfBirth` DATETIME(3) NULL,
    MODIFY `idDocumentType` ENUM('CNI', 'PASSPORT', 'RESIDENCE_PERMIT', 'RECEPISSE') NULL,
    MODIFY `idDocumentNumber` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `mandataires` (
    `id` VARCHAR(191) NOT NULL,
    `clientMoraleId` VARCHAR(191) NOT NULL,
    `clientPhysiqueId` VARCHAR(191) NOT NULL,
    `role` ENUM('GERANT', 'PRESIDENT', 'SECRETAIRE_GENERAL', 'TRESORIER', 'DIRECTEUR') NOT NULL,
    `isSignataire` BOOLEAN NOT NULL DEFAULT false,
    `signatureUrl` VARCHAR(191) NULL,
    `documentUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `mandataires_clientMoraleId_idx`(`clientMoraleId`),
    INDEX `mandataires_clientPhysiqueId_idx`(`clientPhysiqueId`),
    UNIQUE INDEX `mandataires_clientMoraleId_clientPhysiqueId_key`(`clientMoraleId`, `clientPhysiqueId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mandataires` ADD CONSTRAINT `mandataires_clientMoraleId_fkey` FOREIGN KEY (`clientMoraleId`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mandataires` ADD CONSTRAINT `mandataires_clientPhysiqueId_fkey` FOREIGN KEY (`clientPhysiqueId`) REFERENCES `clients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
