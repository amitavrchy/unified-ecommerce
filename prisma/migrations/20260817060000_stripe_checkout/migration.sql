ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'SUCCEEDED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

CREATE TYPE "PaymentPurpose" AS ENUM ('ORDER', 'QUOTATION');

ALTER TABLE "Order" ADD COLUMN "estimatedDelivery" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "inventoryReservedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "inventoryReleasedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "paidAt" TIMESTAMP(3);

ALTER TABLE "Payment" ALTER COLUMN "quotationId" DROP NOT NULL;
ALTER TABLE "Payment" ADD COLUMN "orderId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "purpose" "PaymentPurpose";
ALTER TABLE "Payment" ADD COLUMN "stripeCheckoutSessionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripePaymentIntentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'cad';
ALTER TABLE "Payment" ADD COLUMN "failureCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "failureMessage" TEXT;
ALTER TABLE "Payment" ADD COLUMN "authorizedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "capturedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "metadata" JSONB;
ALTER TABLE "Payment" ALTER COLUMN "provider" SET DEFAULT 'stripe';
ALTER TABLE "Payment" ALTER COLUMN "providerReference" DROP NOT NULL;

-- Existing quotation payments predate the order checkout flow. Backfill before
-- making the new discriminator mandatory so this migration is safe on a live DB.
UPDATE "Payment" SET "purpose" = 'QUOTATION' WHERE "purpose" IS NULL;
ALTER TABLE "Payment" ALTER COLUMN "purpose" SET NOT NULL;

CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "objectId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "processingError" TEXT,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");
