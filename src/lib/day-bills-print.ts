/** Xuất PDF / in tất cả hoá đơn trong ngày (adminAllplace desk). */

export type DayBillLine = {
  nameVi: string;
  qty: number;
  unitPriceVnd?: number | null;
};

export type DayBill = {
  customerName: string;
  phone?: string | null;
  shortId?: string | null;
  segmentLabel?: string | null;
  at: string; // ISO
  statusLabel?: string | null;
  items: DayBillLine[];
  totalVnd: number | null;
  billText?: string | null;
  tokenShort?: string | null;
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

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printDayBillsPdf(opts: {
  zoneName: string;
  dayLabel: string;
  bills: DayBill[];
}) {
  const { zoneName, dayLabel, bills } = opts;
  const dayTotal = bills.reduce((s, b) => s + (b.totalVnd || 0), 0);

  const cards = bills
    .map((b, idx) => {
      const lines =
        b.items.length > 0
          ? b.items
              .map((i) => {
                const lineTotal =
                  i.unitPriceVnd != null
                    ? fmtVnd(i.unitPriceVnd * i.qty)
                    : "";
                return `<tr>
            <td>${escapeHtml(i.nameVi)}</td>
            <td style="text-align:center">${i.qty}</td>
            <td style="text-align:right">${lineTotal}</td>
          </tr>`;
              })
              .join("")
          : `<tr><td colspan="3">${escapeHtml(b.billText || "—")}</td></tr>`;

      return `<section class="bill">
        <div class="bill-head">
          <strong>#${idx + 1} · ${escapeHtml(b.customerName || "—")}</strong>
          <span>${escapeHtml(fmtTime(b.at))}</span>
        </div>
        <div class="meta">
          SĐT: ${escapeHtml(b.phone || "—")}
          · ID: ${escapeHtml(b.shortId || "—")}
          ${b.segmentLabel ? ` · ${escapeHtml(b.segmentLabel)}` : ""}
          ${b.statusLabel ? ` · ${escapeHtml(b.statusLabel)}` : ""}
          ${b.tokenShort ? ` · QR …${escapeHtml(b.tokenShort)}` : ""}
        </div>
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
        <div class="total">TỔNG: ${
          b.totalVnd != null ? fmtVnd(b.totalVnd) : "—"
        }</div>
      </section>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <title>Hoá đơn ${escapeHtml(zoneName)} · ${escapeHtml(dayLabel)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: #0f172a;
      margin: 0;
      padding: 8px;
    }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: #64748b; margin-bottom: 16px; }
    .summary {
      display: flex; gap: 24px; margin-bottom: 16px;
      padding: 10px 12px; background: #f8fafc; border-radius: 8px;
    }
    .bill {
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 12px;
    }
    .bill-head {
      display: flex; justify-content: space-between; gap: 8px;
      font-size: 13px; margin-bottom: 4px;
    }
    .meta { color: #64748b; margin-bottom: 8px; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 0; border-bottom: 1px dashed #e2e8f0; }
    th { color: #64748b; font-weight: 600; font-size: 11px; }
    .total { font-weight: 800; font-size: 14px; margin-top: 8px; text-align: right; }
    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>HHG OASIS · ${escapeHtml(zoneName)}</h1>
  <div class="sub">Bảng hoá đơn ngày ${escapeHtml(dayLabel)}</div>
  <div class="summary">
    <div><strong>${bills.length}</strong> hoá đơn</div>
    <div>Tổng ngày: <strong>${fmtVnd(dayTotal)}</strong></div>
  </div>
  ${cards || `<p>Không có hoá đơn trong ngày.</p>`}
  <p class="no-print" style="margin-top:20px;color:#64748b">
    Dùng Print → Save as PDF để lưu file.
  </p>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 180);
    };
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
  if (!w) {
    throw new Error("Trình duyệt chặn popup — cho phép mở cửa sổ để xuất PDF.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
