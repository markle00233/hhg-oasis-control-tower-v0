# Design system V0 — HHG Oasis

## Nguồn tham chiếu

Clone có kiểm tra: [`docs/reference/design-resources-for-developers/`](./reference/design-resources-for-developers/)  
Upstream: [bradtraversy/design-resources-for-developers](https://github.com/bradtraversy/design-resources-for-developers)

### Kiểm tra an toàn (24/09/2026)

| Kiểm tra | Kết quả |
|----------|---------|
| Chủ sở hữu / MIT / stars | `bradtraversy`, MIT, ~67k stars — danh sách curated công khai |
| File trong repo | Chỉ `readme.md`, `LICENSE`, `contributing.md`, `headerimage.png`, PR template |
| Script / binary / package.json | **Không có** |
| GitHub Actions workflows | **Không có** |
| Kết luận | An toàn để giữ làm **tài liệu tham chiếu** (không chạy code từ repo này) |

Repo này là catalog link (màu, UI kit, icon…) — **không** nhúng runtime. App dùng palette tự chốt bên dưới.

## Palette đang dùng

| Vai trò | Token | Hex |
|---------|-------|-----|
| Nền | `--bg` / `OasisTheme.bg` | `#FFFFFF` |
| Widget | `--widget-blue` | `#E8F4FC` |
| Widget đậm | `--widget-blue-strong` | `#CFEAFE` |
| Cam accent / CTA | `--cal-accent` | `#FF7A29` |
| Cam nhạt (P0/P1) | `--cal-yellow` | `#FFE0C2` |
| Chữ | `--ink` | `#0F172A` |
| Viền | `--line` | `#D7EBF8` |

Bo góc widget: **32px**. Nút hành động chính: **vòng tròn cam**. Filter phạm vi: strip cam + chấm chọn trắng (cơ chế lịch).
