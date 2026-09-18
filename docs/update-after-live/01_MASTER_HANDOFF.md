# HHG OASIS CONTROL TOWER
## MASTER HANDOFF — CÁC CẬP NHẬT SAU BẢN LIVE HIỆN TẠI

**Ngày chốt tài liệu:** 18/09/2026  
**Bản live đang dùng làm mốc:** https://hhg-oasis-control-tower-v0.vercel.app/index.html  
**Mục đích:** Đây là **một file duy nhất** để đội kỹ thuật cập nhật tiếp trên source hiện đang chạy. Không rebuild lại từ đầu và không lấy prototype HTML cũ ghi đè lên backend/database hiện tại.

---

# 0. ĐỌC NHANH TRƯỚC KHI CODE

Bản live hiện tại là **baseline**. Từ baseline đó, cần bổ sung 4 cụm chức năng chính:

1. **Nối Việc chờ quyết định ↔ Công việc ↔ Dự án** thật sự ở tầng dữ liệu/API, không chỉ là nút điều hướng.
2. **Hộp thư AI**: nhận tin nhắn tự nhiên → AI tách thành bản nháp công việc → người quản lý kiểm tra → mới tạo/gộp Task thật.
3. **AI hỗ trợ phân loại tài chính**, đặc biệt là chi phí: AI gợi ý nhóm chi phí, phân khu, Task/Dự án liên quan, độ tin cậy; con người xác nhận trước khi dùng làm dữ liệu chính thức.
4. **Tách Chi phí thành module riêng** trong menu, có tổng hợp theo nhóm/phân khu/trạng thái và bấm từng khoản để xem hồ sơ chi tiết.

Ngoài ra cần giữ nguyên định hướng:
- Giao diện người dùng ưu tiên **tiếng Việt dễ hiểu**; hạn chế thuật ngữ tiếng Anh.
- Giai đoạn đầu người nhập và cập nhật chủ yếu là **Lead/Tổ trưởng/Quản lý phân khu**, không triển khai đại trà xuống nhân viên cấp thấp ngay.
- Web-first, mobile phải thao tác được tốt.
- AI chỉ **gợi ý và cấu trúc hóa dữ liệu**, không tự duyệt tiền, không tự ra quyết định quản trị và không tự ghi đè số liệu gốc.

---

# 1. P0 — NỐI “VIỆC CHỜ QUYẾT ĐỊNH” VỚI TASK / PROJECT

## Vấn đề hiện tại
Trang `Việc chờ quyết định` đang giống một danh sách độc lập. Quyết định chưa được ràng buộc chặt với Task/Project gây ra tình trạng:
- Không biết quyết định này đang chặn việc nào.
- Từ Task không thấy quyết định đang chờ.
- Duyệt quyết định không cập nhật lại Task.
- Từ Project bấm sang Decision chưa chắc lọc đúng quyết định của Project đó.

## Yêu cầu UX

### Từ chi tiết Công việc
Có nút:
**Yêu cầu quyết định**

Khi tạo cần có tối thiểu:
- Công việc liên quan: tự gắn Task đang mở.
- Dự án liên quan: tự lấy từ Task nếu có.
- Nội dung cần quyết định.
- Người đề xuất.
- Người duyệt.
- Hạn cần quyết định.
- Số tiền (nếu có).
- Tác động nếu chưa quyết định.
- `Đang chặn công việc?` Có/Không.

### Trong trang Việc chờ quyết định
Mỗi Decision phải hiển thị:
- Mã quyết định.
- Nội dung.
- Task liên quan.
- Project liên quan.
- Người đề xuất / người duyệt.
- Hạn.
- Số tiền nếu có.
- Trạng thái.
- Có đang chặn Task hay không.
- Nút `Mở công việc` / `Mở dự án`.

### Trong chi tiết Task
Có riêng khối:
**Quyết định liên quan**

Ví dụ:
`QD-0007 — Duyệt thiết bị Bếp Trung Tâm — Chờ quyết định — Đang chặn việc`

Một Task có thể có **nhiều quyết định**, không thiết kế 1 Task = 1 Decision.

## Rule xử lý

- `Đã duyệt`: Decision đóng; nếu Task không còn Decision blocking nào khác thì bỏ trạng thái chờ quyết định. **Không tự chuyển Task thành Hoàn thành.**
- `Cần bổ sung`: Decision vẫn mở, Task vẫn bị chặn nếu Decision là blocking.
- `Từ chối`: Task không tự đóng; chuyển sang trạng thái cần điều chỉnh phương án hoặc cập nhật blocker tương ứng.
- Mọi thay đổi Decision phải ghi vào **lịch sử Task**.
- Project detail phải chỉ hiển thị Decision liên quan đúng Project.

## Data model tối thiểu

```text
DECISIONS
id
code
title
description
linked_task_id        nullable
linked_project_id     nullable
requester_id
approver_id
amount                nullable
deadline              nullable
impact_if_pending
is_blocking            boolean
status                 pending | need_more_info | approved | rejected
resolution_note        nullable
resolved_by            nullable
resolved_at            nullable
created_at
updated_at
```

## API/Server actions gợi ý

```text
POST  /api/decisions
PATCH /api/decisions/:id/resolve
GET   /api/tasks/:id/decisions
GET   /api/projects/:id/decisions
```

---

# 2. P0 — HỘP THƯ AI: TIN NHẮN TỰ NHIÊN → TASK DRAFT → HUMAN CHECK

## Mục tiêu
Không bắt Lead/Tổ trưởng phải học cách nhập form phức tạp ngay từ đầu. Họ có thể gửi/copy một đoạn tracking theo thói quen hiện tại. AI sẽ biến đoạn đó thành dữ liệu có cấu trúc.

## Ví dụ input thật

```text
Dạ e gửi Task tracking ạ

1. Phiếu thoả thuận công việc
- ký với các nhóm : hồ bơi, làm vườn & vệ sinh, pickleball
2. Trung thu
- dời đèn trên cây
- đặt thêm đèn bóng trứng
- phụ kiện decor
- lh MC, PB PG Chú Cuội - Chị Hằng
3. Truyền thông
- plan triển khai
- chụp món
- làm biển hiệu
4. CRM update
- kiểm tra liên hệ KH đã hết hạn
5. Thu thập chứng từ Spa
6. Lắp quạt Bếp Trung Tâm
7. Dời đá gọn vào ở cổng 27
8. Tuyển/Training nhân sự Mía Ơi
9. Kiosk Mía Ơi ở cổng 27
10. Vệ sinh sàn pick
- thi công dính bụi lên sàn pick
11. Phương án diệt chuột
- đặt bẫy
12. Merchandise
- ly mới
- áo/nón/dù/túi mới
- đồng phục mới
13. Kế hoạch Sale Event
- Chương trình bán tour/combo trải nghiệm cho đoàn thể/công ty (Vy)
14. Pallete cho loa LNCP
15. Triển khai canteen ở Hồ Bơi Olympic bán món ăn vặt
```

## AI cần làm gì
AI không chỉ tách từng dòng thành Task ngang hàng. AI cần nhận diện:
- Task cha / nhóm công việc / Project nhỏ.
- Task con/checklist.
- Phân khu.
- Loại công việc.
- Người phụ trách nếu nội dung có nhắc tên.
- Deadline nếu nội dung có ngày/hạn.
- Priority gợi ý nếu đủ dữ kiện; nếu không đủ thì để trống.
- Project có thể liên quan.
- Task đang tồn tại có khả năng trùng.
- Mức độ tự tin + lý do ngắn.

Ví dụ:
- `Trung thu` có thể là nhóm cha với các việc con: dời đèn, đặt đèn, decor, liên hệ MC/PB/PG...
- `Tuyển/Training nhân sự Mía Ơi` có thể tách 2 task liên quan cùng nhóm Mía Ơi.
- `Kế hoạch Sale Event ... (Vy)` có thể nhận diện owner candidate = Vy.

## Human check bắt buộc trong V0
AI **không tự tạo Task chính thức ngay**.

Mỗi draft phải có 4 thao tác:
- `Xác nhận`
- `Sửa`
- `Gộp với việc cũ`
- `Bỏ qua`

Human cần ưu tiên kiểm tra:
- Owner thật.
- Deadline.
- Priority.
- Task này là task riêng hay checklist/subtask.
- Có trùng Task cũ không.
- Có cần Decision/budget không.

## Phát hiện Task trùng
Trước khi tạo Task mới, AI/search phải đối chiếu Task hiện có.

Ví dụ đã có:
`Lắp quạt Bếp Trung Tâm`

Sau đó nhận tin:
`Quạt bếp trung tâm chưa lắp`

UI phải cảnh báo:
`Có khả năng trùng CV-xxxx — Lắp quạt Bếp Trung Tâm`

Cho chọn:
- Cập nhật Task cũ.
- Gộp nội dung.
- Vẫn tạo Task mới.

## Lưu nguồn để truy vết
Task được tạo từ AI phải giữ link ngược về tin nhắn nguồn, để sau này biết:
- Ai gửi.
- Lúc nào.
- Nội dung gốc.
- AI đã gợi ý gì.
- Người nào xác nhận/sửa.

## Data model gợi ý

```text
MESSAGE_INBOX
id
source_channel        zalo | email | manual | other
raw_text
sender_user_id        nullable
sender_display_name
received_at
status                new | analyzed | reviewed | archived
created_at
```

```text
AI_TASK_DRAFTS
id
message_inbox_id
parent_group
suggested_title
suggested_unit_id
suggested_type
suggested_owner_id           nullable
suggested_priority           nullable
suggested_deadline           nullable
suggested_project_id         nullable
suggested_duplicate_task_id  nullable
confidence                   0-100
reason
review_status                pending | confirmed | edited | merged | skipped
reviewed_by
reviewed_at
created_task_id              nullable
created_at
```

## API gợi ý

```text
POST  /api/ai/task-inbox/analyze
PATCH /api/ai/task-drafts/:id
POST  /api/ai/task-drafts/:id/confirm
POST  /api/ai/task-drafts/:id/merge
```

---

# 3. P0 — AI GỢI Ý PHÂN LOẠI CHI PHÍ

## Mục tiêu
Chi phí là nơi AI nên hỗ trợ mạnh nhất vì người nhập thường không biết nên xếp khoản đó vào nhóm nào, phân khu nào hay gắn với Task nào.

AI chỉ **suggest**, không tự khóa phân loại cuối cùng.

## Nhóm hiển thị cho người dùng
Không dùng `CAPEX`, `OPEX`, `Cost Center` làm nhãn chính.

UI dùng:

```text
Vận hành thường xuyên
Sửa chữa / bảo trì
Cải tạo / nâng cấp
Mua sắm tài sản / thiết bị
Chi phí dùng chung
Chưa xác định
```

Backend có thể giữ code kỹ thuật nếu cần, ví dụ:

```text
OPERATING
MAINTENANCE
IMPROVEMENT
ASSET_PURCHASE
SHARED
UNCLASSIFIED
```

## Ví dụ
Input:
`Mua 4 quạt công nghiệp cho Bếp Trung Tâm, 12,8 triệu`

AI trả về dạng:

```text
Nhóm gợi ý: Mua sắm tài sản / thiết bị
Phân khu: Bếp Trung Tâm
Công việc liên quan: Lắp quạt Bếp Trung Tâm
Độ tin cậy: 84%
Lý do: Mô tả là mua mới thiết bị; cần người dùng xác nhận nếu thực tế chỉ thay/sửa bộ phận hiện có.
```

Input:
`Thay motor quạt hút bếp 2,4 triệu`

AI có thể ưu tiên:
`Sửa chữa / bảo trì`

Input mơ hồ:
`Làm lại biển hiệu Lòng Nướng 18 triệu`

AI nên cho thấy chưa chắc, ví dụ:
`Cải tạo / nâng cấp 55% — Truyền thông/biển hiệu 45% — cần người xác nhận.`

## Human check
UI tối thiểu:

```text
AI đề xuất: Sửa chữa / bảo trì
[ĐỒNG Ý] [ĐỔI PHÂN LOẠI]
```

Nếu người dùng sửa gợi ý của AI, lưu correction để làm dữ liệu cải thiện rule/model về sau.

## AI có thể suggest đồng thời
- Nhóm chi phí.
- Phân khu.
- Task liên quan.
- Project liên quan.
- Loại nghiệp vụ/vật tư/thiết bị.
- Độ tin cậy.
- Lý do ngắn.

AI không được:
- Tự duyệt chi tiền.
- Tự sửa số tiền.
- Tự sửa chứng từ gốc.
- Tự đóng khoản chi.
- Tự coi phân loại là chính thức khi chưa qua Human check.

---

# 4. P1 — AI HỖ TRỢ PHÂN LOẠI DOANH THU

AI có thể gợi ý:
- Phân khu tạo doanh thu.
- Loại sản phẩm/dịch vụ.
- Nhóm khách: khách lẻ / đoàn thể / công ty...
- Kênh bán.
- Loại doanh thu: dịch vụ, đồ ăn, event, tour/combo, membership...

**Giới hạn bắt buộc:**
Đối với Spa/Lòng Nướng hoặc các mô hình có revenue share / chia quyền lợi với đối tác, AI **không tự kết luận “phần thuộc HHG”**. AI chỉ phân loại doanh thu vận hành. Phần phân bổ cuối cùng phải đi qua rule hợp đồng/Finance.

---

# 5. P0 — TÁCH “CHI PHÍ” THÀNH MODULE RIÊNG

## Navigation
Menu chính cần có mục riêng:

```text
Trung tâm điều hành
Dự án
Công việc
Hộp thư AI
Việc chờ quyết định
Doanh thu & chốt ngày
Chi phí
Ứng dụng Lead/Tổ trưởng
Báo vấn đề
...
```

Không để quản trị chi phí chỉ nằm trong màn `Doanh thu & chốt ngày`.

## Dashboard Chi phí
Đầu trang có tối thiểu 4 chỉ số:
- Tổng chi phí trong kỳ.
- Đã đối chiếu / đã chốt.
- Tạm ghi nhận.
- Giá trị đã gắn với Công việc/Dự án.

## Tổng hợp bắt buộc
Có thống kê theo:
- Nhóm chi phí.
- Phân khu.
- Trạng thái.
- Khoảng thời gian.
- Công việc/Dự án nếu có.

Bộ lọc tối thiểu:
- Hôm nay / 7 ngày / Tháng này / khoảng ngày tùy chọn.
- Phân khu.
- Nhóm chi phí.
- Trạng thái.

## Danh sách khoản chi
Mỗi dòng phải có:
- Thời gian/ngày.
- Phân khu.
- Nhóm chi phí.
- Nội dung.
- Số tiền.
- Chứng từ/nguồn.
- Task/Project liên quan nếu có.
- Trạng thái.

**Mỗi dòng phải bấm được.**

## Hồ sơ một khoản chi
Khi bấm mở detail cần xem được:
- Mã khoản chi.
- Số tiền.
- Nội dung/mô tả gốc.
- Phân khu.
- Nhóm chi phí.
- Người ghi.
- Thời gian.
- Nguồn thanh toán.
- Chứng từ/hình ảnh.
- Trạng thái: Tạm ghi nhận / Đã đối chiếu / Đã chốt.
- Task liên quan.
- Project liên quan.
- Gợi ý AI + độ tin cậy + lý do.
- Lịch sử thay đổi/phân loại/đối chiếu/chốt.

Nếu có Task liên quan, có nút:
`Mở công việc liên quan`

Nếu có Project liên quan, có nút:
`Mở dự án liên quan`

## Quan hệ với Task
Một Task có thể có nhiều khoản chi.
Trong Task detail nên có:
- Tổng chi phí đã ghi nhận cho Task.
- Danh sách khoản chi liên quan.
- Trạng thái từng khoản.

Không đồng nhất:
`Khoản chi gắn Task = khoản chi đã được duyệt`.
Trạng thái tài chính là lớp riêng.

## Audit log
Khoản đã chốt vẫn giữ lịch sử.
Nếu chỉnh sau chốt phải lưu:
- Ai sửa.
- Lúc nào.
- Giá trị trước.
- Giá trị sau.
- Lý do.

## Data model gợi ý

```text
EXPENSES
id
expense_code
date
time
unit_id
category_code
description
amount
payment_source
reporter_id
linked_task_id       nullable
linked_project_id    nullable
status               temporary | reconciled | closed
classification_status
ai_category_suggestion
ai_unit_suggestion
ai_task_suggestion
ai_confidence
ai_reason
confirmed_category
confirmed_by
confirmed_at
created_at
updated_at
closed_at
closed_by
```

```text
EXPENSE_DOCUMENTS
id
expense_id
file_url
document_type
uploaded_by
uploaded_at
```

```text
EXPENSE_UPDATES
id
expense_id
update_type
note
old_value_json
new_value_json
created_by
created_at
```

## API gợi ý

```text
GET  /api/expenses?from=&to=&unit=&category=&status=
GET  /api/expenses/:id
GET  /api/expenses/summary?from=&to=&groupBy=category
GET  /api/expenses/summary?from=&to=&groupBy=unit
GET  /api/expenses/summary?from=&to=&groupBy=status
POST /api/expenses
PATCH /api/expenses/:id
POST /api/expenses/:id/documents
POST /api/expenses/:id/reconcile
POST /api/expenses/:id/close
POST /api/ai/finance/suggest
```

---

# 6. P1 — TASK DETAIL: ẢNH VÀ NHẬT KÝ XỬ LÝ

Không giới hạn Task chỉ có đúng `Ảnh Trước` và `Ảnh Sau`.

Một Task sửa chữa/cải tạo nên có timeline:

```text
Ảnh hiện trạng
→ Giao việc
→ Ảnh đang xử lý
→ Cập nhật tiến độ
→ Báo blocker nếu có
→ Ảnh hoàn thành
→ Nghiệm thu
→ Đóng việc
```

UI có thể ghim 2 ảnh đại diện `Trước` / `Sau`, nhưng backend phải cho phép nhiều update/hình ảnh.

```text
TASK_UPDATES
id
task_id
update_type       progress | blocker | image | decision | cost | completed
progress_percent
status
note
image_url
created_by
created_at
```

Khi Decision/Expense thay đổi liên quan tới Task, nên ghi một entry vào timeline Task.

---

# 7. PHASE 1 — AI/APP DÙNG CHO AI TRƯỚC? KHÔNG. DÙNG CHO LEAD/TỔ TRƯỞNG TRƯỚC

Đối tượng sử dụng thật ở giai đoạn đầu:

```text
Boss Huy
- Xem toàn bộ
- Drill-down
- Quyết định lớn theo quyền

Boss Nghĩa
- Xem toàn bộ
- Giao việc
- Điều chỉnh ưu tiên
- Duyệt/quyết định

Khánh / Admin
- Quản trị hệ thống
- Điều phối
- Cấu hình
- Kiểm tra dữ liệu
- Phân tích

Finance
- Đối chiếu doanh thu
- Quản lý chi phí
- Chứng từ
- Chốt số

Lead / Tổ trưởng / Quản lý phân khu
- Nhập doanh thu cuối ngày
- Báo vấn đề
- Nhận/cập nhật Task
- Chụp ảnh
- Báo blocker
- Ghi chi phí phát sinh nếu được phân quyền
```

**Nhân viên cấp thấp để giai đoạn sau.**
Khi triển khai xuống staff, UX mới rút gọn kiểu:
`QR → Việc của tôi / Báo vấn đề → Chụp ảnh → Gửi`.

Không thiết kế V0 theo giả định toàn bộ nhân viên đều phải sử dụng ngay.

---

# 8. QUY TẮC NGÔN NGỮ UI

Ưu tiên tiếng Việt tự nhiên, dễ hiểu.

Ví dụ mapping:

```text
Owner          → Người phụ trách
Blocker        → Vướng mắc
Decision Queue → Việc chờ quyết định
Cost Center    → Nơi chịu chi phí
Revenue Center → Nguồn tạo doanh thu
CAPEX          → Mua sắm tài sản / thiết bị
OPEX           → Vận hành thường xuyên
Maintenance    → Sửa chữa / bảo trì
Improvement    → Cải tạo / nâng cấp
```

Các code tiếng Anh chỉ để backend/database nếu cần, không phải nhãn chính trên UI.

---

# 9. BUGFIX BẮT BUỘC — MODULE CHI PHÍ PHẢI MỞ ĐƯỢC

Trong prototype sau khi thêm module Chi phí từng có lỗi:
- Bấm `Chi phí` thì tiêu đề đổi nhưng nội dung trắng.

Nguyên nhân ở prototype:
- Menu/radio có `expenses` nhưng CSS fallback thiếu selector cho `#vr-expenses`.
- Click handler cũ chỉ đổi title, chưa gọi chung logic chuyển view.

Khi ráp vào bản live, **không nhất thiết áp đúng cách sửa CSS này nếu app live dùng framework/router khác**. Điều cần đảm bảo là:
- Bấm menu `Chi phí` luôn render đúng module.
- Desktop/mobile dùng cùng route/state logic.
- Không có tình trạng title đổi nhưng content vẫn hidden.
- Regression test sau mỗi lần thêm menu/module.

---

# 10. AI GUARDRAILS — KHÔNG BỎ QUA

```text
1. AI không tự approve tiền hoặc quyết định quản trị.
2. AI không tự sửa số doanh thu/chi phí gốc.
3. AI không tự khóa category khi chưa human confirm.
4. AI không tự tạo Task mới nếu có candidate trùng mạnh mà chưa human check.
5. Luôn lưu raw input + AI result + confidence + reviewer + final value.
6. AI parse fail → giữ nguyên nội dung gốc và cho nhập/sửa thủ công.
7. Với doanh thu có rule đối tác → AI không tự tính phần thuộc HHG.
8. Human correction phải được lưu để audit và cải thiện rule về sau.
```

---

# 11. TRÌNH TỰ TRIỂN KHAI ĐỀ XUẤT — 48–72 GIỜ

## Ngày 1 — nối dữ liệu cốt lõi
- Decision ↔ Task ↔ Project.
- Expense module model/API.
- Menu Chi phí + list + detail + summary cơ bản.
- Audit log tối thiểu.

**Cuối ngày:** Task biết Decision nào đang chặn; mỗi Expense bấm xem chi tiết được.

## Ngày 2 — AI hỗ trợ
- MESSAGE_INBOX + AI_TASK_DRAFTS.
- UI Hộp thư AI.
- Duplicate candidate.
- Human confirm/merge/edit/skip.
- AI finance suggestion.

**Cuối ngày:** paste tin nhắn tracking → ra Task draft; nhập chi phí mô tả tự nhiên → AI gợi ý category/unit/task.

## Ngày 3 — hoàn thiện & QA
- AI revenue suggestion nhẹ.
- Timeline Task nhận log từ Decision/Expense.
- Mobile QA.
- Filter/summary Chi phí.
- Kiểm tra phân quyền theo vai trò.
- Seed/test dữ liệu demo + pilot nội bộ.

Không cần chờ automation toàn bộ POS, app native hay AI hoàn hảo mới pilot.

---

# 12. ACCEPTANCE TEST — DEV PHẢI TEST TRƯỚC KHI BÀN GIAO

## Decision ↔ Task
```text
A1. Tạo Decision từ Task → Decision có task_id/project_id đúng.
A2. Task detail hiện Decision liên quan.
A3. Decision detail mở ngược Task.
A4. Decision blocking pending → Task hiện Chờ quyết định/Bị chặn.
A5. Approve → bỏ blocker nếu không còn Decision blocking khác.
A6. Approve không tự đóng Task.
A7. Need more info → Task vẫn bị chặn.
A8. Reject → Task vẫn mở và cần điều chỉnh phương án.
A9. Timeline Task có log quyết định.
```

## Hộp thư AI
```text
B1. Paste tin nhắn tracking mẫu → AI tách được nhóm cha/con hợp lý.
B2. AI nhận diện được phân khu cơ bản.
B3. AI nhận diện Vy trong Sale Event là owner candidate.
B4. Draft chưa trở thành Task trước khi user xác nhận.
B5. Draft có thể sửa.
B6. Draft có thể bỏ qua.
B7. Draft nghi trùng có thể gộp với Task cũ.
B8. Task tạo mới giữ link về source message.
```

## Chi phí
```text
C1. Menu Chi phí mở đúng trên desktop.
C2. Menu Chi phí mở đúng trên mobile.
C3. Summary theo category khớp tổng list cùng kỳ.
C4. Filter theo phân khu/category/status hoạt động.
C5. Bấm khoản chi mở detail.
C6. Expense có linked_task → mở ngược đúng Task.
C7. Task detail hiện danh sách chi phí liên quan.
C8. Tạm ghi nhận → Đã đối chiếu → Đã chốt có audit log.
C9. Chỉnh khoản đã chốt lưu người sửa, trước/sau, lý do.
```

## AI phân loại tài chính
```text
D1. “Mua 4 quạt công nghiệp cho Bếp Trung Tâm” → suggest Mua sắm tài sản/thiết bị + Bếp Trung Tâm.
D2. “Thay motor quạt hút bếp” → ưu tiên Sửa chữa/bảo trì.
D3. Nội dung mơ hồ → confidence thấp + yêu cầu human check.
D4. User có thể đổi category.
D5. Correction được lưu.
D6. AI không tự sửa amount.
D7. AI không auto-close/auto-approve.
```

## Mobile / UI
```text
E1. Menu mobile mở được.
E2. Chuyển view không có trang trắng.
E3. Chi phí/Decision/Hộp thư AI thao tác được trên mobile.
E4. Label chính bằng tiếng Việt dễ hiểu.
```

---

# 13. DEFINITION OF DONE CHO BẢN CẬP NHẬT NÀY

Bản cập nhật được coi là hoàn thành khi một luồng thật có thể chạy xuyên suốt như sau:

```text
Lead gửi/copy tin nhắn tracking
→ AI phân tích
→ Khánh/Lead xác nhận draft
→ Task được tạo/cập nhật
→ Task phát sinh nhu cầu duyệt
→ Decision được tạo và gắn Task
→ Boss duyệt
→ Task tiếp tục xử lý
→ Có chi phí phát sinh
→ AI gợi ý nhóm chi phí + phân khu + Task
→ Human xác nhận
→ Expense lưu và xuất hiện trong tổng hợp Chi phí
→ Task detail thấy Decision + Chi phí + ảnh/timeline
→ Boss/Khánh drill-down được toàn bộ lịch sử
```

Nếu luồng trên chạy được trên web/mobile với audit log đầy đủ thì phần cập nhật sau baseline được xem là đạt V0.x để pilot.

---

# 14. LƯU Ý CUỐI CÙNG CHO ĐỘI KỸ THUẬT

- **Không rebuild lại toàn bộ app.** Merge các thay đổi trên vào codebase đang deploy Vercel.
- **Không ghi đè data model hiện có nếu đã có bảng tương đương.** Map vào convention hiện tại.
- Giữ backward compatibility với dữ liệu đang có.
- Nếu có Prisma/Postgres, tạo migration rõ ràng; không drop dữ liệu cũ.
- Các tên endpoint/model trong tài liệu chỉ là gợi ý; chức năng và quan hệ dữ liệu mới là bắt buộc.
- Ưu tiên ship nhanh, ít trường bắt buộc, UX đơn giản.
- Không đưa thuật ngữ kỹ thuật khó hiểu lên giao diện vận hành nếu có thể dùng tiếng Việt rõ hơn.

**Đây là tài liệu delta sau bản live hiện tại. Các chức năng baseline đang chạy tốt không cần thay đổi nếu không liên quan trực tiếp đến các mục trên.**
