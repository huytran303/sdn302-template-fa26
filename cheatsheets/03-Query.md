# 03 · Query Mongoose (CRUD, lọc, phân trang, cập nhật mảng, populate)

Mọi ví dụ đều là **Mongoose** (`await Model.xxx()`), không phải mongosh (`db.books.find()`).
Mọi kết quả `→` bên dưới đã chạy thật trên bộ data mẫu này (id viết tắt `b1`... cho dễ đọc; đề thật là ObjectId).

## Data mẫu (dùng cho mục 1-5)

```js
// collection books
{ _id: 'b1', title: 'Mat Biec',       price: 100, genre: 'Novel', tags: ['sale', 'new'], stock: 5,  sold: 8 }
{ _id: 'b2', title: 'Hoa Vang',       price: 80,  genre: 'Novel', tags: ['new'],         stock: 10, sold: 3 }
{ _id: 'b3', title: 'Norwegian Wood', price: 200, genre: 'Novel', tags: [],              stock: 2,  sold: 2, discount: 10 }
{ _id: 'b4', title: 'Clean Code',     price: 350, genre: 'Tech',  tags: ['sale'],        stock: 0,  sold: 12 }
```

## Tra nhanh

| Cần | Gọi | Kết quả với data mẫu |
|---|---|---|
| Tất cả / có điều kiện | `Book.find({ genre: 'Tech' })` | `[ {b4...} ]` (không khớp → `[]`) |
| Một document | `Book.findById('b1')` / `Book.findOne({ genre: 'Novel' })` | `{b1...}` (không có → `null`) |
| Có tồn tại không | `Book.exists({ title: 'Mat Biec' })` | `{ _id: 'b1' }` (không có → `null`) |
| Đếm | `Book.countDocuments({ genre: 'Novel' })` | `3` |
| Các giá trị khác nhau | `Book.distinct('genre')` | `['Novel', 'Tech']` |
| Thêm | `Book.create(obj)` / `Book.insertMany(arr)` | doc vừa tạo (có `_id`) / mảng doc |
| Sửa + lấy doc | `Book.findByIdAndUpdate(id, upd, { returnDocument: 'after', runValidators: true })` | doc **sau** khi sửa, hoặc `null` |
| Sửa, chỉ cần số lượng | `Book.updateOne(f, upd)` / `updateMany` | `{ matchedCount: 1, modifiedCount: 1, ... }` |
| Xóa + lấy doc | `Book.findByIdAndDelete(id)` | doc vừa xóa, hoặc `null` |
| Xóa, chỉ cần số lượng | `Book.deleteOne(f)` / `deleteMany(f)` | `{ deletedCount: 1 }` |

Nối tiếp sau `find`: `.select()` `.sort()` `.skip()` `.limit()` `.populate()` `.lean()`.

## 1. Toán tử lọc: viết filter nào → ra document nào

`await Book.find(<filter>)` với data mẫu:

| Filter | Đọc là | Khớp |
|---|---|---|
| `{ price: 100 }` | price = 100 | b1 |
| `{ price: { $gt: 80, $lte: 200 } }` | 80 < price ≤ 200 (`$gt $gte $lt $lte`) | b1, b3 |
| `{ genre: { $ne: 'Novel' } }` | genre ≠ Novel | b4 |
| `{ genre: { $in: ['Tech', 'Comic'] } }` | genre là 1 trong các giá trị (`$nin` = ngược lại) | b4 |
| `{ $or: [{ genre: 'Tech' }, { price: { $lt: 90 } }] }` | Tech **hoặc** rẻ hơn 90 | b2, b4 |
| `{ genre: 'Novel', price: { $gte: 100 } }` | nhiều key = **và** (không cần `$and`) | b1, b3 |
| `{ discount: { $exists: true } }` | có field discount | b3 |
| `{ tags: 'sale' }` | mảng tags **chứa** 'sale' | b1, b4 |
| `{ tags: { $all: ['sale', 'new'] } }` | chứa **cả hai** | b1 |
| `{ tags: { $size: 0 } }` | mảng rỗng | b3 |
| `{ $expr: { $gt: ['$sold', '$stock'] } }` | so 2 field: sold > stock | b1, b4 |
| `{ title: { $regex: 'co', $options: 'i' } }` | title chứa "co", không phân biệt hoa thường | b4 |
| `{ 'address.city': 'HN' }` | field lồng: đường dẫn có dấu chấm, phải để trong nháy | — |

`$and` chỉ cần khi 2 điều kiện cùng key không gộp được, vd 2 cái `$or`: `{ $and: [{ $or: [...] }, { $or: [...] }] }`.

Lọc theo khoảng ngày (trọn 1 ngày 01/05/2024):

```js
{ createdAt: { $gte: new Date('2024-05-01T00:00:00Z'), $lt: new Date('2024-05-02T00:00:00Z') } }
// 2024-05-01T23:59:59Z → khớp;  2024-05-02T00:00:00Z → không khớp
```

## 2. Tìm theo từ khóa (không phân biệt hoa thường, an toàn)

```js
// GET /books?q=co&minPrice=100
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');  // tránh ký tự đặc biệt của regex
const filter = {};
if (req.query.q) filter.title = { $regex: escape(req.query.q), $options: 'i' };
if (req.query.minPrice) filter.price = { $gte: Number(req.query.minPrice) };
// filter = { title: { $regex: 'co', $options: 'i' }, price: { $gte: 100 } }
const books = await Book.find(filter);   // → [ {b4 Clean Code} ]
```

## 3. Chọn field, sắp xếp

```js
await Book.find().select('title price -_id').sort({ price: -1 }).limit(2);
// → [ { title: 'Clean Code', price: 350 }, { title: 'Norwegian Wood', price: 200 } ]

Book.find().select('-__v')                       // bỏ 1 field, giữ lại tất cả field khác
Book.find({}, { title: 1, price: 1 })            // dạng object: → [{ _id: 'b1', title, price }, ...] (_id mặc định có)
Book.find().sort({ genre: 1, price: -1 })        // genre A→Z; cùng genre thì price giảm dần
                                                 // → b3(Novel 200), b1(Novel 100), b2(Novel 80), b4(Tech)
```

## 4. Phân trang kèm tổng số

```js
// GET /books?page=2&limit=3
const page = Math.max(1, parseInt(req.query.page, 10) || 1);
const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
const [items, total] = await Promise.all([
  Book.find(filter).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit),  // bắt buộc sort ổn định
  Book.countDocuments(filter),
]);
res.json({ page, limit, total, totalPages: Math.ceil(total / limit), items });
// → { page: 2, limit: 3, total: 4, totalPages: 2, items: [ {b4...} ] }   (trang 1 là b1, b2, b3)
```

## 5. Toán tử cập nhật và mảng

`await Book.updateOne({ _id: 'b1' }, <update>)`, trước mỗi lệnh b1 là:
`{ _id: 'b1', price: 100, stock: 5, tags: ['sale', 'new'], discount: 5 }`

| Update | b1 sau khi chạy |
|---|---|
| `{ $set: { price: 120 } }` | `price: 120` |
| `{ $inc: { stock: -1 } }` | `stock: 4` (cộng/trừ số) |
| `{ $unset: { discount: '' } }` | field `discount` biến mất |
| `{ $push: { tags: 'new' } }` | `tags: ['sale', 'new', 'new']` (cho phép trùng) |
| `{ $addToSet: { tags: 'new' } }` | `tags: ['sale', 'new']` (đã có → không đổi, `modifiedCount: 0`) |
| `{ $addToSet: { tags: 'hot' } }` | `tags: ['sale', 'new', 'hot']` |
| `{ $pull: { tags: 'sale' } }` | `tags: ['new']` |

### Mảng subdocument

Trước mỗi lệnh:

```js
{ _id: 'c1', name: 'SDN302', status: 'OPEN',
  enrollments: [ { student: 's1', status: 'ENROLLED' }, { student: 's2', status: 'ENROLLED' } ] }
```

```js
// Thêm phần tử
await Class.updateOne({ _id: 'c1' }, { $push: { enrollments: { student: 's3', status: 'ENROLLED' } } });
// → enrollments: [ {s1 ENROLLED}, {s2 ENROLLED}, {s3 ENROLLED} ]

// Xóa phần tử khớp
await Class.updateOne({ _id: 'c1' }, { $pull: { enrollments: { student: 's1' } } });
// → enrollments: [ {s2 ENROLLED} ]

// Sửa ĐÚNG phần tử khớp: filter chỉ ra phần tử nào, `$` = vị trí của phần tử đó
await Class.updateOne(
  { _id: 'c1', 'enrollments.student': 's2' },
  { $set: { 'enrollments.$.status': 'DROPPED' } },
);
// → enrollments: [ {s1 ENROLLED}, {s2 DROPPED} ]

// Tìm: CÙNG MỘT phần tử phải khớp 2+ điều kiện
await Class.find({ enrollments: { $elemMatch: { student: 's2', status: 'ENROLLED' } } });  // → [c1]
// Khác với { 'enrollments.student': 's2', 'enrollments.status': 'DROPPED' }:
// dạng này mỗi điều kiện có thể khớp phần tử KHÁC NHAU

// Upsert: không có thì thêm mới, có rồi thì sửa
await Attendance.findOneAndUpdate(
  { studentId: 's9', date: '2024-05-01' },
  { $set: { status: 'PRESENT' } },
  { upsert: true, returnDocument: 'after', runValidators: true },
);
// lần 1 (chưa có) → tạo mới { _id: ..., studentId: 's9', date: '2024-05-01', status: 'PRESENT' }
// lần 2 với ABSENT → sửa chính doc đó (cùng _id), status: 'ABSENT'
```

Nghiệp vụ "không được trùng trong mảng" → kiểm tra trước, hoặc dùng `$addToSet` / điều kiện chặn ngay trong filter:

```js
const r = await Class.updateOne(
  { _id: 'c1', status: { $ne: 'CLOSED' }, 'enrollments.student': { $ne: 's1' } },
  { $push: { enrollments: { student: 's1' } } },
);
// s1 đã có trong c1 → filter không khớp → r = { matchedCount: 0, modifiedCount: 0 }, không push
if (r.matchedCount === 0) return res.status(400).json({ error: 'Class closed, missing, or already enrolled' });
```

Lấy về - sửa - save (khi logic viết bằng JS dễ hơn; có chạy validator và hook):

```js
const cls = await Class.findById(classId);
if (!cls) return res.status(404).json({ error: 'Class not found' });
cls.enrollments.push({ student: sid });
await cls.save();
```

## 6. Populate (join để hiển thị)

Model dùng cho cả mục này:

```
countries  { _id, name }
authors    { _id, name, country -> Country }
categories { _id, name }
books      { _id, title, price, author -> Author, categories: [-> Category] }
orders     { _id, customer, items: [{ book -> Book, qty }] }
```

| Option | Ý nghĩa |
|---|---|
| `path` | field chứa ref (tên field, **không** phải tên model) |
| `select` | field lấy ở tầng đó (`'name -_id'`) |
| `populate` | populate tiếp tầng bên trong: object (1 nhánh) hoặc mảng (nhiều nhánh) |
| `match` | điều kiện cho document được join (không khớp → `null`) |
| `options: { sort }` / `perDocumentLimit` | sắp xếp / giới hạn mảng ref theo từng document cha |

### 6.1. Một tầng

```js
await Book.find().populate('author');                         // lấy cả author
await Book.find().populate('author', 'name -_id');            // chỉ lấy vài field
await Book.find().populate('categories', 'name');             // mảng ref: populate từng phần tử
await Order.findById(id).populate('items.book', 'title price'); // ref nằm trong mảng subdocument

// Nhiều ref cùng tầng: truyền mảng (hoặc nối .populate().populate())
await Book.find().select('title author categories -_id').populate([
  { path: 'author', select: 'name -_id' },
  { path: 'categories', select: 'name -_id' },
]);
// [{ "title": "Mat Biec", "author": { "name": "Nguyen Nhat Anh" },
//    "categories": [{ "name": "Novel" }, { "name": "Kids" }] }, ...]
```

### 6.2. Hai tầng: Book → author → country

```js
const book = await Book.findById(id).select('title author').populate({
  path: 'author',                       // tầng 1
  select: 'name country -_id',
  populate: { path: 'country', select: 'name -_id' },   // tầng 2
});
```

```json
{ "_id": "6aed...", "title": "Mat Biec",
  "author": { "name": "Nguyen Nhat Anh", "country": { "name": "Vietnam" } } }
```

### 6.3. Ba tầng: Order → items.book → author → country

```js
const order = await Order.findById(id).select('-__v').populate({
  path: 'items.book',
  select: 'title price author -_id',
  populate: {
    path: 'author',
    select: 'name country -_id',
    populate: { path: 'country', select: 'name -_id' },
  },
});
```

```json
{ "_id": "...", "customer": "An",
  "items": [
    { "book": { "title": "Mat Biec", "price": 100,
                "author": { "name": "Nguyen Nhat Anh", "country": { "name": "Vietnam" } } }, "qty": 2 },
    { "book": { "title": "Norwegian Wood", "price": 200,
                "author": { "name": "Murakami", "country": { "name": "Japan" } } }, "qty": 1 } ] }
```

Mẹo viết: mỗi tầng là một object `{ path, select, populate }`. Viết từ ngoài vào trong, mỗi tầng thụt vào một cấp.

### 6.4. Nhiều nhánh ở tầng trong

```js
await Order.findById(id).populate({
  path: 'items.book',
  select: 'title author categories -_id',
  populate: [                                   // mảng = nhiều nhánh cùng tầng
    { path: 'author', select: 'name -_id' },
    { path: 'categories', select: 'name -_id' },
  ],
});
// items[0].book = { "title": "Mat Biec", "author": { "name": "..." }, "categories": [{ "name": "Novel" }, { "name": "Kids" }] }
```

### 6.5. Lọc theo field ở tầng sâu

`match` **không** loại document cha: document không khớp chỉ bị gán `null`. Phải lọc lại bằng JS:

```js
// Sách có tác giả người Nhật
const all = await Book.find().select('title author -_id').populate({
  path: 'author',
  select: 'name country -_id',
  populate: { path: 'country', match: { name: 'Japan' }, select: 'name -_id' },
}).lean();
const result = all.filter((b) => b.author?.country);   // bỏ những sách có country = null
```

Dữ liệu lớn, hoặc cần sắp xếp/phân trang **theo** field bảng join → dùng `$lookup` ([04-Aggregate](04-Aggregate.md) "Nối 3 collection").

### 6.6. Populate ngược (cha → các con) bằng virtual

Author không lưu danh sách sách, nhưng vẫn populate được nhờ virtual:

```js
// models.js: khai báo TRƯỚC khi gọi mongoose.model('Author', ...)
authorSchema.virtual('books', { ref: 'Book', localField: '_id', foreignField: 'author' });
authorSchema.set('toJSON', { virtuals: true });   // để res.json() có field books

const author = await Author.findById(id).select('name').populate({ path: 'books', select: 'title price -_id' });
// { "_id": "...", "name": "Nguyen Nhat Anh", "books": [{ "title": "Mat Biec", "price": 100, "author": "..." }], "id": "..." }
```

Không muốn sửa model thì query 2 lần là đủ:

```js
const author = await Author.findById(id).lean();
if (!author) return res.status(404).json({ error: 'Author not found' });
const books = await Book.find({ author: id }).select('title price');
res.json({ ...author, books });
```

### Bẫy populate

- `populate('author.country')` (chuỗi có dấu chấm) **không** populate tầng 2: không báo lỗi, `author` vẫn chỉ là id. Nhiều tầng phải dùng object lồng `{ path, populate }`.
- `ref` là tên **model** (`'Author'`), không phải tên collection. Model chưa được khai báo → `MissingSchemaError`.
- Document được tham chiếu không tồn tại → ref đơn thành `null`, phần tử trong mảng ref bị bỏ đi.
- `select` ở tầng cha quên field ref vẫn chạy: Mongoose 9 tự thêm field đang populate vào select.
- `.lean()` vẫn dùng chung được với populate (kết quả là object thuần).

## Bẫy thường gặp

- `new: true` / `returnNewDocument` → deprecated / bị bỏ qua. Dùng `returnDocument: 'after'`.
- `findByIdAndUpdate(id, req.body)` có field không nằm trong schema → bị bỏ đi, không báo lỗi.
- `findById('abc')` khi `_id` là ObjectId → CastError (→ 400 qua error handler), không phải `null`.
- `.lean()` trả object thuần: nhanh hơn, không `.save()` được, không có virtual/getter.
- API đã bị xóa: callback, `remove()`, `findByIdAndRemove()`, `count()`. Dùng các hàm trong bảng trên.
