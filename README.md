# HHG Oasis — Control Tower Lite V0 + Prisma

Prototype UI + API lưu dữ liệu bằng **Prisma + Postgres (Neon)** — mọi người dùng chung trên Vercel.

## Bạn cần đưa gì?

**Không cần Prisma API token.**  
Cần **`DATABASE_URL`** từ [Neon](https://console.neon.tech) (Postgres miễn phí):

1. Tạo account Neon → New Project
2. Copy **Connection string** (URI), chọn **Pooled** nếu có
3. Dạng: `postgresql://USER:PASSWORD@HOST/DB?sslmode=require`
4. Dán vào Vercel → Project → Settings → Environment Variables → `DATABASE_URL`
5. (Local) tạo file `.env` với cùng biến đó

## Chạy local

```bash
cp .env.example .env   # rồi dán DATABASE_URL Neon vào
npm install
npm run db:setup
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000)

## Lưu được gì

| Form trên UI | API | Bảng Prisma |
|---|---|---|
| Chốt ngày | `POST /api/daily-closes` | `DailyClose` |
| Ghi chi phí | `POST /api/expenses` | `Expense` |
| Tạo việc | `POST /api/tasks` | `Task` |
| Báo vấn đề | `POST /api/issues` | `Issue` |
| Tổng quan | `GET /api/dashboard` | tổng hợp |

## Deploy Vercel

1. Push repo GitHub
2. Import / Redeploy trên Vercel (Framework: Next.js)
3. Set env `DATABASE_URL`
4. Build Command: `npm run vercel-build` (tạo bảng trên Neon rồi build)

Sau đó ai mở link cũng ghi/đọc **cùng một DB Neon**.

## Important

Số liệu seed / demo là minh họa, không phải số vận hành HHG Oasis thật.
