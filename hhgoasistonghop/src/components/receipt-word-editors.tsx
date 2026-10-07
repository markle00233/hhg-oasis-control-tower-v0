"use client";

import { cn } from "@/lib/utils";

function Blank({
  name,
  defaultValue,
  className,
  placeholder = "……………………",
  required,
  readOnly,
}: {
  name: string;
  defaultValue?: string;
  className?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <input
      name={name}
      defaultValue={defaultValue}
      required={required}
      readOnly={readOnly}
      placeholder={placeholder}
      className={cn(
        "w-full min-w-0 border-0 border-b border-dotted border-[#374151] bg-transparent px-0.5 py-0.5 text-[11px] font-medium text-[#111827] outline-none focus:border-[#111827]",
        readOnly && "cursor-default",
        className
      )}
    />
  );
}

function Cell({
  children,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn("border border-[#111827] px-2 py-1.5 align-top text-[11px]", className)}
    >
      {children}
    </td>
  );
}

function HeadCell({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className="border border-[#111827] bg-[#f3f4f6] px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide"
    >
      {children}
    </td>
  );
}

function FieldBlock({
  label,
  name,
  defaultValue,
  required,
  hint,
  readOnly,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="font-medium text-[#111827]">{label}</div>
      {hint && <div className="text-[9px] italic text-[#6b7280]">{hint}</div>}
      <Blank name={name} defaultValue={defaultValue} required={required} readOnly={readOnly} />
    </div>
  );
}

function Term({ n, children }: { n?: string | number; children: React.ReactNode }) {
  return (
    <p className="mb-2 text-justify text-[10px] leading-relaxed text-[#111827]">
      {n != null && <strong>{n}. </strong>}
      {children}
    </p>
  );
}

function LiabilityBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="text-[11px] font-bold text-[#111827]">{title}</div>
      <p className="text-justify text-[10px] leading-relaxed text-[#111827]">{children}</p>
    </div>
  );
}

export function MemberWordDocument({
  defaults,
  readOnly = false,
}: {
  defaults: Record<string, string>;
  readOnly?: boolean;
}) {
  const d = defaults;
  return (
    <article className="mx-auto w-full max-w-[900px] overflow-x-auto bg-white p-3 text-[#111827] shadow-sm sm:p-5 print:overflow-visible print:p-0 print:shadow-none">
      {/* Header như Word */}
      <div className="mb-3 grid grid-cols-[1.2fr_0.8fr] gap-3 border-b-2 border-[#111827] pb-3">
        <div>
          <div className="text-center text-base font-bold tracking-wide">HỢP ĐỒNG HỘI VIÊN</div>
          <div className="mt-1 text-center text-sm font-semibold">HHG OASIS</div>
          <div className="text-center text-[11px]">27/58 Tây Lân, Phường Bình Tân – TP.HCM</div>
          <div className="mt-2 flex items-baseline gap-2 text-[11px]">
            <span className="shrink-0 font-medium">Mã số doanh nghiệp:</span>
            <Blank name="businessCode" defaultValue={d.businessCode} readOnly={readOnly} />
          </div>
        </div>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-medium">Số phiếu / Form No:</span>
            <Blank
              name="formNoHint"
              defaultValue={d.formNoHint || "(tự sinh khi lưu)"}
              readOnly={readOnly}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-medium">Ngày / Date:</span>
            <Blank name="formDate" defaultValue={d.formDate} required={!readOnly} readOnly={readOnly} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-medium">Loại đăng ký:</span>
            {readOnly ? (
              <span className="font-semibold">
                {d.isFamily === "1" ? "Gia đình (GĐ)" : "Cá nhân"}
              </span>
            ) : (
              <select
                name="isFamily"
                defaultValue={d.isFamily || "0"}
                className="border-0 border-b border-dotted border-[#374151] bg-transparent text-[11px] font-semibold outline-none"
              >
                <option value="0">Cá nhân</option>
                <option value="1">Gia đình (GĐ)</option>
              </select>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-medium">Mã hội viên:</span>
            <Blank
              name="memberCode"
              defaultValue={d.memberCode}
              required={!readOnly}
              readOnly={readOnly}
              placeholder="CUS-000001 / CUS-… - GĐ"
              className="font-mono"
            />
          </div>
        </div>
      </div>

      {/* Bảng 2 cột đúng Word */}
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <HeadCell>Thông tin hội viên (Member information)</HeadCell>
            <HeadCell>Thông tin thẻ hội viên</HeadCell>
          </tr>
          <tr>
            <Cell>
              <FieldBlock label="Họ và tên :" name="fullName" defaultValue={d.fullName} required={!readOnly} readOnly={readOnly} />
            </Cell>
            <Cell>
              <FieldBlock label="Gói thẻ đăng ký:" name="planName" defaultValue={d.planName} readOnly={readOnly} />
            </Cell>
          </tr>
          <tr>
            <Cell>
              <FieldBlock label="Số điện thoại:" name="phone" defaultValue={d.phone} readOnly={readOnly} />
            </Cell>
            <Cell>
              <FieldBlock label="Số tháng đăng ký:" name="planMonths" defaultValue={d.planMonths} readOnly={readOnly} />
            </Cell>
          </tr>
          <tr>
            <Cell>
              <div className="grid grid-cols-2 gap-2">
                <FieldBlock label="Ngày sinh: …/…/…" name="dateOfBirth" defaultValue={d.dateOfBirth} readOnly={readOnly} />
                <FieldBlock label="Giới tính:" name="gender" defaultValue={d.gender} readOnly={readOnly} />
              </div>
            </Cell>
            <Cell>
              <FieldBlock label="Phí gia nhập:" name="joinFee" defaultValue={d.joinFee} readOnly={readOnly} />
            </Cell>
          </tr>
          <tr>
            <Cell>
              <FieldBlock label="Địa chỉ :" name="address" defaultValue={d.address} readOnly={readOnly} />
            </Cell>
            <Cell>
              <FieldBlock label="Ưu đãi:" name="promo" defaultValue={d.promo} readOnly={readOnly} />
            </Cell>
          </tr>
          <tr>
            <Cell>
              <FieldBlock
                label="Người liên hệ khẩn cấp:"
                name="emergencyContactLine"
                defaultValue={d.emergencyContactLine || d.emergencyName}
                readOnly={readOnly}
              />
            </Cell>
            <Cell>
              <FieldBlock label="Phí thanh toán:" name="payTotal" defaultValue={d.payTotal} readOnly={readOnly} />
            </Cell>
          </tr>
          <tr>
            <Cell>
              <FieldBlock label="Họ và tên:" name="emergencyName" defaultValue={d.emergencyName} readOnly={readOnly} />
            </Cell>
            <Cell>
              <FieldBlock label="Trả trước:" name="payPrepaid" defaultValue={d.payPrepaid} readOnly={readOnly} />
            </Cell>
          </tr>
          <tr>
            <Cell>
              <FieldBlock label="Điện thoại:" name="emergencyPhone" defaultValue={d.emergencyPhone} readOnly={readOnly} />
            </Cell>
            <Cell>
              <FieldBlock label="Còn lại:" name="payRemain" defaultValue={d.payRemain || "0"} readOnly={readOnly} />
            </Cell>
          </tr>
          <tr>
            <Cell>
              <FieldBlock
                label="Ngày bắt đầu tập dự kiến: …/…/20…"
                name="startDate"
                defaultValue={d.startDate}
                readOnly={readOnly}
              />
            </Cell>
            <Cell>
              <div className="space-y-1">
                <FieldBlock
                  label="Ngày dự kiến thanh toán: …/…/20…"
                  name="payDueDate"
                  defaultValue={d.payDueDate}
                  readOnly={readOnly}
                />
                <FieldBlock
                  label="Phương thức thanh toán:"
                  name="paymentMethod"
                  defaultValue={d.paymentMethod}
                  readOnly={readOnly}
                />
              </div>
            </Cell>
          </tr>
          <tr>
            <Cell>
              <div className="font-medium">Chuyển nhượng:</div>
              {readOnly ? (
                <div className="mt-1">{d.transfer === "Có" ? "☑ Có  ☐ Không" : "☐ Có  ☑ Không"}</div>
              ) : (
                <select
                  name="transfer"
                  defaultValue={d.transfer || "Không"}
                  className="mt-1 w-full border border-[#d1d5db] bg-white px-1 py-0.5 text-[11px]"
                >
                  <option value="Không">☐ Có  ☑ Không</option>
                  <option value="Có">☑ Có  ☐ Không</option>
                </select>
              )}
            </Cell>
            <Cell>
              <div className="font-medium">Bảo lưu:</div>
              {readOnly ? (
                <div className="mt-1">{d.pause === "Có" ? "☑ Có  ☐ Không" : "☐ Có  ☑ Không"}</div>
              ) : (
                <select
                  name="pause"
                  defaultValue={d.pause || "Không"}
                  className="mt-1 w-full border border-[#d1d5db] bg-white px-1 py-0.5 text-[11px]"
                >
                  <option value="Không">☐ Có  ☑ Không</option>
                  <option value="Có">☑ Có  ☐ Không</option>
                </select>
              )}
              <div className="mt-2">
                <FieldBlock label="Ngày hết hạn:" name="expiryDate" defaultValue={d.expiryDate} readOnly={readOnly} />
              </div>
            </Cell>
          </tr>
          <tr>
            <HeadCell colSpan={2}>Người đồng ký tên</HeadCell>
          </tr>
          <tr>
            <Cell colSpan={2}>
              <p className="mb-2 text-justify text-[10px] leading-relaxed">
                Cha, mẹ/ người giám hộ thay mặt con cái, chưa thành niên của tôi, tôi thừa nhận sự đồng ý
                và chịu sự ràng buộc của các điều kiện và điều khoản của phiếu thông tin khách hàng và
                chính sách sử dụng dịch vụ này và sẽ có trách nhiệm thanh toán tất cả khoản phí mà con
                chưa thành niên của tôi sử dụng hoặc yêu cầu. Với tư cách là cha, mẹ/ người giám hộ, tôi
                hiểu rằng nghĩa vụ của tôi theo phiếu thông tin khách hàng và chính sách sử dụng dịch vụ
                này chỉ chấm dứt khi các gói dịch vụ của khách hàng ký tên chấm dứt khi điều khoản phiếu
                thông tin và chính sách sử dụng đúng dịch vụ này.
              </p>
            </Cell>
          </tr>
          <tr>
            <Cell>
              <FieldBlock label="Tên viết hoa:" name="cosignerName" defaultValue={d.cosignerName || d.emergencyName} readOnly={readOnly} />
            </Cell>
            <Cell>
              <FieldBlock label="Số điện thoại:" name="cosignerPhone" defaultValue={d.cosignerPhone || d.emergencyPhone} readOnly={readOnly} />
            </Cell>
          </tr>
          <tr>
            <Cell>
              <FieldBlock label="Địa chỉ liên hệ:" name="emergencyAddress" defaultValue={d.emergencyAddress} readOnly={readOnly} />
            </Cell>
            <Cell>
              <FieldBlock label="Mối quan hệ:" name="emergencyRelation" defaultValue={d.emergencyRelation} readOnly={readOnly} />
            </Cell>
          </tr>
        </tbody>
      </table>

      <input type="hidden" name="email" defaultValue={d.email || ""} />
      <input type="hidden" name="staffName" defaultValue={d.staffName || ""} />
      <input type="hidden" name="note" defaultValue={d.note || ""} />

      <h2 className="mb-2 mt-6 border-b border-[#111827] pb-1 text-center text-[12px] font-bold uppercase">
        Các điều khoản và điều kiện
      </h2>
      <Term n={1}>
        Khách hàng phải có đủ khả năng và hành vi dân sự theo pháp luật của Việt Nam để ký phiếu khách
        hàng này. Nếu khách hàng có năng lực hành vi dân sự chưa đầy đủ thì khách hàng phải chứng minh
        rằng khách hàng đã được người đại diện theo pháp luật của mình đồng ý trước khi ký hợp đồng hội
        viên (HDHV) này. Phí hội viên có thể khác nhau tùy thuộc vào loại thẻ hội viên, địa điểm HHG
        OASIS và thời gian đăng ký trở thành Hội viên. Mọi khoản tiền đã được Hội viên thanh toán theo
        hợp đồng này, bao gồm phí hội viên và bất kỳ khoản phí nào khác được quy định tại hợp đồng này
        hoặc các quy định của HHG OASIS (nếu có) sẽ không được hoàn lại trong bất kỳ trường hợp nào.
      </Term>
      <Term n={2}>
        Bản chất gói dịch vụ theo HDHV này có tính chất cá nhân. Thẻ hội viên theo hợp đồng này sẽ dành
        riêng cho Hội viên được hưởng các quyền, đặc biệt và lợi ích kèm theo thẻ hội viên. Hội viên chỉ
        được phép chuyển nhượng 01 lần đối với thời gian đăng ký 12 tháng trở lên đối với số tháng tặng
        sẽ không được chuyển nhượng và phí chuyển nhượng là 300.000 VND, chuyển nhượng chỉ áp dụng cho
        khách hàng chưa là Hội viên của HHG OASIS hoặc là người thân trong gia đình của hội viên
        (cha, mẹ, anh, chị, em, con ruột).
      </Term>
      <Term n={3}>
        Dịch vụ huấn luyện viên (HLV) cá nhân: Ngoài việc tự tập luyện với thiết bị, dụng cụ thể thao
        được trang bị tại HHG OASIS hoặc tham gia các lớp tập luyện theo nhóm do HHG OASIS tổ chức, Hội
        viên có thể yêu cầu dịch vụ tập luyện riêng với HLV cá nhân của HHG OASIS. Dịch vụ HLV cá nhân
        có thể được thỏa thuận bằng 1 hợp đồng (hợp đồng HLV) tách biệt với hợp đồng này.
      </Term>
      <Term n={4}>
        Trung tâm có toàn quyền thay đổi tên HHG OASIS, trung tâm sẽ gửi cho Hội viên thông báo trước
        bằng văn bản về bất kỳ sự thay đổi nào của trung tâm. Việc thay đổi địa điểm và tên trung tâm:
        HHG OASIS có thể thay đổi địa điểm HHG OASIS về nơi mà HHG OASIS cho là thích hợp, với điều kiện
        là địa điểm mới sẽ nằm trong bán kính 5km tính từ địa điểm cũ.
      </Term>
      <Term n={5}>
        Trong suốt quá trình sử dụng dịch vụ, khách hàng có trách nhiệm với đồ cá nhân của mình, trung
        tâm sẽ không chịu bất kỳ trách nhiệm nào cho việc mất đồ cá nhân của khách hàng. Khi vào HHG
        OASIS, Hội viên phải xuất trình thẻ hội viên hoặc check in dấu vân tay/ face ID, nhân viên HHG
        OASIS sẽ có quyền chụp tấm hình của Hội viên cho mục đích nhận diện Hội viên trong trung tâm.
      </Term>
      <Term n={6}>
        Quy định về việc bảo lưu thẻ hội viên không áp dụng cho khách hàng sử dụng phiếu tập thử hoặc
        thẻ ngắn hạn 90 ngày. Hội viên chỉ được phép bảo lưu tối đa là 30 ngày/ 1 lần bảo lưu. Đối với
        thẻ tập 6 tháng Hội viên được bảo lưu 1 lần. Với thẻ tập 12 tháng trở lên hội viên được bảo lưu
        2 lần. Với thẻ tập từ 24 tháng hội viên được bảo lưu 4 lần.
      </Term>
      <Term n={7}>
        Quy định về thanh toán HDDV: Đối với khách hàng đăng ký gói từ 01 tháng đến 03 tháng phải thực
        hiện thanh toán 01 lần vào ngày ký kết hợp đồng. Đối với hợp đồng từ 04 tháng trở lên, khách
        hàng sẽ được cọc 50% vào ngày ký hợp đồng và phải thanh toán đầy đủ số tiền còn lại trong vòng
        30 ngày kể từ ngày phát sinh hợp đồng với HHG OASIS (Nếu quá thời hạn 30 ngày mà khách hàng vẫn
        chưa thanh toán đủ số tiền còn lại của HDDV thì HHG OASIS sẽ hủy hợp đồng đã ký kết mà không cần
        phải báo trước cho khách hàng và sẽ không hoàn lại số tiền mà khách đã cọc trước đó).
      </Term>
      <Term n={8}>
        Bất kỳ sự sửa đổi hoặc bổ sung đối với HĐHV này phải được lập thành văn bản và được ký bởi khách
        hàng và người đại diện theo ủy quyền của trung tâm. Bất kỳ văn bản nào bằng viết tay hoặc lời
        nói đều không hợp lệ. Trung tâm có quyền quyết định điều chỉnh điều khoản và điều kiện tùy từng
        thời điểm theo quy định của pháp luật Việt Nam mà không cần sự đồng ý của khách hàng trong từng
        trường hợp cần thiết cho: (1) Tình hình hoạt động của trung tâm HHG OASIS hoặc (2) Để duy trì
        trật tự, bảo đảm an toàn, lợi ích chung của khách hàng khác.
      </Term>
      <Term n={9}>
        HHG OASIS có quyền chấm dứt hợp đồng này và thẻ hội viên mà không hoàn trả bất kỳ khoản phí nào
        cho Hội viên trong trường hợp Hội viên vi phạm bất kỳ điều khoản nào của hợp đồng này, hay bất kỳ
        quy định nào của HHG OASIS. Tại bất kỳ thời điểm nào trong thời hạn của hợp đồng này, HHG OASIS
        có toàn quyền chuyển giao các quyền và nghĩa vụ của HHG OASIS theo hợp đồng này cho bất kỳ bên
        thứ ba nào. Hội viên theo đây, không hủy ngang, chấp thuận bất kỳ việc chuyển giao quyền và nghĩa
        vụ của HHG OASIS theo hợp đồng này cho bên thứ ba nào.
      </Term>
      <Term n={10}>
        HĐHV này được làm trên giấy thành 2 bản được xem như là bản gốc và có giá trị như nhau. Trung
        tâm sẽ giữ 01 bản và khách hàng sẽ giữ 01 bản. Khách hàng xác nhận đã nhận được 01 bản của phiếu
        khách hàng này, khách hàng có thể sử dụng để vào trung tâm HHG OASIS cho đến khi được làm thẻ
        hội viên hoặc làm dấu vân tay/ Face ID trên hệ thống.
      </Term>
      <Term n={11}>
        Việc sử dụng thiết bị của HHG OASIS vốn tiềm ẩn các rủi ro có thể gây tổn thương cho bản thân
        Hội viên hoặc các hội viên khác hoặc khách hàng mời của HHG OASIS, bất kể do hội viên hay một
        người khác gây ra. Hội viên hiểu và tự nguyện chấp nhận rủi ro. Hội viên cam đoan và khẳng định
        rằng Hội viên đã tham khảo ý kiến bác sĩ của mình trước khi bắt đầu chương trình tập luyện nào.
        Hội viên đồng ý chịu mọi trách nhiệm đối với tất cả các nghĩa vụ tài chính hoặc thiệt hại phát
        sinh từ bất kỳ thương tổn nào.
      </Term>

      {/* Chữ ký luôn ở cuối tờ — chừa khoảng trống ký */}
      <div className="mt-10 break-inside-avoid print:mt-12">
        <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[#111827]">
          Xác nhận ký kết
        </div>
        <div className="grid grid-cols-3 gap-6 text-center text-[11px]">
          <div>
            <div className="mb-2 text-[10px] text-[#6b7280]">Ngày …… / …… / 20……</div>
            <div className="h-24 border-b border-[#111827]" />
            <div className="mt-2 font-medium">Chữ ký khách hàng</div>
            <div className="text-[9px] text-[#6b7280]">(Ký và ghi rõ họ tên)</div>
          </div>
          <div>
            <div className="mb-2 text-[10px] text-[#6b7280]">Ngày …… / …… / 20……</div>
            <div className="h-24 border-b border-[#111827]" />
            <div className="mt-2 font-medium">Chữ ký tư vấn viên</div>
            <div className="text-[9px] text-[#6b7280]">(Ký và ghi rõ họ tên)</div>
          </div>
          <div>
            <div className="mb-2 text-[10px] text-[#6b7280]">Ngày …… / …… / 20……</div>
            <div className="h-24 border-b border-[#111827]" />
            <div className="mt-2 font-medium">Chữ ký quản lý</div>
            <div className="text-[9px] text-[#6b7280]">(Ký và ghi rõ họ tên)</div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ServiceWordDocument({
  defaults,
  readOnly = false,
}: {
  defaults: Record<string, string>;
  readOnly?: boolean;
}) {
  const d = defaults;
  return (
    <article className="mx-auto w-full max-w-[900px] overflow-x-auto bg-white p-3 text-[#111827] shadow-sm sm:p-5 print:overflow-visible print:p-0 print:shadow-none">
      <div className="mb-1 text-center text-base font-bold tracking-wide">HỢP ĐỒNG DỊCH VỤ</div>
      <div className="mb-3 grid grid-cols-2 gap-4 border-b-2 border-[#111827] pb-3 text-[11px]">
        <div>
          <div className="font-semibold">HHG OASIS</div>
          <div>27/58 Tây Lân, Phường Bình Tân – TP.HCM</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="shrink-0 font-medium">Loại đăng ký:</span>
            {readOnly ? (
              <span className="font-semibold">
                {d.isFamily === "1" ? "Gia đình (GĐ)" : "Cá nhân"}
              </span>
            ) : (
              <select
                name="isFamily"
                defaultValue={d.isFamily || "0"}
                className="border-0 border-b border-dotted border-[#374151] bg-transparent font-semibold outline-none"
              >
                <option value="0">Cá nhân</option>
                <option value="1">Gia đình (GĐ)</option>
              </select>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-medium">Số phiếu / Form No:</span>
            <Blank name="formNoHint" defaultValue={d.formNoHint || "(tự sinh khi lưu)"} readOnly={readOnly} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-medium">Ngày / Date:</span>
            <Blank name="formDate" defaultValue={d.formDate} required={!readOnly} readOnly={readOnly} />
          </div>
        </div>
      </div>

      <div className="mb-2 border border-[#111827] bg-[#f3f4f6] px-2 py-1 text-center text-[11px] font-bold uppercase">
        Thông tin hội viên (Member information)
      </div>

      <div className="mb-3 space-y-2 text-[11px]">
        <div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <span className="font-medium">Họ và tên:</span>
              <Blank name="fullName" defaultValue={d.fullName} required={!readOnly} readOnly={readOnly} />
            </div>
            <span className="pb-1 font-medium">Mã Hội viên:</span>
            <Blank
              name="memberCode"
              defaultValue={d.memberCode}
              required={!readOnly}
              readOnly={readOnly}
              className="font-mono"
              placeholder="CUS-000001"
            />
          </div>
          <div className="mt-0.5 grid grid-cols-2 text-[9px] italic text-[#6b7280]">
            <span>Full name</span>
            <span className="text-right">Member’s Barcode</span>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="font-medium">Ngày tháng năm sinh:</span>
              <Blank name="dateOfBirth" defaultValue={d.dateOfBirth} readOnly={readOnly} />
            </div>
            <div>
              <span className="font-medium">Giới tính:</span>
              <Blank name="gender" defaultValue={d.gender} readOnly={readOnly} />
            </div>
          </div>
          <div className="mt-0.5 grid grid-cols-2 text-[9px] italic text-[#6b7280]">
            <span>Date of birth</span>
            <span>Gender</span>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="font-medium">Số CMND/Hộ chiếu:</span>
              <Blank name="idCard" defaultValue={d.idCard} readOnly={readOnly} />
            </div>
            <div>
              <span className="font-medium">Ngày cấp:</span>
              <Blank name="idIssueDate" defaultValue={d.idIssueDate} readOnly={readOnly} />
            </div>
            <div>
              <span className="font-medium">Nơi cấp:</span>
              <Blank name="idIssuePlace" defaultValue={d.idIssuePlace} readOnly={readOnly} />
            </div>
          </div>
          <div className="mt-0.5 grid grid-cols-3 text-[9px] italic text-[#6b7280]">
            <span>Identity card/Passport No.</span>
            <span>Date of issue</span>
            <span>Place of issue</span>
          </div>
        </div>

        <div>
          <span className="font-medium">Địa chỉ liên hệ:</span>
          <Blank name="address" defaultValue={d.address} readOnly={readOnly} />
          <div className="text-[9px] italic text-[#6b7280]">Mailing address</div>
        </div>

        <div>
          <span className="font-medium">Địa chỉ thường trú:</span>
          <Blank name="permanentAddress" defaultValue={d.permanentAddress} readOnly={readOnly} />
          <div className="text-[9px] italic text-[#6b7280]">Residential permanent address</div>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="font-medium">Số điện thoại di động:</span>
              <Blank name="phone" defaultValue={d.phone} readOnly={readOnly} />
            </div>
            <div>
              <span className="font-medium">Email:</span>
              <Blank name="email" defaultValue={d.email} readOnly={readOnly} />
            </div>
          </div>
          <div className="text-[9px] italic text-[#6b7280]">Mobile phone</div>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="font-medium">Thông tin Cha mẹ/Người giám hộ (nếu có):</span>
              <Blank name="guardian" defaultValue={d.guardian} readOnly={readOnly} />
            </div>
            <div>
              <span className="font-medium">Số điện thoại liên hệ:</span>
              <Blank name="guardianPhone" defaultValue={d.guardianPhone} readOnly={readOnly} />
            </div>
          </div>
          <div className="mt-0.5 grid grid-cols-2 text-[9px] italic text-[#6b7280]">
            <span>Parent/Guardian (if any)</span>
            <span>Phone</span>
          </div>
        </div>
      </div>

      <div className="mb-2 border border-[#111827] bg-[#f3f4f6] px-2 py-1 text-center text-[11px] font-bold uppercase">
        Thông tin dịch vụ (Service information)
      </div>

      <div className="mb-3 space-y-2 text-[11px]">
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="font-medium">Loại dịch vụ:</span>
              <Blank name="serviceType" defaultValue={d.serviceType} readOnly={readOnly} />
            </div>
            <div>
              <span className="font-medium">Tổng số buổi:</span>
              <Blank name="totalSessions" defaultValue={d.totalSessions} readOnly={readOnly} />
            </div>
          </div>
          <div className="mt-0.5 grid grid-cols-2 text-[9px] italic text-[#6b7280]">
            <span>Service type</span>
            <span>Total sessions</span>
          </div>
        </div>
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="font-medium">Giá buổi tập:</span>
              <Blank name="sessionPrice" defaultValue={d.sessionPrice} readOnly={readOnly} />
            </div>
            <div>
              <span className="font-medium">Chương trình khuyến mãi:</span>
              <Blank name="promo" defaultValue={d.promo} readOnly={readOnly} />
            </div>
          </div>
          <div className="mt-0.5 grid grid-cols-2 text-[9px] italic text-[#6b7280]">
            <span>Session type</span>
            <span>Promotion</span>
          </div>
        </div>
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="font-medium">Tổng tiền:</span>
              <Blank name="payTotal" defaultValue={d.payTotal} readOnly={readOnly} />
            </div>
            <div>
              <span className="font-medium">Tại Trung tâm:</span>
              <Blank name="homeClub" defaultValue={d.homeClub} readOnly={readOnly} />
            </div>
          </div>
          <div className="mt-0.5 grid grid-cols-2 text-[9px] italic text-[#6b7280]">
            <span>Total amount</span>
            <span>Home club</span>
          </div>
        </div>
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="font-medium">Số tiền trả trước:</span>
              <Blank name="payPrepaid" defaultValue={d.payPrepaid} readOnly={readOnly} />
            </div>
            <div>
              <span className="font-medium">Số tiền còn lại:</span>
              <Blank name="payRemain" defaultValue={d.payRemain || "0"} readOnly={readOnly} />
            </div>
          </div>
          <div className="mt-0.5 grid grid-cols-2 text-[9px] italic text-[#6b7280]">
            <span>Registered fee</span>
            <span>Remaining amount</span>
          </div>
        </div>
      </div>

      <input type="hidden" name="staffName" defaultValue={d.staffName || ""} />
      <input type="hidden" name="note" defaultValue={d.note || ""} />

      <div className="mb-2 border border-[#111827] bg-[#f3f4f6] px-2 py-1 text-center text-[11px] font-bold uppercase">
        Trách nhiệm pháp lý / Release of liability
      </div>

      <LiabilityBlock title="Năng lực ký kết">
        Vào ngày hiệu lực, Hội viên phải từ đủ 15 (mười lăm) tuổi trở lên. Hội viên có trách nhiệm cung
        cấp giấy tờ hợp lệ chứng minh độ tuổi của mình. Nếu Hội viên từ đủ 06 (sáu) tuổi đến chưa đủ 15
        (mười lăm) tuổi hoặc bị hạn chế về năng lực hành vi dân sự, người đại diện theo pháp luật của Hội
        viên sẽ đại diện cho Hội viên ký kết Hợp đồng Dịch vụ này.
      </LiabilityBlock>
      <LiabilityBlock title="Thời hạn">
        Thời hạn của Hợp đồng này (“Thời hạn”) sẽ bắt đầu vào ngày Hội viên sử dụng buổi tập đầu tiên
        (do Hội viên đồng ý) và trong mọi trường hợp không muộn hơn 08 (tám) ngày kể từ ngày hoàn tất
        thanh toán Hợp đồng này cho một khoảng thời gian được tính như sau:
      </LiabilityBlock>
      <p className="mb-1 text-center text-[11px] font-semibold">
        Thời hạn Hợp đồng Dịch vụ = Số buổi tập với Huấn luyện viên × 4
      </p>
      <p className="mb-2 text-justify text-[10px] leading-relaxed">
        Thời gian sẽ là số ngày bằng số buổi tập đăng ký mua nhân với 04 (bốn). Nói cách khác, để sử
        dụng hết số buổi tập đăng ký mua, khoảng thời gian tối đa cho phép giữa hai buổi tập liên tiếp
        nhau là 04 (bốn) ngày.
      </p>
      <LiabilityBlock title="Đăng ký buổi tập">
        Hội viên phải đăng ký bằng thẻ/vân tay/Face ID hoặc ký xác nhận vào mẫu do trung tâm cung cấp
        trước buổi tập với HLV.
      </LiabilityBlock>
      <LiabilityBlock title="Huấn luyện viên thay thế">
        Trung tâm bảo lưu cung cấp bất kỳ HLV thay thế nào khác trong trường hợp HLV được chỉ định không
        thể hỗ trợ tập luyện vì bất kỳ lý do nào.
      </LiabilityBlock>
      <LiabilityBlock title="Nghỉ tập">
        Nếu nghỉ tập, khách hàng phải thông báo trước 24h cho HLV tập luyện của mình, nếu không khách
        hàng sẽ bị tính chi phí cho bài tập đó.
      </LiabilityBlock>
      <LiabilityBlock title="Đại diện ký tên">
        Chỉ cần 01 Hội viên đại diện cho nhóm ký tên cho mỗi buổi tập vào thời điểm tập luyện thì được
        tính cho cả nhóm.
      </LiabilityBlock>
      <LiabilityBlock title="Không chuyển nhượng">
        Phí Dịch vụ đã thanh toán sẽ không được hoàn trả, không được chuyển nhượng và không được khấu
        trừ để thanh toán các khoản phí, chi phí khác mà Hội viên chưa thanh toán cho trung tâm vì bất kỳ
        lý do nào.
      </LiabilityBlock>
      <LiabilityBlock title="Toàn bộ thỏa thuận">
        Hội viên thừa nhận rằng trung tâm hay bất kỳ nhân viên của trung tâm đã không đưa ra bất kỳ cam
        đoan hoặc hứa hẹn nào với Hội viên liên quan đến dịch vụ HLV và Hội viên tự nguyện ký kết Hợp
        đồng Dịch vụ này. Nếu có bất kỳ thỏa thuận nào giữa nhân viên tư vấn và Hội viên nằm ngoài các
        điều khoản trên xin vui lòng liệt kê tại đây:
      </LiabilityBlock>
      <div className="mb-1">
        <Blank name="extraAgreement1" defaultValue={d.extraAgreement1 || d.extraAgreement} readOnly={readOnly} />
      </div>
      <div className="mb-1">
        <Blank name="extraAgreement2" defaultValue={d.extraAgreement2} readOnly={readOnly} />
      </div>
      <div className="mb-4">
        <Blank name="extraAgreement3" defaultValue={d.extraAgreement3} readOnly={readOnly} />
      </div>

      {/* Chữ ký cuối tờ — chừa khoảng trống ký */}
      <div className="mt-10 break-inside-avoid print:mt-12">
        <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[#111827]">
          Xác nhận ký kết
        </div>
        <div className="grid grid-cols-2 gap-10 text-center text-[11px]">
          <div>
            <div className="mb-2 text-[10px] text-[#6b7280]">Ngày …… / …… / 20……</div>
            <div className="h-28 border-b border-[#111827]" />
            <div className="mt-2 font-medium">Chữ ký Hội viên (chữ ký, họ tên)</div>
          </div>
          <div>
            <div className="mb-2 text-[10px] text-[#6b7280]">Ngày …… / …… / 20……</div>
            <div className="h-28 border-b border-[#111827]" />
            <div className="mt-2 font-medium">Người quản lý HLV (chữ ký, họ tên)</div>
          </div>
        </div>
      </div>
    </article>
  );
}
