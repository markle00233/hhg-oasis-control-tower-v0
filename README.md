# HHG Oasis — Control Tower Lite V0 + Prisma

Prototype UI + API lưu dữ liệu bằng **Prisma + Postgres** — mọi người dùng chung trên Vercel.

**Live:** https://hhg-oasis-control-tower-v0.vercel.app

## Cập nhật sau bản live (đã merge tài liệu)

Package `HHG_OASIS_UPDATE_AFTER_LIVE_PACKAGE` đã giải nén vào:

➡️ [`docs/update-after-live/`](docs/update-after-live/)

| File | Vai trò |
|---|---|
| `README_FIRST.txt` | Đọc trước — **không** ghi đè app live bằng HTML demo |
| `01_MASTER_HANDOFF.md` | Spec delta: Decision↔Task, Hộp thư AI, Chi phí module, AI phân loại |
| `02_DEMO_REFERENCE_INDEX.html` | Tham chiếu UX/logic only — **không** deploy đè `public/index.html` |
| `03_AI_EXAMPLES.json` | Dữ liệu test AI (task / chi phí / doanh thu) |

Thứ tự đọc: README_FIRST → MASTER_HANDOFF → DEMO_REFERENCE → AI_EXAMPLES.

## Chạy local

```bash
cp .env.example .env   # rồi dán DATABASE_URL
npm install
npm run db:setup
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000)

## Lưu được gì (baseline live)

| Form trên UI | API | Bảng Prisma |
|---|---|---|
| Chốt ngày | `POST /api/daily-closes` | `DailyClose` |
| Ghi chi phí | `POST /api/expenses` | `Expense` |
| Tạo việc | `POST /api/tasks` | `Task` |
| Báo vấn đề | `POST /api/issues` | `Issue` |
| Dự án / Quyết định | `/api/projects`, `/api/decisions` | `Project`, `Decision` |
| Tổng quan | `GET /api/dashboard` | tổng hợp |

## Deploy Vercel

1. Push repo GitHub
2. Redeploy trên Vercel (Framework: Next.js)
3. Env `DATABASE_URL` = Prisma Postgres / Neon
4. Build: `npm run vercel-build`

## Important

Số liệu seed / demo là minh họa, không phải số vận hành HHG Oasis thật.  
AI chỉ gợi ý — không tự duyệt tiền / không tự ghi đè số liệu gốc (theo handoff).
