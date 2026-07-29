-- CreateTable
CREATE TABLE "recovery_message" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subaccountId" TEXT NOT NULL,
    "sessionId" TEXT,
    "chatId" TEXT NOT NULL,
    "phone" TEXT,
    "ghlContactId" TEXT,
    "ghlConversationId" TEXT,
    "ghlMessageId" TEXT,
    "body" TEXT,
    "type" TEXT NOT NULL DEFAULT 'text',
    "attachments" JSONB,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "waMessageId" TEXT,
    "recoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recovery_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recovery_message_subaccountId_ghlMessageId_key" ON "recovery_message"("subaccountId", "ghlMessageId");

-- CreateIndex
CREATE INDEX "recovery_message_subaccountId_status_idx" ON "recovery_message"("subaccountId", "status");

-- AddForeignKey
ALTER TABLE "recovery_message" ADD CONSTRAINT "recovery_message_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_message" ADD CONSTRAINT "recovery_message_subaccountId_fkey" FOREIGN KEY ("subaccountId") REFERENCES "subaccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
