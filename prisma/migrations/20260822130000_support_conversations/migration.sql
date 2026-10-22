-- Allow support chats that are not tied to a service request.
ALTER TABLE "Conversation" ALTER COLUMN "requestId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "Conversation_customerId_requestId_idx"
  ON "Conversation"("customerId", "requestId");
