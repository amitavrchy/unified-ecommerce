ALTER TABLE "Payment" ADD COLUMN "stripeRefundId" TEXT;
CREATE UNIQUE INDEX "Payment_stripeRefundId_key" ON "Payment"("stripeRefundId");
