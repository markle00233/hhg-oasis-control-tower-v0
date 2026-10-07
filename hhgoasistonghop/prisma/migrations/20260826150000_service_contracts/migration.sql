-- CreateTable
CREATE TABLE "ServiceContract" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "formNo" TEXT NOT NULL,
    "memberCode" TEXT NOT NULL,
    "customerId" TEXT,
    "payload" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContract_formNo_key" ON "ServiceContract"("formNo");

-- CreateIndex
CREATE INDEX "ServiceContract_type_idx" ON "ServiceContract"("type");

-- CreateIndex
CREATE INDEX "ServiceContract_memberCode_idx" ON "ServiceContract"("memberCode");

-- CreateIndex
CREATE INDEX "ServiceContract_customerId_idx" ON "ServiceContract"("customerId");

-- CreateIndex
CREATE INDEX "ServiceContract_createdAt_idx" ON "ServiceContract"("createdAt");

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
