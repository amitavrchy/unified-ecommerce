-- One technician note per service request (separate from the service report).
CREATE TABLE "ServiceRequestNote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequestNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceRequestNote_requestId_key" ON "ServiceRequestNote"("requestId");

ALTER TABLE "ServiceRequestNote"
ADD CONSTRAINT "ServiceRequestNote_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
