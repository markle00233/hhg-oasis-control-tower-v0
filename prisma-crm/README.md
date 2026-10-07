# Legacy schema for OPTIONAL one-shot import from old HHGO CRM web DB.
# Runtime Control Tower uses prisma/schema.prisma (Crm* models → crm_* tables)
# on DATABASE_URL only. Do not wire this client into the app.
generator client {
  provider = "prisma-client-js"
  output   = "../node_modules/.prisma/crm-client"
}

datasource db {
  provider = "postgresql"
  url      = env("CRM_DATABASE_URL")
}
