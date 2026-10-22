-- RenameForeignKey
ALTER TABLE "ReturnRequest" RENAME CONSTRAINT "ReturnRequest_orderItemId_fkey" TO "ReturnRequest_orderItemId_orderId_fkey";
