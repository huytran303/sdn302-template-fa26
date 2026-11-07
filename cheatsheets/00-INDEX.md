# Cheatsheets: mục lục

Stack: **Node >= 22.11, Express 5.3, Mongoose 9.11, CommonJS**. Dependency có sẵn: chỉ `express mongoose dotenv morgan`.
Setup đầu giờ thi (import JSON, sinh `models.js`, gọi `connectDb`): xem [`../../README.md`](../../README.md).

## Đề hỏi gì → mở file nào

| Đề yêu cầu... | File | Mục |
|---|---|---|
| Route, lấy params/query/body, status code, xử lý lỗi | [01-Express](01-Express.md) | 1-5 |
| Schema, validate, `_id` kiểu String, ref, tên collection | [02-Model](02-Model.md) | 1-6 |
| List / chi tiết / thêm / sửa / xóa | [03-Query](03-Query.md) | Tra nhanh |
| Lọc, tìm kiếm, sắp xếp, phân trang | [03-Query](03-Query.md) | 1-4 |
| Cập nhật mảng (`$push`, `$pull`, mảng nhúng) | [03-Query](03-Query.md) | 5 |
| Join để hiển thị (`populate`) | [03-Query](03-Query.md) | 6 |
| Báo cáo: đếm / tổng / trung bình / nhóm / join + tính toán | [04-Aggregate](04-Aggregate.md) | toàn bộ |
| Biến đổi kết quả bằng JS (`map`, `reduce`, nhóm) | [05-JS](05-JS.md) | 1-3 |
| Format số / tiền / ngày / phần trăm / `90.0` | [05-JS](05-JS.md) | 4 |
| Validate input, format lỗi `ValidationError` | [05-JS](05-JS.md) | 5 |
| Đăng nhập / token (chỉ khi đề cho sẵn `jsonwebtoken`) | [06-JWT](06-JWT.md) | toàn bộ |

## Quy tắc chọn cách làm

- Chỉ cần **hiển thị** dữ liệu liên kết → `populate`. Cần **tính toán** trên nhiều collection → `aggregate` + `$lookup`.
- Lọc/sắp xếp/giới hạn trong **query**, không làm bằng JS. JS chỉ dùng để biến đổi kết quả query trả về.
- Không tìm thấy → **404**. Id sai / validate lỗi → **400**. Trùng khóa → **409**. Tạo mới → **201**.
- Mọi file đều theo khung: **Tra nhanh → Công thức (recipe) → Bẫy thường gặp**.

## 5 lỗi mất điểm nhiều nhất

1. `findByIdAndUpdate` thiếu `returnDocument: 'after'` → trả về document **cũ**.
2. `$match: { classId: req.params.id }` trong aggregate không khớp gì: aggregate **không** tự ép kiểu. Phải bọc `new mongoose.Types.ObjectId(id)`.
3. `$lookup.from` là tên **collection** (`"books"`), không phải tên model (`"Book"`).
4. `findById(...)` trả `null` khi không có: quên check 404 → trả `200 null`.
5. `const { a } = req.body` bị lỗi khi request không có body (Express 5): dùng `req.body ?? {}`.

