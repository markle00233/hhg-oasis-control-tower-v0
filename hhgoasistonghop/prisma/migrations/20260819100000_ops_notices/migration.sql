CREATE TABLE IF NOT EXISTS "OpsNotice" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "department" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpsNotice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OpsNotice_createdAt_idx" ON "OpsNotice"("createdAt");
CREATE INDEX IF NOT EXISTS "OpsNotice_actorId_idx" ON "OpsNotice"("actorId");

CREATE TABLE IF NOT EXISTS "OpsNoticeRead" (
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpsNoticeRead_pkey" PRIMARY KEY ("noticeId","userId")
);

CREATE INDEX IF NOT EXISTS "OpsNoticeRead_userId_idx" ON "OpsNoticeRead"("userId");

DO $$
BEGIN
  ALTER TABLE "OpsNotice"
    ADD CONSTRAINT "OpsNotice_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "OpsNoticeRead"
    ADD CONSTRAINT "OpsNoticeRead_noticeId_fkey"
    FOREIGN KEY ("noticeId") REFERENCES "OpsNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "OpsNoticeRead"
    ADD CONSTRAINT "OpsNoticeRead_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
