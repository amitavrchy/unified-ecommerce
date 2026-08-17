ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'VIEWED';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TYPE "TechnicianVerificationStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');

ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "notificationEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notificationPush" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "TechnicianProfile" ADD COLUMN "verificationStatus" "TechnicianVerificationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION';
ALTER TABLE "TechnicianProfile" ADD COLUMN "verificationNotes" TEXT;
ALTER TABLE "TechnicianProfile" ADD COLUMN "verifiedAt" TIMESTAMP(3);

ALTER TABLE "ServiceRequest" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "ServiceRequest" ADD COLUMN "cancellationReason" TEXT;

CREATE TABLE "ServiceRequestStatusHistory" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "status" "RequestStatus" NOT NULL,
  "note" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceRequestStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceRequestStatusHistory_requestId_createdAt_idx" ON "ServiceRequestStatusHistory"("requestId", "createdAt");
ALTER TABLE "ServiceRequestStatusHistory" ADD CONSTRAINT "ServiceRequestStatusHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quotation" ADD COLUMN "viewedAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN "acceptanceTermsAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN "acceptanceTermsVersion" TEXT;

ALTER TABLE "Product" ADD COLUMN "slug" TEXT;
ALTER TABLE "Product" ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Product" ADD COLUMN "specifications" JSONB;
ALTER TABLE "Product" ADD COLUMN "warranty" TEXT;
ALTER TABLE "Product" ADD COLUMN "shippingInfo" TEXT;
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

ALTER TABLE "Order" ADD COLUMN "carrier" TEXT;
CREATE TABLE "OrderStatusHistory" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "note" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Cart" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Cart_customerId_key" ON "Cart"("customerId");
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CartItem" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");
CREATE INDEX "CartItem_productId_idx" ON "CartItem"("productId");
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReturnRequest" ADD COLUMN "resolution" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN "adminNotes" TEXT;
ALTER TABLE "ReturnRequest" ADD COLUMN "returnLabelUrl" TEXT;
