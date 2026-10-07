# Báo cáo QA hệ thống HHG Oasis

**Trọng tâm:** Task và các liên kết vận hành  
**Nguồn:** `HHG_Oasis_Bao_cao_QA_Task_Lien_ket_2026-09-23`  
**Ngày kiểm thử:** 23/09/2026  
**Hệ thống:** https://hhg-oasis-control-tower-v0.vercel.app/index.html  
**Phương pháp:** Black box như người dùng thật; không xem source code  
**Dữ liệu:** Chỉ tạo/cập nhật bản ghi tiền tố `TEST QA`; không xóa dữ liệu production

---

## Kết luận chính

Chưa nên dùng hệ thống làm nguồn dữ liệu vận hành chính. Ba lỗi **P0** cho thấy phân quyền Task, Chi phí và Quyết định chưa được kiểm soát đúng. Ngoài ra, Task không thể chuyển sang Hoàn tất dù đã đạt 100%; upload tài liệu và tạo chi phí trực tiếp từ Task chưa hoạt động.

### Thứ tự xử lý đề xuất

1. Khóa quyền ngoài phạm vi tại API cho Task, Chi phí và Quyết định.
2. Sửa luồng Task cốt lõi gồm người phối hợp, hoàn tất Task và lỗi click xuyên modal.
3. Sửa Task liên kết Chi phí và bổ sung kiểm soát đối chiếu, chứng từ, audit log.
4. Hoàn thiện upload và liên kết hai chiều với Kho tài liệu.
5. Xây luồng triage Issue sang Task hoặc Decision.
6. Sửa các lỗi hiển thị và phản hồi chậm sau khi các luồng dữ liệu đã ổn định.

### Tổng hợp mức độ lỗi

| Mức | Số lỗi | Trạng thái phát hành | Nhận định |
|-----|--------|----------------------|-----------|
| P0 | 3 | Chặn phát hành | Lỗi phân quyền nghiêm trọng ở Task, Chi phí và Quyết định |
| P1 | 6 | Phải sửa trước khi vận hành | Luồng cốt lõi không chạy, thiếu kiểm soát hoặc có nguy cơ sai dữ liệu |
| P2 | 5 | Sửa trong đợt kế tiếp | Thiếu liên kết, thiếu chức năng hoặc hiển thị sai logic |
| P3 | 1 | Cải thiện sau | Phản hồi chậm và thiếu thông báo trạng thái |

### Cách phân loại kết quả

| Phân loại | Ý nghĩa |
|-----------|---------|
| Chưa có chức năng | Không có luồng nghiệp vụ cần thiết hoặc hệ thống xác nhận chỉ mới làm một phần |
| Có UI nhưng không chạy | Có nút hoặc form nhưng thao tác không tạo kết quả và không lưu dữ liệu |
| Chạy nhưng sai logic | Có kết quả nhưng sai quyền, sai trạng thái, sai dữ liệu hoặc sai cách hiển thị |
| Chạy đúng | Kết quả đúng và vẫn còn sau refresh hoặc reload |

---

## Phạm vi kiểm thử

- Tạo, cập nhật, theo dõi tiến độ và hoàn tất Task.
- Một Task có người phụ trách chính và nhiều người phối hợp.
- Quyền xem và sửa theo tài khoản quản trị, người phụ trách chính và người phối hợp.
- Task liên kết Decision, Chi phí, tài liệu và Kho tài liệu.
- Ảnh hạng mục, gồm yêu cầu ảnh Trước và Sau.
- Nhiều khoản chi trên một Task, trạng thái đối chiếu và chứng từ.
- Issue chuyển thành Task hoặc Decision.
- Kiểm tra dữ liệu sau refresh hoặc reload.

---

## Lỗi P0 — cần chặn phát hành

### P0-01 · Người phối hợp không xem được Task được giao

| | |
|---|---|
| **Phân loại** | Chạy nhưng sai logic phân quyền |
| **Tái hiện** | Tạo Task `TEST QA Task đa người 20260923` với ANHNAM phụ trách chính; thêm HOANGLE và MICAHPHAM phối hợp. Đăng nhập HOANGLE, mở *Tôi tham gia* và *Tất cả*. |
| **Mong đợi** | HOANGLE thấy Task trong *Tôi tham gia* và được xem/cập nhật theo quyền phối hợp |
| **Thực tế** | *Tôi tham gia* và *Tất cả* đều không hiện Task. Admin vẫn thấy HOANGLE/MICAHPHAM đúng trong danh sách phối hợp |
| **Ảnh hưởng** | Luồng Task nhiều người không vận hành được |
| **Đề xuất** | Sửa query + authorization server: owner **hoặc** collaborator. Test owner / collaborator / người ngoài / admin |

### P0-02 · Người dùng thường xem và thay đổi chi phí toàn hệ thống

| | |
|---|---|
| **Phân loại** | Chạy nhưng sai logic phân quyền |
| **Tái hiện** | Đăng nhập HOANGLE (`STANDARD_USER`), mở Chi phí, chọn `CP-0101`, bấm *Đối chiếu cập nhật* |
| **Mong đợi** | Chỉ Finance / admin / người được cấp quyền xem toàn bộ và đổi trạng thái đối chiếu |
| **Thực tế** | HOANGLE thấy tất cả khoản chi, nút *Ghi chi phí*, chuyển `CP-0101` từ Tạm ghi nhận → Đã đối chiếu; giữ sau reload |
| **Ảnh hưởng** | Người không thẩm quyền xem/sửa số liệu tài chính |
| **Đề xuất** | RBAC + phạm vi dữ liệu tại **API** (không chỉ ẩn nút UI). Audit log; từ chối request thiếu quyền |

### P0-03 · Người dùng thường thấy quyết định không liên quan và có nút phê duyệt

| | |
|---|---|
| **Phân loại** | Chạy nhưng sai logic phân quyền |
| **Tái hiện** | Đăng nhập HOANGLE, mở Quyết định |
| **Mong đợi** | Chỉ thấy quyết định liên quan; chỉ người duyệt chỉ định hoặc admin có Duyệt / Bổ sung / Từ chối |
| **Thực tế** | Thấy cả TEST QA và Smoke QD không liên quan; nút phê duyệt vẫn hiện trên Smoke QD (không bấm thử trên production) |
| **Ảnh hưởng** | Rò rỉ thông tin + nguy cơ phê duyệt trái thẩm quyền |
| **Đề xuất** | Lọc theo proposer / approver / Task liên quan; kiểm quyền từng action ở API |

---

## Lỗi P1 — phải sửa trước khi vận hành

### P1-01 · Không thể hoàn tất Task dù đã 100%

- **Phân loại:** Có UI nhưng không chạy  
- **Tái hiện:** Hoàn thành 4/4 hạng mục → 100% → bấm *Hoàn tất* → reload  
- **Thực tế:** Nút hiện “Đang hoàn tất” rồi về bình thường; Task vẫn *Đang làm*; tiến độ 100% được lưu  
- **Đề xuất:** Kiểm API workflow `COMPLETE`, trả lỗi rõ, cập nhật trạng thái nguyên tử; integration test 4/4 → Done  

### P1-02 · Thêm chi phí trực tiếp từ Task không lưu

- **Phân loại:** Có UI nhưng không chạy  
- **Tái hiện:** Task → tab Chi phí → *Ghi chi phí* → *Ghi nhận tạm*  
- **Thực tế:** Modal không lưu/không đóng; tạo từ module Chi phí chung thì OK  
- **Đề xuất:** Dùng chung API tạo Expense; khóa nút khi gửi; chỉ đóng modal khi server thành công  

### P1-03 · Click xuyên modal có thể hoàn thành nhầm hạng mục

- **Phân loại:** Chạy nhưng sai logic  
- **Tái hiện:** Trong modal chi phí không phản hồi, bấm lại *Ghi nhận tạm*; về màn Task  
- **Thực tế:** Tiến độ tăng 25%→50% và hạng mục khác bị đánh xong  
- **Đề xuất:** Chặn pointer-events nền; z-index/backdrop; idempotency hoàn thành hạng mục  

### P1-04 · Upload tài liệu không hoạt động (Task + Kho tài liệu)

- **Phân loại:** Có UI nhưng không chạy  
- **Tái hiện:** PDF tại Task; PDF/PNG tại Kho tài liệu; thử TXT sai định dạng  
- **Thực tế:** Không bản ghi mới, không thông báo lỗi; TXT cũng bị bỏ qua im lặng  
- **Đề xuất:** Sửa handler + API metadata; tiến trình / thành công / lỗi định dạng; verify sau reload  

### P1-05 · Issue chưa thể chuyển thành Task hoặc Decision

- **Phân loại:** Chưa có chức năng  
- **Tái hiện:** Tạo `TEST QA Issue 20260923 kiểm tra chuyển thành Task`  
- **Thực tế:** Báo đã gửi Issue PARTIAL; chưa có triage / danh sách Issue  
- **Đề xuất:** Issue inbox + trạng thái triage + API chuyển đổi; giữ `issueId` và liên kết hai chiều  

### P1-06 · Đối chiếu / chốt chi phí thiếu kiểm soát

- **Phân loại:** Chạy nhưng sai logic; một phần chưa có chức năng  
- **Tái hiện:** Bấm *Đối chiếu cập nhật* nhiều lần trên một Expense  
- **Thực tế:** Tự đẩy Tạm → Đã đối chiếu → Đã chốt; không form, chứng từ, xác nhận  
- **Đề xuất:** Tách action theo role; yêu cầu chứng từ/ghi chú; confirmation + audit log bất biến  

---

## Lỗi P2 — cần hoàn thiện

| ID | Tóm tắt | Phân loại | Đề xuất ngắn |
|----|---------|-----------|--------------|
| P2-01 | Ảnh hạng mục chưa phân loại Trước / Sau | Chưa có chức năng | Thêm `photoType`, thời gian, người tải; UI cặp Trước–Sau |
| P2-02 | Liên kết Task ↔ Chi phí một chiều | Một phần chạy | Dòng chi phí trong Task → Expense detail |
| P2-03 | Kho tài liệu không hiện Task liên quan | Chưa đủ chức năng | Hiện tên/mã Task + deep link; lọc đã gắn / chưa gắn |
| P2-04 | Decision đã duyệt vẫn hiện “Đang chặn việc” | Sai logic hiển thị | Tính nhãn từ status hiện tại hoặc cập nhật `isBlocking` khi kết thúc |
| P2-05 | Số tiền và cột liên kết Expense gây hiểu nhầm | Sai hiển thị | VND đủ chính xác (≥2 chữ số thập phân nếu dùng “triệu”); cột liên kết = tên/mã Task |

---

## Lỗi P3 — trải nghiệm

### P3-01 · Phản hồi chậm / thiếu toast lỗi–thành công

Một số thao tác 4–10 giây; upload và hoàn tất Task thất bại không báo nguyên nhân; reload có thể flash “chưa đăng nhập”. Chuẩn hóa loading, toast, disable nút khi request chạy, timeout + hướng dẫn thử lại.

---

## Các chức năng đã chạy đúng

- Tạo Task và lưu sau reload.
- Người phụ trách chính sửa mô tả Task — lưu được.
- Hạn, ưu tiên, ngân sách, nhóm chi phí, danh sách người — lưu được.
- Tiến độ hạng mục +25% mỗi hạng mục; còn sau reload.
- Upload ảnh hạng mục dạng chung — còn sau reload.
- Decision blocking liên kết Task; duyệt Decision mở chặn Task đúng.
- Tạo nhiều Expense từ module Chi phí chung; tổng trên Task = 400.000 đồng; còn sau reload.
- Expense mở được Task liên quan.
- Tạo Issue ban đầu hoạt động nhưng dừng ở mức PARTIAL.

---

## Dữ liệu TEST QA đã tạo

| Loại | Tên hoặc mã | Trạng thái cuối phiên |
|------|-------------|------------------------|
| Task | TEST QA Task đa người 20260923 | 4/4 hạng mục, 100%, vẫn *Đang làm* |
| Decision | QD-0002 | Đã duyệt; Task đã mở chặn |
| Expense | CP-0101 | Đã đối chiếu |
| Expense | CP-0102 | Đã chốt |
| Issue | TEST QA Issue 20260923 kiểm tra chuyển thành Task | Đã gửi · PARTIAL |
| Tài liệu | (không có bản ghi TEST QA) | Upload PDF/PNG thất bại |

---

## Checklist nghiệm thu sau khi sửa

- [ ] HOANGLE thấy Task khi được thêm phối hợp; người không liên quan **không** thấy.
- [ ] `STANDARD_USER` không xem/đổi chi phí ngoài phạm vi; chỉ Finance/admin đối chiếu & chốt.
- [ ] Chỉ đúng người duyệt hoặc admin thấy và thực hiện phê duyệt Decision.
- [ ] Task → *Hoàn tất* khi đủ điều kiện; trạng thái đúng sau reload.
- [ ] Tạo chi phí từ Task → đúng một bản ghi; bấm lặp không trùng và không đụng hạng mục nền.
- [ ] Upload PDF/PNG tạo bản ghi; file sai định dạng báo lỗi; còn sau reload.
- [ ] Task ↔ Expense ↔ Tài liệu mở được hai chiều.
- [ ] Ảnh hạng mục phân biệt Trước / Sau.
- [ ] Issue → Task hoặc Decision giữ liên kết nguồn hai chiều.
- [ ] Mọi đổi trạng thái có người thực hiện, thời gian, audit history.

---

## Điều kiện trước khi đưa vào vận hành

Chỉ triển khai cho người dùng thật sau khi **toàn bộ P0 và P1** đã sửa và kiểm thử lại trên ít nhất bốn nhóm quyền:

1. Admin  
2. Finance  
3. Người phụ trách / phối hợp Task  
4. Người không liên quan  

Mỗi luồng phải verify lại sau **refresh/reload** để xác nhận dữ liệu lưu ở server, không chỉ đổi tạm trên UI.

---

## Trạng thái sửa code (24/09/2026)

Đã implement trên codebase + deploy Vercel (xem checklist nghiệm thu phía trên để re-test):

| ID | Sửa chính |
|----|-----------|
| P0-01 | `visibleProjects` không còn lọc qua `workItemsForOwner` cho user thường; dashboard/`/api/projects` filter theo membership |
| P0-02 | `src/lib/rbac.ts` + expenses GET/POST/PATCH: STANDARD chỉ thấy chi phí Task mình; chỉ Admin đối chiếu/chốt |
| P0-03 | Decisions GET lọc theo liên quan; PATCH chỉ Admin hoặc `approver` khớp; UI ẩn nút duyệt |
| P1-01 | COMPLETE khi đủ hạng mục (all flags = 1); auto-DONE khi tick hạng mục cuối |
| P1-02/03 | Đóng Task modal trước khi mở chi phí; z-index; sau lưu quay lại Task tab Chi phí |
| P1-04 | Upload validate MIME; auth + quyền Task; Kho tài liệu hiện tên Task + mở Task |
| P1-05 | `PATCH /api/issues/[id]` CONVERT_TO_TASK / CONVERT_TO_DECISION + inbox UI |
| P1-06 | Confirm + ghi chú; audit ProjectEvent; không toggle LOCKED→RECONCILED |

**END.** Nguồn Word → Markdown; phần sửa code cập nhật 24/09/2026.
