# 02 · Mongoose model (schema, validate, quan hệ)

Có sẵn: `gen-models.js` đã sinh `<exam>/models.js`. Dùng file này để **sửa / bổ sung** model đã sinh (thêm `required`, `enum`, `ref`...), hoặc tự viết model nếu script lỗi.

## Tra nhanh

| Cần | Option trong schema |
|---|---|
| Bắt buộc | `{ type: String, required: true }` hoặc `required: [true, 'Title is required']` |
| Khoảng số | `min: 0, max: 100` |
| Độ dài / pattern chuỗi | `minlength: 3, maxlength: 50, match: /^\S+@\S+$/` |
| Giá trị cho phép | `enum: ['ACTIVE', 'INACTIVE']` |
| Mặc định | `default: 0`, `default: Date.now` (không có `()`) |
| Chuẩn hóa | `trim: true, lowercase: true, uppercase: true` |
| Duy nhất | `unique: true` (là **index**, không phải validator → lỗi code 11000) |
| Tham chiếu | `{ type: mongoose.Schema.Types.ObjectId, ref: 'Author' }` |
| `_id` kiểu String | `_id: { type: String, required: true }` |
| createdAt/updatedAt | tham số 2: `{ timestamps: true }` |
| Ẩn `__v` | tham số 2: `{ versionKey: false }` |

## 1. Một file chứa mọi model (khớp template)

```js
// models.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const authorSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, unique: true, lowercase: true },
});

const bookSchema = new Schema({
  title: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['AVAILABLE', 'SOLD'], default: 'AVAILABLE' },
  author: { type: Schema.Types.ObjectId, ref: 'Author', required: true },
}, { timestamps: true });

// Tham số 3 = tên collection THẬT trong file JSON được import. Luôn truyền.
const Author = mongoose.model('Author', authorSchema, 'authors');
const Book = mongoose.model('Book', bookSchema, 'books');

module.exports = { Author, Book };
```

Không có tham số 3, Mongoose tự đổi tên model sang số nhiều (`Person` → `people`, `Workson` → `worksons`) và có thể đọc nhầm một collection **rỗng**.

## 2. `_id` kiểu String (mã kiểu `"B001"`)

```js
const bookSchema = new Schema({ _id: { type: String, required: true }, title: String });
// ref trỏ tới nó cũng phải cùng kiểu:
author: { type: String, ref: 'Author' }

await Book.create({ _id: 'B001', title: 'X' });   // phải tự truyền _id
await Book.findById('B001');                      // không cần check ObjectId
```

Nhìn file JSON: `"_id": { "$oid": "..." }` → ObjectId; `"_id": "B001"` → String; `"_id": 1` → Number.

## 3. Dữ liệu nhúng

```js
// Object lồng: không có _id riêng
address: { street: String, city: String },

// Mảng subdocument: mỗi phần tử có _id riêng (tắt bằng { _id: false })
const enrollmentSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: 'Student' },
  status: { type: String, enum: ['ENROLLED', 'DROPPED'], default: 'ENROLLED' },
}, { _id: false });
enrollments: [enrollmentSchema],

// Mảng giá trị đơn
tags: [String],
```

## 4. Quan hệ

| Quan hệ | Đặt ref ở đâu |
|---|---|
| 1-N (tác giả có nhiều sách) | `Book.author: ObjectId ref 'Author'` |
| N-N (khóa học ↔ sinh viên) | `Course.students: [{ type: ObjectId, ref: 'Student' }]` hoặc collection trung gian |
| N-N có thêm dữ liệu (giờ, điểm) | Collection trung gian: `Workson { empId, proId, workHours }` |
| Cây | `Category.parent: ObjectId ref 'Category'` |

`ref` + `required` **không** kiểm tra document được tham chiếu có tồn tại hay không. Đề yêu cầu thì tự kiểm tra:

```js
if (!(await Author.exists({ _id: authorId }))) return res.status(404).json({ error: 'Author not found' });
```

## 5. Validate tùy chỉnh

```js
// Ngày trong năm 2024 (tính trọn ngày 31/12): dùng cận trên KHÔNG bao gồm
reservationDate: {
  type: Date,
  required: true,
  validate: {
    validator: (v) => v >= new Date('2024-01-01T00:00:00Z') && v < new Date('2025-01-01T00:00:00Z'),
    message: 'Reservation date must be in 2024',
  },
},

// So sánh 2 field: dùng function (this = document; chỉ chạy khi save/create)
endDate: {
  type: Date,
  validate: { validator: function (v) { return !this.startDate || v >= this.startDate; }, message: 'endDate < startDate' },
},
```

Validator chạy khi `create()` / `save()`. Với `findByIdAndUpdate` / `updateOne` thì **chỉ** chạy khi có `runValidators: true`, và lúc đó `this` không phải document.

## 6. Hook và virtual (ít gặp trong đề)

```js
// Mongoose 9: pre hook là async function, KHÔNG có tham số `next`
bookSchema.pre('save', async function () {
  this.title = this.title.trim();
});

// Virtual: field tính toán, không lưu vào DB
bookSchema.virtual('priceWithTax').get(function () { return this.price * 1.1; });
bookSchema.set('toJSON', { virtuals: true });   // để res.json() có virtual
```

## Bẫy thường gặp

- Tên model khác tên collection: `$lookup.from` và tham số 3 của `mongoose.model` dùng tên **collection**.
- `unique: true` không có tác dụng nếu index chưa được tạo (dữ liệu import đã bị trùng). Cần thì tự kiểm tra trùng.
- `default` không áp dụng khi giá trị được truyền là `null`.
- Field không có trong schema bị **bỏ đi** khi lưu (strict mode). Field nào cần ghi thì phải khai báo.
