# HHG Oasis — Gợi ý đưa prototype V0 vào báo cáo

## Câu mô tả ngắn
Đã dựng prototype V0 cho **HHG Oasis Transitional Management Control System / Control Tower Lite**. Mục tiêu của V0 là kiểm chứng luồng quản trị trước khi build AppSheet/Google Sheets thật: quản lý tập trung **tiền – việc – ưu tiên – trách nhiệm – tiến độ – vấn đề**, trong khi giao diện nhân viên được rút xuống mức thao tác 10–30 giây.

> Lưu ý: toàn bộ số liệu tiền/doanh thu/tiến độ trong ảnh prototype là dữ liệu minh họa, không phải số vận hành thật.

## 4 hình nên đưa vào báo cáo

### 1. `demo_control_tower.png` — Executive Control Tower
Thông điệp: ban điều hành có một màn hình duy nhất để nhìn **Revenue / Cash / Issues / Project Risk / Top 3 Priority / Decision Queue**, sau đó có thể drill-down.

### 2. `demo_projects.png` — Project Tracking
Thông điệp: project được quản bằng **Readiness + Budget + Deadline + Tasks + Blocker + Decision Needed**; không cần biến hệ thống thành ERP.

### 3. `demo_staff_mobile.png` — Staff “Việc của tôi”
Thông điệp: nhân viên chỉ cần thấy việc cần làm và 3 thao tác **Bắt đầu / Đã xong / Có vấn đề**. Mục tiêu là giảm yêu cầu học hệ thống và tăng adoption.

### 4. `demo_report_issue_mobile.png` — QR / Report Issue
Thông điệp: quét QR tại khu vực sẽ tự gắn AREA; nhân viên chỉ chọn loại sự cố, chụp ảnh và gửi. Manager/Coordinator mới là người biến issue thành task/priority/owner.

### 5. `demo_blueprint.png` — Logic hệ thống
Dùng khi cần giải thích kiến trúc: **Input → Control → Task Engine → Management → Handoff**, cùng ba rule: Boss sees all, Staff sees less, New Task = Replace Task.

## Bước tiếp theo nên báo cáo
1. Chốt map `UNITS + USERS + ROLE/SCOPE` thật.
2. Tạo Google Sheets V0 theo 8 bảng lõi.
3. Nối AppSheet cho 3 flow đầu: My Tasks, Report Issue, Daily Closing.
4. Pilot bằng 10–20 task thật với 4 người.
5. Sau 1–2 ngày pilot, sửa UX và permission trước khi mở rộng Finance/Decision Queue.
