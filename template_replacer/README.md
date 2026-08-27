# Template Replacer

Template Replacer là một tiện ích mở rộng (Browser Extension) dành cho Google Chrome / Microsoft Edge giúp bạn điền nhanh các đoạn văn bản mẫu (template) có chứa các biến cần thay thế, đồng thời lưu trữ các đoạn prompt thường dùng.

## 🌟 Các tính năng chính

- **Trích xuất Biến Tự Động:** Tương tác theo thời gian thực. Khi dán đoạn text chứa các biến theo cú pháp `{{ tên_biến }}`, Extension sẽ tự động trích xuất các biến này thành các ô nhập liệu (input) ở bên dưới.
- **Thay thế & Xem trước Real-time:** Khi bạn gõ giá trị ở các ô input, vùng kết quả sẽ tự động cập nhật và thay thế hàng loạt tất cả các mẫu trùng khớp trong văn bản.
- **Quản lý Danh sách Prompt Mặc định:** Dễ dàng gọi các prompt/văn bản mẫu đã được cấu hình sẵn thông qua thư mục `prompts/`.
- **Phím Tắt Điều Hướng Nhanh (Keyboard Shortcuts):** Hỗ trợ toàn bộ thao tác bằng bàn phím để tăng tốc độ làm việc.
- **Lưu Ghi Chú Nhanh:** Một vùng Textarea phía trên cùng có khả năng tự động lưu trữ (auto-save) vào `chrome.storage.local`, giúp bạn không bao giờ mất ý tưởng đang gõ dở khi vô tình đóng popup.
- **Sao Chép Khay Nhớ Tạm:** Một nút "Copy kết quả" để bạn lấy toàn bộ văn bản đã được xử lý thay thế.

---

## 🚀 Hướng dẫn Cài đặt (Dành cho Developer)

1. Mở trình duyệt Chrome hoặc Edge và truy cập vào trang quản lý tiện ích:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. Bật chế độ **Developer mode** (Chế độ dành cho nhà phát triển).
3. Nhấp vào nút **Load unpacked** (Tiện ích đã giải nén).
4. Điều hướng tới và chọn thư mục chứa dự án này (`template_replacer`).
5. Tiện ích sẽ xuất hiện ngay trên thanh công cụ của trình duyệt. Bạn nên "Ghim" (Pin) tiện ích ra thanh công cụ để tiện bấm.

---

## ⌨️ Phím tắt tiện ích

Khi mở popup của tiện ích, bạn có thể thực hiện các thao tác siêu tốc:
- **`Alt + L`**: Mở / Đóng nhanh danh sách Prompt.
- **`Mũi tên Lên (↑)` / `Mũi tên Xuống (↓)`**: Di chuyển (navigate) vệt sáng lựa chọn qua lại giữa các prompt. Danh sách sẽ tự động cuộn (scroll) và vòng lặp quay trở lại từ đầu/cuối tùy thuộc vào vị trí của bạn.
- **`Enter`**: Xác nhận chọn Prompt hiện tại đang được bôi sáng, tự động điền prompt đó ra vùng thẻ văn bản và phân tích mẫu ngay lập tức.
- **`Esc`**: Tắt bảng danh sách Prompt tiện lợi.

---

## 💡 Hướng dẫn Sử dụng (Quy trình)

1. **Nhập / Chọn văn bản đầu vào:** Bạn có thể tự gõ văn bản chứa mẫu biến (ví dụ: `Xin chào {{ tên_khach_hang }}, chúc bạn ngày mới vui vẻ!`) hoặc nhấn `Alt + L` để gọi ra danh sách Prompt mẫu có sẵn rồi Enter để chọn.
2. **Điền giá trị thay thế:** Extension tự động thấy bạn có chữ `{{ tên_khach_hang }}` và tạo ngay một thẻ Input để bạn điền giá trị. Chỉ cần điền chữ "Anh Tuấn" vào thẻ đó.
3. **Copy:** Nhìn xuống ô "Kết quả", văn bản hoàn chỉnh đã hiện ra. Bạn chỉ cần nhấn nút "Copy kết quả" hoặc nhấn `Enter` (khi đang ở ô điền biến cuối cùng) để sao chép thẳng vào Clipboard của máy tính.
4. **Viết nháp:** Ô văn bản trống trên cùng cho phép ghi gạch đầu dòng nháp, tiện ích sẽ tự lưu nội dung của bạn.

---

## 🛠 Cách thêm Prompt mẫu

Extension tải dữ liệu danh sách Prompt trực tiếp từ các file `1.txt`, `2.txt`,... bên trong thư mục `/prompts/`. Nếu muốn thêm bài mẫu, hãy tải hoặc tạo file `.txt` có số ID nối tiếp (`3.txt`, `4.txt`) trong thư mục này.

Định dạng (Syntax) chuẩn bên trong file txt như sau:

```text
@@[1]<<<
description:<< Tiêu đề của Prompt sẽ hiển thị trên giao diện >>
value:<< 
Bấm Enter xuống dòng thoải mái.
Chào anh {{ tên khách }}, em đến từ... 
>>
>>>
```
*Lưu ý: Tiện ích hỗ trợ tạo nhiều prompt bên trong cùng 1 file, cấu trúc phân cách bởi dấu `>>>`.*

---

## 💻 Biên dịch mã nguồn (Build)

Dự án này sử dụng TypeScript cho phần logic linh hoạt. Nếu bạn thực hiện bất kỳ sửa đổi nào vào file `popup.ts`:

1. Đảm bảo bạn đã cài đặt Node.js và `npm`.
2. Mở Terminal / Command Prompt tại thư mục dự án và chạy `npm install` sơ khởi (nếu cần thiết cho các file `package.json` setup).
3. Chạy file môi trường Windows **`build.cmd`** bằng cách Double Click, hoặc chạy lệnh command line:
   ```bash
   npx tsc
   ```
4. Code TypeScript sẽ tự động được biên dịch sang file `popup.js` an toàn dựa trên chuẩn ES hiện đại và sẵn sàng để extension chạy. Load lại Extension là xong!
