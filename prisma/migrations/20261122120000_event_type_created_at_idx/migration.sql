-- Desk finds today's scans by event type and time.
CREATE INDEX IF NOT EXISTS "app_service_events_eventType_createdAt_idx"
  ON "app_service_events"("eventType", "createdAt");
