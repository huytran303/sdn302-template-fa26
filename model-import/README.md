# model-import

Hai script giúp bạn đưa file JSON export từ MongoDB vào database và tạo sẵn Mongoose model.

| Script | Chức năng | Yêu cầu |
| --- | --- | --- |
| `gen-models.js` | In ra schema và model Mongoose, suy luận từ các file JSON | Chỉ cần Node |
| `import-json.js` | Nạp các file JSON vào MongoDB | Node 20.12 trở lên, đã cài `mongoose` trong thư mục bài làm, có Mongo URI |

## Bắt đầu nhanh

Bạn chạy lệnh từ thư mục bài làm (ví dụ `su26/`, bản copy từ `template/`) để script tìm thấy `node_modules` và `.env`. `<json-folder>` là thư mục chứa các file đã export.

```bash
cd su26   # or your <exam> folder
npm install

# 1. Load the data into the database named in MONGO_URI
node ../model-import/import-json.js <json-folder>

# 2. Generate the models (the target folder must already exist)
mkdir -p models
node ../model-import/gen-models.js <json-folder> > models/index.js
```

Sau đó dùng model như sau:

```js
const { Book } = require("./models");

const books = await Book.find().populate("authorId");
```

## File đầu vào

- Script đọc mọi file `*.json` nằm trực tiếp trong thư mục. Thư mục con, `package.json` và `package-lock.json` bị bỏ qua.
- Mỗi file có thể là một mảng JSON, một document đơn hoặc NDJSON (mỗi dòng một document).
- Script hỗ trợ MongoDB Extended JSON: `$oid`, `$date`, `$numberInt`, `$numberLong`, `$numberDouble`, `$numberDecimal`, `$binary`.
- Tên collection là phần cuối của tên file sau dấu chấm: `spr25db.movies.json` thành `movies`. Nếu hai file trùng tên collection, script báo lỗi.

## import-json.js

```bash
node path/to/import-json.js <json-folder> [mongo-uri]
```

> **Cảnh báo:** mỗi collection có file tương ứng sẽ bị **xoá rồi nạp lại từ đầu**. Hãy kiểm tra URI trước khi chạy trên database có dữ liệu quan trọng. Dòng `database:` trong output cho biết database vừa được ghi.

- URI truyền qua tham số được ưu tiên hơn `MONGO_URI` trong `.env` hoặc biến môi trường.
- Database là database ghi trong URI. Nếu URI không có tên database, script dùng `test`.
- Script parse toàn bộ file trước khi kết nối, nên chỉ cần một file JSON sai là không có gì được import.
- Các collection không có file tương ứng được giữ nguyên.
- Kiểu giá trị được giữ đúng như lúc export, gồm int, long, double và decimal.

Ví dụ output:

```text
database: spr25db
authors: 1 docs
books: 1 docs
```

## gen-models.js

```bash
node path/to/gen-models.js <json-folder> > models.js
```

Script ghi code ra stdout và cảnh báo ra stderr, nên cảnh báo không lẫn vào file được tạo. Script chỉ đọc file, không kết nối database.

Với hai file export `authors` và `books`, output có dạng:

```js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const reviewSubSchema = new Schema({
  stars: Number,
  by: String,
}, { _id: false });

const authorSchema = new Schema({
  name: String,
  birth: Date,
});

const bookSchema = new Schema({
  title: String,
  price: Number /* Decimal128 in Mongo: reads as a JS number, saving an edit stores a double */,
  authorId: { type: Schema.Types.ObjectId, ref: "Author" },
  tags: [String],
  reviews: [reviewSubSchema],
  publisher: {
    name: String,
  },
  note: Schema.Types.Mixed /* always null in the sample: set the real type by hand */,
});

const Author = mongoose.model("Author", authorSchema, "authors");
const Book = mongoose.model("Book", bookSchema, "books");

module.exports = { Author, Book };
```

### Cách suy luận kiểu

- **Model:** tên collection ở dạng số ít, viết theo PascalCase (`movies` thành `Movie`). Tham số thứ ba của `mongoose.model` giữ đúng tên collection thật.
- **Ref:** field ObjectId có `ref` khi giá trị của nó khớp với `_id` của đúng một collection. Field string hoặc number thì mọi giá trị đều phải khớp, và tên field phải chỉ tới model đó, ví dụ `authorId` hoặc `author_id`. Id không khớp với collection nào sẽ bị bỏ qua.
- **`_id`:** chỉ được khai báo khi dữ liệu không dùng ObjectId.
- **Mixed:** field có nhiều kiểu, hoặc chỉ toàn `null`, sẽ thành `Schema.Types.Mixed`.
- **Subdocument:** phần tử mảng không có `_id` được gắn `{ _id: false }` để Mongoose không tự thêm.

### Những chỗ cần kiểm tra lại

Script chỉ nhìn thấy dữ liệu mẫu, nên bạn cần tự kiểm tra các điểm sau:

- **Validation:** script không sinh `required`, `unique`, `enum` và `default`. Bạn tự thêm theo yêu cầu đề bài.
- **Comment trong output:** đánh dấu các kiểu cần sửa hoặc cần lưu ý, như field luôn `null` và ngày ISO lưu dạng string.
- **Thiếu ref:** field không có `ref` nếu collection được tham chiếu không có file export hoặc không có giá trị nào khớp. Bạn thêm tay.
- **Tên lạ:** quy tắc chuyển số ít khá đơn giản, nên hãy đổi tên model nếu đọc thấy sai.
- **Field bị bỏ qua:** tên có dấu chấm hoặc trùng với Mongoose (như `constructor`) chỉ để lại comment. Bạn đọc các field này bằng `.lean()`.
- **Số thập phân lớn:** `Decimal128` được map sang `Number`, nên mất độ chính xác khi vượt quá 2^53.

## Xử lý lỗi

| Thông báo | Cách xử lý |
| --- | --- |
| `mongoose not found` | Chạy `npm install`, rồi chạy script từ thư mục bài làm |
| `no database` | Truyền URI hoặc đặt `MONGO_URI` trong `.env`. Node dưới 20.12 không đọc `.env`, nên bạn cần truyền URI |
| `invalid JSON` | Sửa file được nêu tên. Chưa có gì được import |
| `both map to collection` / `two files map to collection` | Chỉ giữ lại một trong hai file |
| `no .json files found` hoặc `ENOENT ... scandir` | Kiểm tra lại đường dẫn thư mục |
| Timeout kết nối sau 5 giây | Khởi động MongoDB hoặc sửa lại URI |
