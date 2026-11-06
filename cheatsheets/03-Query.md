# 03 · Query Mongoose (CRUD, lọc, phân trang, cập nhật mảng, populate)

Mọi ví dụ đều là **Mongoose** (`await Model.xxx()`), không phải mongosh (`db.books.find()`).

## Tra nhanh

| Cần | Gọi | Trả về |
|---|---|---|
| Tất cả / có điều kiện | `Book.find(filter)` | mảng (có thể `[]`) |
| Một document | `Book.findOne(filter)` / `Book.findById(id)` | doc hoặc `null` |
| Có tồn tại không | `Book.exists(filter)` | `{ _id }` hoặc `null` |
| Đếm | `Book.countDocuments(filter)` | số |
| Các giá trị khác nhau | `Book.distinct('genre', filter)` | mảng |
| Thêm | `Book.create(obj)` / `Book.insertMany(arr)` | doc / mảng doc |
| Sửa + lấy doc | `Book.findByIdAndUpdate(id, upd, { returnDocument: 'after', runValidators: true })` | doc hoặc `null` |
| Sửa, chỉ cần số lượng | `Book.updateOne(f, upd)` / `updateMany` | `{ matchedCount, modifiedCount }` |
| Xóa + lấy doc | `Book.findByIdAndDelete(id)` | doc hoặc `null` |
| Xóa, chỉ cần số lượng | `Book.deleteOne(f)` / `deleteMany(f)` | `{ deletedCount }` |

Nối tiếp sau `find`: `.select()` `.sort()` `.skip()` `.limit()` `.populate()` `.lean()`.

## 1. Toán tử lọc

```js
{ price: 100 }                                   // bằng
{ price: { $gt: 10, $lte: 50 } }                 // $gt $gte $lt $lte $ne
{ genre: { $in: ['A', 'B'] } }                   // $in / $nin
{ $or: [{ genre: 'A' }, { price: { $lt: 10 } }] }
{ $and: [{ price: { $gte: 10 } }, { price: { $lte: 50 } }] }
{ discount: { $exists: true } }
{ 'address.city': 'HN' }                         // field lồng: đường dẫn có dấu chấm, để trong nháy
{ tags: 'sale' }                                 // mảng chứa giá trị
{ tags: { $all: ['sale', 'new'] } }              // mảng chứa tất cả
{ tags: { $size: 2 } }                           // độ dài mảng
{ $expr: { $gt: ['$sold', '$stock'] } }          // so sánh 2 field với nhau
```

Lọc theo khoảng ngày (trọn 1 ngày):

```js
const start = new Date('2024-05-01T00:00:00Z');
const end   = new Date('2024-05-02T00:00:00Z');
{ createdAt: { $gte: start, $lt: end } }
```

## 2. Tìm theo từ khóa (không phân biệt hoa thường, an toàn)

```js
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');  // tránh ký tự đặc biệt của regex
const filter = {};
if (req.query.q) filter.title = { $regex: escape(req.query.q), $options: 'i' };
if (req.query.minPrice) filter.price = { $gte: Number(req.query.minPrice) };
const books = await Book.find(filter);
```

## 3. Chọn field, sắp xếp

```js
Book.find().select('title price -_id')           // lấy title, price; bỏ _id
Book.find().select('-__v')                       // bỏ 1 field
Book.find({}, { title: 1, price: 1 })            // tương tự, dạng object
Book.find().sort({ price: -1, title: 1 })        // -1 giảm, 1 tăng; trùng thì xét key thứ 2
Book.find().sort({ price: -1 }).limit(5)         // top 5
```

## 4. Phân trang kèm tổng số

```js
const page = Math.max(1, parseInt(req.query.page, 10) || 1);
const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
const [items, total] = await Promise.all([
  Book.find(filter).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit),  // bắt buộc sort ổn định
  Book.countDocuments(filter),
]);
res.json({ page, limit, total, totalPages: Math.ceil(total / limit), items });
```

## 5. Toán tử cập nhật và mảng

```js
await Book.updateOne({ _id: id }, { $set: { price: 120 } });
await Book.updateOne({ _id: id }, { $inc: { stock: -1 } });        // cộng / trừ số
await Book.updateOne({ _id: id }, { $unset: { discount: '' } });   // xóa field
await Book.updateOne({ _id: id }, { $push: { tags: 'new' } });     // thêm cuối (cho phép trùng)
await Book.updateOne({ _id: id }, { $addToSet: { tags: 'new' } }); // thêm nếu chưa có
await Book.updateOne({ _id: id }, { $pull: { tags: 'old' } });     // xóa phần tử khớp

// Mảng subdocument
await Class.updateOne({ _id: classId }, { $push: { enrollments: { student: sid, status: 'ENROLLED' } } });
await Class.updateOne({ _id: classId }, { $pull: { enrollments: { student: sid } } });

// Sửa ĐÚNG 1 phần tử khớp: toán tử vị trí $
await Class.updateOne(
  { _id: classId, 'enrollments.student': sid },
  { $set: { 'enrollments.$.status': 'DROPPED' } },
);

// Một phần tử phải khớp cùng lúc 2+ điều kiện
await Class.find({ enrollments: { $elemMatch: { student: sid, status: 'ENROLLED' } } });

// Upsert: không có thì thêm mới
await Attendance.findOneAndUpdate(
  { student: sid, date },
  { $set: { status: 'PRESENT' } },
  { upsert: true, returnDocument: 'after', runValidators: true },
);
```

Nghiệp vụ "không được trùng trong mảng" → kiểm tra trước, hoặc dùng `$addToSet` / điều kiện chặn ngay trong filter:

```js
const r = await Class.updateOne(
  { _id: classId, status: { $ne: 'CLOSED' }, 'enrollments.student': { $ne: sid } },
  { $push: { enrollments: { student: sid } } },
);
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
