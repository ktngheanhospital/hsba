# THEO DÕI HSBA - HỆ THỐNG THEO DÕI & RÀ SOÁT HỒ SƠ BỆNH ÁN (TÍCH HỢP ZALO)

Ứng dụng web chuyên nghiệp hỗ trợ rà soát hồ sơ bệnh án, báo cáo lỗi sai sót y lệnh, **tự động gửi tin nhắn nhắc nhở qua Zalo 2 giờ/lần cho đến khi hoàn thành**, phân quyền theo 2 nhóm chuyên biệt và theo dõi chốt hồ sơ bệnh án ra viện. Tương thích tối ưu trên cả **Máy tính (PC/Laptop)** và **Điện thoại di động (Mobile/Tablet)**.

---

## 🌟 Tính năng nổi bật

### 1. Nhắn tin Zalo Tự động & Nhắc nhở 2 giờ / lần
- **Gửi tin nhắn cảnh báo tức thì**: Khi Tổ rà soát báo cáo lỗi mới cho nhân viên y tế, hệ thống tự động gửi tin nhắn Zalo đầu tiên đến Số điện thoại của người đó.
- **Tự động nhắc lại mỗi 2 giờ**: Hệ thống chạy ngầm tự động quét và tiếp tục gửi tin nhắn nhắc nhở định kỳ đúng 2 giờ một lần nếu lỗi vẫn chưa xử lý (`CHƯA SỬA`, `ĐÃ XEM - ĐANG SỬA`, `YÊU CẦU KIỂM TRA LẠI`).
- **Tự động dừng khi hoàn thành**: Khi trạng thái lỗi được chuyển thành `ĐÃ XONG` hoặc `ĐÃ SỬA`, chu kỳ nhắc tin Zalo sẽ dừng ngay lập tức.
- **Mở Chat Zalo trực tiếp**: Nút `💬 Zalo` tạo liên kết `https://zalo.me/{SĐT}` mở cửa sổ chat trực tiếp trên Zalo App hoặc Zalo PC/Web.
- **Tùy chỉnh & Nhật ký**: Tùy chỉnh mẫu tin nhắn, chu kỳ gửi và theo dõi toàn bộ lịch sử gửi tin trong mục Cài đặt.

### 2. Phân quyền Chỉnh sửa theo 2 Nhóm (Permissions Matrix)
- **Nhóm 1 (Tổ Rà Soát HSBA)**: Chỉ được phép nhập và chỉnh sửa **8 cột thông tin rà soát lỗi ban đầu** (*Mã KCB, Tên BN, Khoa/Phòng, Người chỉ định, Ngày vào khoa, Ngày kiểm hồ sơ, Thời gian YL, Mức độ cảnh báo, Diễn giải lỗi*). Các cột tiến độ và giải trình sẽ ở chế độ khóa chỉ đọc.
- **Nhóm 2 (Khoa Phòng / Người Sửa Lỗi / Bác sĩ)**: Chỉ được phép cập nhật **các cột tiến độ và giải trình** (*Trạng thái kiểm duyệt, Trạng thái lỗi [Đang sửa / Đã xong / Chuyển viện], Ý kiến giải trình*). Các cột rà soát lỗi ban đầu được khóa bảo vệ.
- **Quản trị viên (Admin)**: Toàn quyền chỉnh sửa tất cả các cột.
- **Role Switcher** trực quan trên thanh Header để chuyển đổi vai trò kiểm tra tức thì.

### 3. Giao diện Gọn gàng - Không cần thanh cuộn ngang trên PC
- Bố cục bảng thông minh (Smart Stacked Layout) tối ưu hiển thị đầy đủ thông tin mà không bị tràn ngang màn hình.
- Bộ lọc tìm kiếm thông minh dạng **Gõ nhập liệu kết hợp Datalist gợi ý** (hỗ trợ tìm kiếm không dấu tiếng Việt).

### 4. Chốt Hồ sơ Bệnh án Ra viện
- Gom nhóm theo từng bệnh nhân / Mã KCB.
- Tự động kiểm tra điều kiện: Chỉ cho phép **Chốt ra viện** khi tất cả lỗi của hồ sơ đã được xử lý xong (`ĐÃ XONG` hoặc `ĐÃ SỬA`).

### 5. Dashboard & Tiện ích Xuất dữ liệu
- Thống kê thời gian thực: Tổng lỗi, Chưa sửa, Đang sửa, Cần kiểm tra lại, Đã xong, Đã chốt ra viện.
- Xuất dữ liệu ra file **Excel (CSV UTF-8)** chuẩn font tiếng Việt có dấu.
- In **Phiếu phản hồi rà soát hồ sơ bệnh án** chuẩn biểu mẫu y tế.

---

## 🚀 Hướng dẫn Chạy Ứng dụng

Khởi chạy web server với Python:
```bash
cd "C:\Users\Admin\.gemini\antigravity\scratch\theo-doi-hsba"
python -m http.server 4173
```
Sau đó truy cập vào địa chỉ: **http://localhost:4173** (hoặc mở trực tiếp file `index.html` trong bất kỳ trình duyệt nào).

---

## 📁 Cấu trúc Thư mục Nguồn

```
theo-doi-hsba/
├── index.html          # Giao diện HTML5 semantic, Role Switcher, Bộ lọc gợi ý, Zalo Tab
├── css/
│   └── style.css       # Design System Medical Palette, Fit-to-screen Table, Zalo UI styles
├── js/
│   ├── app.js          # Controller điều khiển chính (Routing, Filter, Table, Dashboard, Discharge)
│   ├── data.js         # Hằng số, Phân quyền Nhóm 1/2, dữ liệu mẫu chuẩn y tế
│   ├── modal.js        # Hộp thoại Thêm/Sửa lỗi, Cập nhật nhanh, Xem & Gửi tin Zalo
│   ├── storage.js      # Service lưu trữ LocalStorage, phân quyền, sao lưu JSON
│   ├── utils.js        # Hàm tiện ích định dạng ngày giờ VN, search không dấu, xuất Excel, in phiếu
│   └── zaloService.js  # Service quản lý tin nhắn Zalo, auto-scheduler nhắc 2h/lần, chat URL
└── README.md           # Tài liệu hướng dẫn sử dụng & triển khai
```
