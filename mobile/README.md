# HHG Oasis — Flutter Mobile

App Flutter kết nối API production của Control Tower (cùng DB + session cookie `hhg_session`).

## Yêu cầu

- Flutter SDK 3.44+ (`flutter` đã có tại `/Users/hoangle/flutter`)
- iOS Simulator / Android Emulator hoặc thiết bị thật

## Chạy

```bash
cd mobile
flutter pub get
flutter run
```

API mặc định: `https://hhg-oasis-control-tower-v0.vercel.app`

Đổi base URL khi cần:

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.x.x:3000
```

(Với Android emulator, localhost máy host = `http://10.0.2.2:3000`)

## Đã migrate (MVP)

- Đăng nhập / đăng xuất (cookie session như web)
- Tổng quan (metrics + Task gần đây)
- Task: Tôi phụ trách / Tôi tham gia / filter / tìm kiếm
- Tạo Task
- Chi tiết Task: năng lượng, Bắt đầu/Cập nhật/Có vấn đề/Hoàn tất, hạng mục, người, chi phí, lịch sử
- Thêm hạng mục + chọn người phụ trách trong Task

## Chưa port (làm tiếp)

- Kho tài liệu / upload ảnh chứng từ
- Module Chi phí đầy đủ + AI gợi ý
- Quyết định / Issue
- Account switcher Tổng quan Oasis

Web vẫn là nguồn vận hành chính trên Vercel; app mobile dùng chung API.
