-- CreateEnum
CREATE TYPE "BkashPaymentStatus" AS ENUM ('PENDING', 'INITIATED', 'COMPLETED', 'FAILED', 'CANCELLED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "settlements" ADD COLUMN     "transactionReference" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "bkash_payments" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "merchantInvoiceNumber" TEXT NOT NULL,
    "paymentID" TEXT,
    "trxID" TEXT,
    "status" "BkashPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payerReference" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "bkash_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bkash_payments_merchantInvoiceNumber_key" ON "bkash_payments"("merchantInvoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "bkash_payments_paymentID_key" ON "bkash_payments"("paymentID");

-- CreateIndex
CREATE UNIQUE INDEX "bkash_payments_trxID_key" ON "bkash_payments"("trxID");

-- CreateIndex
CREATE INDEX "bkash_payments_groupId_createdAt_idx" ON "bkash_payments"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "bkash_payments_userId_createdAt_idx" ON "bkash_payments"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "bkash_payments_status_idx" ON "bkash_payments"("status");

-- AddForeignKey
ALTER TABLE "bkash_payments" ADD CONSTRAINT "bkash_payments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bkash_payments" ADD CONSTRAINT "bkash_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain guards (Prisma does not model CHECK constraints).
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_distinct_parties" CHECK ("fromUserId" <> "toUserId");
ALTER TABLE "bkash_payments" ADD CONSTRAINT "bkash_payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "bkash_payments" ADD CONSTRAINT "bkash_payments_currency_bdt" CHECK ("currency" = 'BDT');
