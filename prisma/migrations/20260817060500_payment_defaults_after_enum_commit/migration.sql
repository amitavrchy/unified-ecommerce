-- PostgreSQL does not allow an enum value added in a transaction to be used
-- until that transaction commits. Keep these defaults in the following
-- migration so `prisma migrate deploy` works on a clean as well as live DB.
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PAYMENT_PENDING';
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';
