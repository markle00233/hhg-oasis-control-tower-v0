import type { ReceiptFormData } from "@/lib/receipt-data";

function Line({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`text-[12px] leading-relaxed ${className}`}>
      <span className="font-medium text-[#111827]">{label}</span>{" "}
      <span className="font-semibold underline decoration-dotted underline-offset-4">
        {value}
      </span>
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 print:grid-cols-2">{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="mb-2 border-b border-[#111827] pb-1 text-[11px] font-bold uppercase tracking-wide text-[#111827]">
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export function ReceiptMemberContract({ data }: { data: ReceiptFormData }) {
  return (
    <article className="mx-auto max-w-[800px] bg-white p-6 text-[#111827] print:p-0">
      <header className="border-b-2 border-[#111827] pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold tracking-tight">HỢP ĐỒNG HỘI VIÊN</div>
            <div className="mt-0.5 text-sm font-semibold">HHG OASIS</div>
            <div className="text-[11px] text-[#4b5563]">
              27/58 Tây Lân, Phường Bình Tân – TP.HCM
            </div>
          </div>
          <div className="text-right text-[12px]">
            <div>
              Số phiếu / Form No: <strong className="font-mono">{data.formNo}</strong>
            </div>
            <div>
              Ngày / Date: <strong>{data.date}</strong>
            </div>
            <div className="mt-1 rounded border border-[#111827] px-2 py-0.5 text-[11px] font-medium">
              Loại ĐK: {data.registrationType}
            </div>
          </div>
        </div>
      </header>

      <Section title="Thông tin hội viên (Member information)">
        <FieldRow>
          <Line label="Họ và tên:" value={data.fullName} />
          <Line label="Mã hội viên:" value={data.memberCode} />
        </FieldRow>
        <FieldRow>
          <Line label="Số điện thoại:" value={data.phone} />
          <Line label="Email:" value={data.email} />
        </FieldRow>
        <FieldRow>
          <Line label="Ngày sinh:" value={data.dateOfBirth} />
          <Line label="Giới tính:" value={data.gender} />
        </FieldRow>
        <Line label="Địa chỉ:" value={data.address} />
        <Line label="Người liên hệ khẩn cấp:" value={data.guardian} />
      </Section>

      <Section title="Thông tin thẻ hội viên">
        <FieldRow>
          <Line label="Gói thẻ đăng ký:" value={data.planName} />
          <Line label="Số tháng đăng ký:" value={data.planMonths} />
        </FieldRow>
        <FieldRow>
          <Line label="Ngày bắt đầu dự kiến:" value={data.startDate} />
          <Line label="Ngày hết hạn:" value={data.expiryDate} />
        </FieldRow>
        <FieldRow>
          <Line label="Phí gia nhập:" value={data.joinFee} />
          <Line label="Ưu đãi:" value={data.promo} />
        </FieldRow>
        <FieldRow>
          <Line label="Phí thanh toán:" value={data.payTotal} />
          <Line label="Trả trước:" value={data.payPrepaid} />
        </FieldRow>
        <FieldRow>
          <Line label="Còn lại:" value={data.payRemain} />
          <Line label="Ngày dự kiến thanh toán:" value={data.payDueDate} />
        </FieldRow>
        <FieldRow>
          <Line label="Phương thức thanh toán:" value={data.paymentMethod} />
          <Line
            label="Chuyển nhượng:"
            value={data.transfer ? "☐ Có  ☑ Không" : "☐ Có  ☐ Không"}
          />
        </FieldRow>
        <Line label="Bảo lưu:" value="☐ Có  ☐ Không" />
        <Line label="Tại trung tâm:" value={data.homeClub} />
      </Section>

      <Section title="Người đồng ký tên (nếu có)">
        <FieldRow>
          <Line label="Họ và tên:" value="………………" />
          <Line label="Số điện thoại:" value="………………" />
        </FieldRow>
        <FieldRow>
          <Line label="Địa chỉ liên hệ:" value="………………" />
          <Line label="Mối quan hệ:" value="………………" />
        </FieldRow>
      </Section>

      <p className="mt-4 text-[10px] leading-snug text-[#4b5563]">
        Khách hàng xác nhận đã đọc và đồng ý các điều khoản & điều kiện của Hợp đồng Hội viên HHG
        OASIS. Hợp đồng lập thành 02 bản có giá trị như nhau (trung tâm giữ 01, khách giữ 01). Mã
        hội viên trên hệ thống: <strong className="font-mono">{data.memberCode}</strong>
        {data.isFamily ? " (đăng ký gia đình)." : " (đăng ký cá nhân)."}
      </p>

      <div className="mt-8 grid grid-cols-3 gap-4 text-center text-[11px]">
        <div>
          <div className="mb-12 border-b border-[#9ca3af]" />
          Chữ ký khách hàng
        </div>
        <div>
          <div className="mb-12 border-b border-[#9ca3af]" />
          Chữ ký tư vấn viên
          <div className="mt-1 text-[10px] text-[#6b7280]">{data.staffName}</div>
        </div>
        <div>
          <div className="mb-12 border-b border-[#9ca3af]" />
          Chữ ký quản lý
        </div>
      </div>
    </article>
  );
}

export function ReceiptHlvContract({ data }: { data: ReceiptFormData }) {
  return (
    <article className="mx-auto max-w-[800px] bg-white p-6 text-[#111827] print:p-0">
      <header className="border-b-2 border-[#111827] pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold tracking-tight">HỢP ĐỒNG DỊCH VỤ HLV</div>
            <div className="mt-0.5 text-sm font-semibold">HHG OASIS</div>
            <div className="text-[11px] text-[#4b5563]">
              27/58 Tây Lân, Phường Bình Tân – TP.HCM
            </div>
          </div>
          <div className="text-right text-[12px]">
            <div>
              Số phiếu / Form No: <strong className="font-mono">{data.formNo}</strong>
            </div>
            <div>
              Ngày / Date: <strong>{data.date}</strong>
            </div>
            <div className="mt-1 rounded border border-[#111827] px-2 py-0.5 text-[11px] font-medium">
              Loại ĐK: {data.registrationType}
            </div>
          </div>
        </div>
      </header>

      <Section title="Thông tin hội viên (Member information)">
        <FieldRow>
          <Line label="Họ và tên / Full name:" value={data.fullName} />
          <Line label="Mã hội viên / Member’s Barcode:" value={data.memberCode} />
        </FieldRow>
        <FieldRow>
          <Line label="Ngày tháng năm sinh:" value={data.dateOfBirth} />
          <Line label="Giới tính:" value={data.gender} />
        </FieldRow>
        <FieldRow>
          <Line label="Số CMND/Hộ chiếu:" value={data.idCard} />
          <Line label="Ngày cấp:" value={data.idIssueDate} />
        </FieldRow>
        <Line label="Nơi cấp:" value={data.idIssuePlace} />
        <Line label="Địa chỉ liên hệ:" value={data.address} />
        <Line label="Địa chỉ thường trú:" value={data.permanentAddress} />
        <FieldRow>
          <Line label="Số điện thoại di động:" value={data.phone} />
          <Line label="Email:" value={data.email} />
        </FieldRow>
        <FieldRow>
          <Line label="Cha mẹ/Người giám hộ (nếu có):" value={data.guardian} />
          <Line label="SĐT liên hệ:" value={data.guardianPhone} />
        </FieldRow>
      </Section>

      <Section title="Thông tin dịch vụ (Service information)">
        <FieldRow>
          <Line label="Loại dịch vụ:" value={data.serviceType} />
          <Line label="Tổng số buổi:" value={data.totalSessions} />
        </FieldRow>
        <FieldRow>
          <Line label="Giá buổi tập:" value={data.sessionPrice} />
          <Line label="Chương trình khuyến mãi:" value={data.promo} />
        </FieldRow>
        <FieldRow>
          <Line label="Tổng tiền:" value={data.payTotal} />
          <Line label="Tại Trung tâm:" value={data.homeClub} />
        </FieldRow>
        <FieldRow>
          <Line label="Số tiền trả trước:" value={data.payPrepaid} />
          <Line label="Số tiền còn lại:" value={data.payRemain} />
        </FieldRow>
      </Section>

      <Section title="Trách nhiệm pháp lý / Release of liability (tóm tắt)">
        <ul className="list-disc space-y-1 pl-4 text-[10px] leading-snug text-[#374151]">
          <li>Hội viên từ đủ 15 tuổi; dưới 15 tuổi cần người đại diện pháp luật ký.</li>
          <li>Thời hạn HĐDV = số buổi tập × 4 (ngày).</li>
          <li>Đăng ký buổi tập bằng thẻ / vân tay / Face ID trước buổi tập.</li>
          <li>Nghỉ tập phải báo trước 24h, nếu không vẫn tính chi phí buổi đó.</li>
          <li>Phí đã thanh toán không hoàn trả, không chuyển nhượng.</li>
        </ul>
      </Section>

      <p className="mt-4 text-[10px] leading-snug text-[#4b5563]">
        Mã hội viên trên hệ thống: <strong className="font-mono">{data.memberCode}</strong>
        {data.isFamily ? " (gia đình)." : " (cá nhân)."} Liên kết gói: {data.planName} ·{" "}
        {data.startDate} → {data.expiryDate}.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-8 text-center text-[11px]">
        <div>
          <div className="mb-12 border-b border-[#9ca3af]" />
          Chữ ký Hội viên (chữ ký, họ tên)
        </div>
        <div>
          <div className="mb-12 border-b border-[#9ca3af]" />
          Người quản lý HLV (chữ ký, họ tên)
          <div className="mt-1 text-[10px] text-[#6b7280]">{data.staffName}</div>
        </div>
      </div>
    </article>
  );
}
