# Media Studio Cookie Exporter

Extension Chrome/Edge nhỏ để export cookies của Douyin/Bilibili ra file Netscape `cookies.txt`, dùng cho `yt-dlp` và lệnh `mda dld`.

## Khi Nào Cần Dùng

Douyin thường báo lỗi kiểu:

```text
Fresh cookies (not necessarily logged in) are needed
Failed to decrypt with DPAPI
Could not copy Chrome cookie database
```

Các lỗi này xảy ra khi `yt-dlp --cookies-from-browser` không đọc hoặc không giải mã được cookie từ Chrome/Edge trên Windows. Extension này né đường đó: browser tự cấp cookie qua extension API, rồi extension xuất ra file `.txt`.

## Extension Làm Gì

- Đọc cookies bằng `chrome.cookies`.
- Export cả cookie thường lẫn cookie `HttpOnly` mà `document.cookie` không đọc được.
- Ghi file theo định dạng Netscape cookies.txt tương thích `yt-dlp`.
- Tải file qua cơ chế Downloads của browser.
- Không tự ghi thẳng vào `D:\...` vì extension bị sandbox, không có quyền ghi tùy ý vào hệ thống file.

## Cài Đặt Dạng Unpacked

1. Mở Chrome hoặc Edge.
2. Vào trang quản lý extension:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Bật `Developer mode`.
4. Chọn `Load unpacked`.
5. Chọn folder:

```text
D:\D-Documents\TOOLs\media-studio\src\for-outside\export-cookies
```

Sau khi cài, bạn sẽ thấy extension tên `Media Studio Cookie Exporter`.

## Cách Export Cookie Douyin

1. Mở Douyin trong cùng browser đã cài extension.
2. Đăng nhập nếu cần.
3. Mở hoặc refresh video Douyin, ví dụ:

```text
https://www.douyin.com/video/7403202163897371938
```

4. Bấm icon extension.
5. Chọn preset `Douyin`.
6. Giữ `Hỏi vị trí lưu file` nếu muốn tự chọn nơi lưu.
7. Bấm `Export cookies.txt`.
8. Lưu file, ví dụ:

```text
D:\cookies\douyin.txt
```

## Dùng Với mda

Sau khi có file cookie:

```bat
mda dld douyin "https://v.douyin.com/dZXuIXsmREk" --cookies "D:\cookies\douyin.txt"
```

Có thể kết hợp các option khác:

```bat
mda dld douyin "https://v.douyin.com/dZXuIXsmREk" good-vid --cookies "D:\cookies\douyin.txt" --threads 8
```

Tải audio:

```bat
mda dld douyin "https://v.douyin.com/dZXuIXsmREk" audio --cookies "D:\cookies\douyin.txt" --format mp3
```

## Preset Có Sẵn

### Douyin

Export cookies cho:

```text
douyin.com
iesdouyin.com
amemv.com
snssdk.com
```

### Bilibili

Export cookies cho:

```text
bilibili.com
```

### Current Tab Domain

Export cookies cho domain của tab hiện tại.

### Custom Domains

Nhập một hoặc nhiều domain, mỗi dòng một domain hoặc phân cách bằng dấu phẩy:

```text
douyin.com
iesdouyin.com
```

## Nơi File Được Lưu

Extension dùng API Downloads của browser:

- Nếu bật `Hỏi vị trí lưu file`, browser sẽ hỏi nơi lưu.
- Nếu tắt, file sẽ nằm trong thư mục Downloads mặc định.

Extension không thể tự lưu thẳng vào `D:\cookies\douyin.txt` nếu browser không hỏi quyền chọn file. Đây là giới hạn bảo mật của Chrome/Edge.

## Bảo Mật

File cookies có thể cấp quyền truy cập phiên đăng nhập của bạn.

- Không gửi file cookies cho người khác.
- Không upload lên Git/GitHub/cloud.
- Nên lưu ở thư mục riêng như `D:\cookies`.
- Xóa file khi không cần nữa.
- Nếu nghi ngờ lộ cookie, hãy logout Douyin hoặc đổi mật khẩu để vô hiệu hóa session.

## Khi Export Xong Nhưng mda Vẫn Fail

Thử các bước:

1. Mở Douyin trong browser, đảm bảo xem được video.
2. Refresh trang video.
3. Export cookies lại.
4. Chạy lại lệnh `mda` với file cookies mới.
5. Cập nhật `yt-dlp`:

```bat
python -m pip install -U yt-dlp
```

Nếu link rút gọn lỗi, thử link đầy đủ:

```text
https://www.douyin.com/video/7403202163897371938
```

## Ghi Chú Kỹ Thuật

File xuất ra theo format Netscape:

```text
domain	include_subdomains	path	secure	expiration	name	value
```

Cookie `HttpOnly` được ghi bằng prefix:

```text
#HttpOnly_.douyin.com
```

Đây là format `yt-dlp` đọc được qua flag:

```bat
--cookies "D:\cookies\douyin.txt"
```
