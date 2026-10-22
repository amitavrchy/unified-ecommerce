-- Equipment additional features shown on the admin equipment registry.
ALTER TABLE "Equipment"
ADD COLUMN "additionalFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Allow multiple item-scoped returns per order while keeping one active
-- full-order return and one active return per item.
ALTER TABLE "ReturnRequest" DROP CONSTRAINT IF EXISTS "ReturnRequest_orderId_key";
DROP INDEX IF EXISTS "ReturnRequest_orderId_key";
DROP INDEX IF EXISTS "ReturnRequest_orderItemId_key";
DROP INDEX IF EXISTS "ReturnRequest_orderItemId_orderId_key";

CREATE UNIQUE INDEX "ReturnRequest_one_active_full_order_return_key"
ON "ReturnRequest"("orderId")
WHERE "orderItemId" IS NULL AND "status" <> 'REJECTED';

CREATE UNIQUE INDEX "ReturnRequest_one_active_item_return_key"
ON "ReturnRequest"("orderItemId")
WHERE "orderItemId" IS NOT NULL AND "status" <> 'REJECTED';

CREATE INDEX "ReturnRequest_orderId_status_idx"
ON "ReturnRequest"("orderId", "status");
