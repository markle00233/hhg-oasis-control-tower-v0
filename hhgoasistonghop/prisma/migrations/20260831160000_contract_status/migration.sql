-- AlterTable
ALTER TABLE "ServiceContract" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'EMPTY';

-- CreateIndex
CREATE INDEX "ServiceContract_status_idx" ON "ServiceContract"("status");
