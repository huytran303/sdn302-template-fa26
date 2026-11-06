# 01 · Express 5: route, request, response, xử lý lỗi

Có sẵn: `server.js` đã có `express.json()`, `express.urlencoded()`, `morgan`. Model lấy từ 1 file duy nhất: `const { Book, Author } = require('./models');`

## Tra nhanh

| Cần | Code | Kiểu dữ liệu |
|---|---|---|
| Id trên path `/books/:id` | `req.params.id` | string |
| Query `?q=x&page=2` | `req.query.q` | string, thành **mảng** nếu key lặp (`?tag=a&tag=b`) |
| Body JSON | `req.body ?? {}` | giữ kiểu JSON; `undefined` khi không có body |
| Header | `req.get('Authorization')` | string hoặc `undefined` |
| Trả JSON | `res.status(200).json(data)` | |
| Không có nội dung | `res.sendStatus(204)` | |

| Status | Khi nào |
|---|---|
| 200 | Thành công (GET, PUT, DELETE có trả dữ liệu) |
| 201 | Tạo mới thành công (POST) |
| 400 | Input sai, id sai định dạng, `ValidationError`, `CastError` |
| 401 / 403 | Thiếu/sai token / không đủ quyền |
| 404 | Không tìm thấy document |
| 409 | Trùng khóa (`err.code === 11000`) |
| 500 | Lỗi khác |

## 1. Gắn vào `server.js` được cho sẵn

```js
const mongoose = require('mongoose');
const { connectDb } = require('./dal/database');
const { Book, Author } = require('./models');

// ...các route ở đây...

// 404 cho route không tồn tại: đặt SAU tất cả route
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler chung: đủ 4 tham số, luôn đặt cuối cùng
app.use((err, req, res, next) => {
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: err.message });
  if (err.code === 11000) return res.status(409).json({ error: 'Duplicate key', key: err.keyValue });
  res.status(err.status ?? 500).json({ error: err.message });
});

// trong async IIFE, trước app.listen:
await connectDb();
```

Express 5 tự chuyển lỗi (promise bị reject) từ handler `async` sang error handler: **không cần try/catch ở từng route**.
Chỉ dùng try/catch khi một route cụ thể cần status/thông báo lỗi khác.

## 2. Mẫu route

```js
app.get('/books', handler);              // danh sách
app.get('/books/stats', handler);        // path tĩnh phải đặt TRƯỚC '/books/:id'
app.get('/books/:id', handler);          // chi tiết
app.post('/books', handler);
app.put('/books/:id', handler);
app.delete('/books/:id', handler);
app.get('/authors/:id/books', handler);  // resource lồng nhau

// Router (chỉ khi đề yêu cầu tách file)
const router = express.Router();
router.get('/', handler);
app.use('/books', router);
```

Cú pháp path của Express 5: wildcard viết `'/*splat'` (không phải `'*'`), param tùy chọn viết `'/books{/:id}'` (không phải `'/:id?'`).

## 3. Đọc input an toàn

```js
// Id trên path: kiểm tra trước khi query nếu đề muốn trả 400/404 rõ ràng
if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
// (bỏ bước này nếu _id là String kiểu "B001")

// Query string: ép kiểu + giá trị mặc định + giới hạn
const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
const minPrice = req.query.minPrice !== undefined ? Number(req.query.minPrice) : undefined;
const active = req.query.active === 'true';            // boolean trong query là chuỗi
const from = req.query.from ? new Date(req.query.from) : undefined;
if (from && isNaN(from)) return res.status(400).json({ error: 'Invalid date' });

// Body: chặn undefined + chỉ lấy field cho phép
const { title, price, authorId } = req.body ?? {};
if (!title || price == null) return res.status(400).json({ error: 'title and price are required' });
```

`req.query` chỉ đọc được trong Express 5: muốn sửa thì copy ra trước (`const q = { ...req.query }`).

## 4. CRUD đầy đủ (bản chuẩn)

```js
app.get('/books', async (req, res) => {
  res.json(await Book.find().sort({ title: 1 }));
});

app.get('/books/:id', async (req, res) => {
  const book = await Book.findById(req.params.id);    // ObjectId sai -> CastError -> 400 qua handler
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json(book);
});

app.post('/books', async (req, res) => {
  const book = await Book.create(req.body ?? {});     // ValidationError -> 400, trùng -> 409
  res.status(201).json(book);
});

app.put('/books/:id', async (req, res) => {
  const book = await Book.findByIdAndUpdate(req.params.id, req.body ?? {}, {
    returnDocument: 'after',   // trả document SAU khi sửa (`new: true` cũ đã deprecated)
    runValidators: true,       // không có dòng này thì update bỏ qua validator của schema
  });
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json(book);
});

app.delete('/books/:id', async (req, res) => {
  const book = await Book.findByIdAndDelete(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json({ message: 'Deleted', book });
});
```

Dạng response: trả **đúng y** như đề mẫu (mảng trần hay `{ data: [...] }`, tên field, `_id` hay `id`).

## 5. Middleware

```js
// (req, res, next): hoặc trả response, hoặc gọi next()
const requireFields = (...fields) => (req, res, next) => {
  const body = req.body ?? {};
  const missing = fields.filter((f) => body[f] === undefined || body[f] === '');
  if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });
  next();
};

app.post('/books', requireFields('title', 'price'), handler);
```

## Bẫy thường gặp

- `cors`, `cookie-parser`, `bcryptjs`, `jsonwebtoken` **chưa được cài**: `require` chúng là server crash.
- Khai báo `/books/:id` trước `/books/stats` → `"stats"` bị coi là id → CastError.
- Quên `return` trước `res.status(404)...` → lỗi "Cannot set headers after they are sent".
- Giá trị `req.params` / `req.query` là chuỗi: `Number(...)` trước khi dùng `$gt` hoặc tính toán.
- `res.json(null)` trả `200 null`: luôn check `if (!doc)`.
