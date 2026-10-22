-- CreateEnum
CREATE TYPE "QuoteCounterofferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "negotiatedTotal" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "QuoteCounteroffer" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestedTotal" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "status" "QuoteCounterofferStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteCounteroffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteCounterofferStatusHistory" (
    "id" TEXT NOT NULL,
    "counterofferId" TEXT NOT NULL,
    "status" "QuoteCounterofferStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteCounterofferStatusHistory_pkey" PRIMARY KEY ("id")
);

-- A partial unique index is the concurrency-safe source of truth for one
-- unresolved counteroffer per quotation.
CREATE UNIQUE INDEX "QuoteCounteroffer_one_pending_per_quotation_key"
ON "QuoteCounteroffer"("quotationId")
WHERE "status" = 'PENDING';

CREATE INDEX "QuoteCounteroffer_quotationId_status_createdAt_idx"
ON "QuoteCounteroffer"("quotationId", "status", "createdAt");

CREATE INDEX "QuoteCounteroffer_customerId_createdAt_idx"
ON "QuoteCounteroffer"("customerId", "createdAt");

CREATE INDEX "QuoteCounterofferStatusHistory_counterofferId_createdAt_idx"
ON "QuoteCounterofferStatusHistory"("counterofferId", "createdAt");

ALTER TABLE "QuoteCounteroffer"
ADD CONSTRAINT "QuoteCounteroffer_quotationId_fkey"
FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteCounteroffer"
ADD CONSTRAINT "QuoteCounteroffer_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteCounteroffer"
ADD CONSTRAINT "QuoteCounteroffer_decidedById_fkey"
FOREIGN KEY ("decidedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuoteCounterofferStatusHistory"
ADD CONSTRAINT "QuoteCounterofferStatusHistory_counterofferId_fkey"
FOREIGN KEY ("counterofferId") REFERENCES "QuoteCounteroffer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Add customer ownership to existing equipment before making it required.
ALTER TABLE "Equipment" ADD COLUMN "customerId" TEXT;

UPDATE "Equipment" AS equipment
SET "customerId" = request."customerId"
FROM "ServiceRequest" AS request
WHERE equipment."requestId" = request."id";

ALTER TABLE "Equipment" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "Equipment" ALTER COLUMN "requestId" DROP NOT NULL;

ALTER TABLE "Equipment" DROP CONSTRAINT "Equipment_requestId_fkey";

ALTER TABLE "Equipment"
ADD CONSTRAINT "Equipment_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Equipment"
ADD CONSTRAINT "Equipment_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Equipment_customerId_idx" ON "Equipment"("customerId");
CREATE INDEX "Equipment_requestId_idx" ON "Equipment"("requestId");

-- CreateTable
CREATE TABLE "EquipmentMedia" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EquipmentMedia_equipmentId_createdAt_idx"
ON "EquipmentMedia"("equipmentId", "createdAt");

ALTER TABLE "EquipmentMedia"
ADD CONSTRAINT "EquipmentMedia_equipmentId_fkey"
FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing products remain valid; SKU can be assigned as inventory is curated.
ALTER TABLE "Product" ADD COLUMN "sku" TEXT;
ALTER TABLE "Product" ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- Existing order-level returns remain valid until a specific item is assigned.
ALTER TABLE "ReturnRequest" ADD COLUMN "orderItemId" TEXT;
CREATE UNIQUE INDEX "OrderItem_id_orderId_key" ON "OrderItem"("id", "orderId");
CREATE UNIQUE INDEX "ReturnRequest_orderItemId_key" ON "ReturnRequest"("orderItemId");
CREATE UNIQUE INDEX "ReturnRequest_orderItemId_orderId_key"
ON "ReturnRequest"("orderItemId", "orderId");

ALTER TABLE "ReturnRequest"
ADD CONSTRAINT "ReturnRequest_orderItemId_fkey"
FOREIGN KEY ("orderItemId", "orderId") REFERENCES "OrderItem"("id", "orderId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "businessName" TEXT,
    "officePhone" TEXT,
    "supportEmail" TEXT,
    "businessAddress" TEXT,
    "serviceArea" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BusinessSettings_singleton_check" CHECK ("id" = 1)
);

INSERT INTO "BusinessSettings" ("id", "createdAt", "updatedAt")
VALUES (1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE INDEX "Notification_userId_createdAt_idx"
ON "Notification"("userId", "createdAt");
