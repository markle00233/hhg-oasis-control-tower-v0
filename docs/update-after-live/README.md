# Cập nhật sau bản live hiện tại

Baseline: https://hhg-oasis-control-tower-v0.vercel.app

Nội dung lấy từ `HHG_OASIS_UPDATE_AFTER_LIVE_PACKAGE` (18/09/2026).

## Quy tắc merge

1. **Giữ** codebase Next.js + Prisma đang chạy trên Vercel.
2. **Không** thay `public/index.html` / `public/app.js` bằng `02_DEMO_REFERENCE_INDEX.html`.
3. Implement theo `01_MASTER_HANDOFF.md` (delta sau baseline).
4. Dùng `03_AI_EXAMPLES.json` khi test Hộp thư AI / phân loại chi phí.

## 4 cụm P0 trong handoff

1. Nối **Việc chờ quyết định ↔ Công việc ↔ Dự án** ở tầng dữ liệu/API  
2. **Hộp thư AI**: tin nhắn → draft task → human check → mới ghi Task  
3. **AI phân loại tài chính** (chi phí / doanh thu gợi ý)  
4. **Module Chi phí** riêng trong menu + hồ sơ chi tiết  

Chi tiết nghiệm thu: mục 12–14 trong `01_MASTER_HANDOFF.md`.
