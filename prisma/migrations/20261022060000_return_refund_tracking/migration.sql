ALTER TABLE "ReturnRequest"
  ADD COLUMN "stripeRefundId" TEXT,
  ADD COLUMN "refundAmount" DECIMAL(10,2),
  ADD COLUMN "refundStatus" TEXT,
  ADD COLUMN "refundAttempt" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "ReturnRequest_stripeRefundId_key" ON "ReturnRequest"("stripeRefundId");
