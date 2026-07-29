# TNVA CLOCK Studio

`weble/index.html` là trình thiết kế giao diện E-ink mặc định. Trang cài nhanh 6 mặt tích hợp và kho 123 mẫu được giữ tại `weble/faces.html`.

## Đưa lên GitHub Pages

Chép **toàn bộ nội dung thư mục `weble/`** lên repository GitHub Pages. Không đổi cấu trúc các thư mục:

```text
weble/
├── index.html
├── faces.html
├── assets/
├── previews/
└── warehouse/
```

Web Bluetooth chỉ chạy trên HTTPS hoặc localhost. GitHub Pages đã có HTTPS.

## Chức năng thiết kế

- Thiết kế ngoại tuyến, không bắt buộc kết nối đồng hồ.
- Kéo thả và thay đổi kích thước đối tượng trực tiếp trên canvas.
- Thêm chữ, giờ, ngày, thứ, âm lịch, điện áp, pin, đồng hồ kim, ảnh, đường và khung.
- Chỉnh font, cỡ chữ, canh lề, vị trí, kích thước và lớp.
- Ảnh có threshold, contrast, đảo màu, ordered/Floyd dithering, fit/fill và dịch ảnh.
- Undo/redo, nhân bản, Delete, Ctrl+Z, Ctrl+Y, Ctrl+D và phím mũi tên.
- Lưu dự án trong IndexedDB của trình duyệt.
- Xuất `.tnvaproject`, `.tnvaface`, mở lại để sửa.
- Nhập file `.eink` của app cũ; ảnh, chữ và vùng động thông dụng được chuyển sang dự án TNVA. Lịch tháng và các shape đặc biệt được chuyển gần đúng vì firmware DA14585 hiện không có renderer tương ứng.
- Biên dịch gói 1-bit tối đa 4 KB và gửi trực tiếp vào DA14585 bằng BLE.
- Duyệt và cài trực tiếp 123 giao diện 212×104 trong tab **Thư viện → Kho 123**.

## Dữ liệu động trên DA14585

Firmware khe động hỗ trợ tối đa 12 vùng động:

- Giờ/phút
- Ngày/tháng/năm
- Thứ
- Âm lịch
- Điện áp
- Biểu tượng pin
- Đồng hồ kim

Phần chữ và ảnh tĩnh được raster hóa thành nền 1-bit. Gói được lưu ở SPI Flash `0x3C000`, mặt đang chọn được lưu ở `0x3B000`.

## Kho cộng đồng tùy chọn

Web có thể dùng Supabase để đăng giao diện công khai:

1. Tạo project Supabase.
2. Chạy `supabase-schema.sql` trong SQL Editor.
3. Điền URL và anon key trong `assets/js/config.js`.

Không cấu hình Supabase thì editor, lưu cục bộ, kho 123 và gửi BLE vẫn hoạt động bình thường.
