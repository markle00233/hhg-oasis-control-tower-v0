/** In bill Hồ Olympic — mở cửa sổ receipt cho máy in bill (browser print). */

export type PoolBillLine = {
  nameVi: string;
  qty: number;
  unitPriceVnd: number;
};

export type PoolBillPayload = {
  customerName: string;
  phone?: string | null;
  shortId?: string | null;
  entryAt: string; // ISO
  totalVnd: number;
  items: PoolBillLine[];
  orderId?: string | null;
};

function fmtVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function printPoolBill(bill: PoolBillPayload) {
  const lines = bill.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:4px 0;text-align:left">${escapeHtml(i.nameVi)}</td>
          <td style="padding:4px 0;text-align:center">${i.qty}</td>
          <td style="padding:4px 0;text-align:right">${fmtVnd(i.unitPriceVnd * i.qty)}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <title>Bill Hồ Olympic</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #000;
      margin: 0;
      padding: 8px;
      width: 72mm;
    }
    h1 { font-size: 14px; margin: 0 0 4px; text-align: center; }
    .sub { text-align: center; margin-bottom: 10px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    .total { font-weight: 800; font-size: 14px; margin-top: 10px; text-align: right; }
    .meta { margin: 6px 0; line-height: 1.4; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  </style>
</head>
<body>
  <h1>HHG OASIS</h1>
  <div class="sub">HỒ OLYMPIC · VÉ BƠI</div>
  <hr/>
  <div class="meta">
    <div>Khách: <strong>${escapeHtml(bill.customerName || "—")}</strong></div>
    <div>SĐT: ${escapeHtml(bill.phone || "—")} · ID ${escapeHtml(bill.shortId || "—")}</div>
    <div>Giờ vào: <strong>${escapeHtml(fmtTime(bill.entryAt))}</strong></div>
    ${bill.orderId ? `<div>Mã: ${escapeHtml(bill.orderId.slice(-8).toUpperCase())}</div>` : ""}
  </div>
  <hr/>
  <table>
    <thead>
      <tr>
        <th style="text-align:left">Hạng mục</th>
        <th>SL</th>
        <th style="text-align:right">Tiền</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <hr/>
  <div class="total">TỔNG: ${fmtVnd(bill.totalVnd)}</div>
  <div class="sub" style="margin-top:12px">Cảm ơn quý khách</div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 120);
    };
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "noopener,noreferrer,width=360,height=640");
  if (!w) {
    throw new Error("Trình duyệt chặn popup — cho phép mở cửa sổ để in bill.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
