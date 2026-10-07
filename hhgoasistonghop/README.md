# HHGO CRM — Version 1 (HHG Oasis)

CRM nội bộ: **Resort · Spa · Olympic · Pickleball** · 12 gói membership (Bơi / Pick / VIP).

## Chạy local

Cần **PostgreSQL** (Neon free / Docker / Prisma Postgres). SQLite không còn dùng (để deploy Vercel được).

```bash
cp .env.example .env
# Điền DATABASE_URL + AUTH_SECRET vào .env

npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

http://localhost:3000

| Email | Role | Password |
|-------|------|----------|
| `admin@hhgo.local` | ADMIN | `Password123!` |
| `manager@hhgo.local` | MANAGER | `Password123!` |
| `staff@hhgo.local` | STAFF | `Password123!` |

## Deploy Vercel (bắt buộc set env)

Lỗi `Server error` / `/api/auth/error` = **thiếu `AUTH_SECRET`** trên Vercel.

Vào **Vercel → Project → Settings → Environment Variables** (Production + Preview), thêm:

| Key | Value |
|-----|--------|
| `AUTH_SECRET` | chạy `openssl rand -base64 32` rồi dán kết quả |
| `NEXTAUTH_SECRET` | **cùng giá trị** với `AUTH_SECRET` |
| `AUTH_URL` | `https://hhgoasis-crm.vercel.app` (đúng domain Vercel của bạn) |
| `NEXTAUTH_URL` | cùng `AUTH_URL` |
| `DATABASE_URL` | connection string PostgreSQL (Neon/Supabase/…) có `?sslmode=require` |

Rồi **Redeploy**.

### Tạo DB Neon (free) nhanh

1. https://console.neon.tech → New project  
2. Copy connection string → dán vào `DATABASE_URL` trên Vercel  
3. Redeploy (build sẽ chạy `prisma migrate deploy`)  
4. Seed data demo **một lần** (máy local, trỏ `DATABASE_URL` production):

```bash
DATABASE_URL="postgresql://..." npm run db:seed
```

## Kiến trúc

```
Customer
  ├─ Visit → Service Usage → Service (khu)
  └─ Membership → Plan (Bơi/Pick/VIP · mỗi loại 1–4) → Services (dấu X)
```
