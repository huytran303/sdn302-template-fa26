# 04 · Aggregate (báo cáo, thống kê, join kèm tính toán)

Dùng khi đề cần **đếm / tổng / trung bình / nhóm / join rồi lọc theo field bảng join**. Join chỉ để hiển thị → `populate` ([03-Query](03-Query.md) §6).

Model ví dụ (Nhân viên – Phòng ban – Dự án – Workson). Mọi kết quả `→` bên dưới đã chạy thật trên data này
(id viết tắt `d1`, `e1`... cho dễ đọc; đề thật là ObjectId, cách viết pipeline y hệt).

```js
// departments
{ _id: 'd1', depName: 'IT' }
{ _id: 'd2', depName: 'HR' }
{ _id: 'd3', depName: 'Sales' }                       // không có nhân viên nào

// employees
{ _id: 'e1', empName: 'An',   salary: 1000, depId: 'd1', hiredAt: ISODate('2022-03-01') }
{ _id: 'e2', empName: 'Binh', salary: 1500, depId: 'd1', hiredAt: ISODate('2023-05-10') }
{ _id: 'e3', empName: 'Chi',  salary: 800,  depId: 'd2', hiredAt: ISODate('2023-01-15') }
{ _id: 'e4', empName: 'Dung', salary: 1200, depId: 'd1', hiredAt: ISODate('2023-05-10') }

// projects
{ _id: 'p1', proName: 'Website', depId: 'd1' }
{ _id: 'p2', proName: 'Recruit', depId: 'd2' }

// worksons
{ empId: 'e1', proId: 'p1', workHours: 10 }
{ empId: 'e2', proId: 'p1', workHours: 20 }
{ empId: 'e3', proId: 'p2', workHours: 5 }
{ empId: 'e4', proId: 'p1', workHours: 8 }
{ empId: 'e1', proId: 'p2', workHours: 4 }
```

## Tra nhanh

| Stage | Công dụng | Dạng |
|---|---|---|
| `$match` | lọc (giống `find`) | `{ $match: { salary: { $gte: 1000 } } }` |
| `$lookup` | join, kết quả là **mảng** | `{ $lookup: { from: 'departments', localField: 'depId', foreignField: '_id', as: 'dep' } }` |
| `$unwind` | mảng → mỗi phần tử 1 document | `{ $unwind: '$dep' }` |
| `$group` | nhóm + tính toán | `{ $group: { _id: '$depId', total: { $sum: '$salary' } } }` |
| `$project` | chọn / đổi tên / tính field | `{ $project: { _id: 0, name: '$dep.depName', total: 1 } }` |
| `$addFields` | thêm field tính toán, giữ field cũ | `{ $addFields: { cost: { $multiply: ['$qty', '$price'] } } }` |
| `$sort` / `$skip` / `$limit` | sắp xếp / phân trang | `{ $sort: { total: -1 } }` |
| `$count` | đếm số document còn lại | `{ $count: 'total' }` |
| `$facet` | chạy nhiều pipeline cùng lúc | lấy data + tổng số trong 1 query |

| Accumulator (`$group`) | Ý nghĩa |
|---|---|
| `{ $sum: 1 }` | đếm |
| `{ $sum: '$f' }` / `$avg` / `$min` / `$max` | tổng / trung bình / nhỏ nhất / lớn nhất |
| `{ $push: '$f' }` / `{ $addToSet: '$f' }` | gom vào mảng (có trùng / bỏ trùng) |
| `{ $first: '$f' }` / `$last` | phần tử đầu / cuối (phải `$sort` **trước** `$group`) |

| Biểu thức | Ví dụ |
|---|---|
| Toán học | `$add $subtract $multiply $divide`, `{ $round: ['$avg', 2] }` |
| Điều kiện | `{ $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] }` |
| Mặc định khi null | `{ $ifNull: ['$discount', 0] }` |
| Độ dài mảng | `{ $size: '$enrollments' }` |
| Ngày | `{ $dateToString: { format: '%Y-%m-%d', date: '$date' } }`, `{ $dayOfWeek: '$date' }` |
| Chuỗi | `{ $concat: ['$first', ' ', '$last'] }`, `{ $toUpper: '$name' }` |

## Thứ tự tư duy khi ráp pipeline

```
1 Dữ liệu chính nằm ở collection nào?  → Model.aggregate trên collection đó
2 Có cần lọc không?                    → $match (đặt càng sớm càng tốt)
3 Có cần collection khác không?        → $lookup (+ $unwind)
4 Có cần nhóm / tính toán không?       → $group
5 Định dạng output?                    → $project
6 Sắp xếp / phân trang?                → $sort, $skip, $limit
```

## 1. Xem data đi qua từng stage (công thức hay ra thi nhất)

Đề: "Tổng số giờ làm của mỗi dự án, kèm tên dự án, giờ nhiều nhất lên đầu".

```js
await Workson.aggregate([
  { $group: { _id: '$proId', totalHours: { $sum: '$workHours' } } },
  { $lookup: { from: 'projects', localField: '_id', foreignField: '_id', as: 'project' } },  // _id lúc này chính là proId
  { $unwind: '$project' },
  { $project: { _id: 0, projectId: '$_id', projectName: '$project.proName', totalHours: 1 } },
  { $sort: { totalHours: -1 } },
]);
```

**Vào:** 5 document worksons (ở trên).

**Sau `$group`** — gom theo `proId`, cộng `workHours`. Mỗi nhóm thành 1 document, chỉ còn `_id` + field vừa tính:

```js
{ _id: 'p1', totalHours: 38 }     // 10 + 20 + 8
{ _id: 'p2', totalHours: 9 }      // 5 + 4
```

**Sau `$lookup`** — thêm field `project` là **mảng** các document projects có `_id` khớp:

```js
{ _id: 'p1', totalHours: 38, project: [ { _id: 'p1', proName: 'Website', depId: 'd1' } ] }
{ _id: 'p2', totalHours: 9,  project: [ { _id: 'p2', proName: 'Recruit', depId: 'd2' } ] }
```

**Sau `$unwind`** — mảng 1 phần tử → object (mảng n phần tử thì nhân thành n document):

```js
{ _id: 'p1', totalHours: 38, project: { _id: 'p1', proName: 'Website', depId: 'd1' } }
{ _id: 'p2', totalHours: 9,  project: { _id: 'p2', proName: 'Recruit', depId: 'd2' } }
```

**Sau `$project`** — `1` = giữ, `0` = bỏ, `'$a.b'` = lấy giá trị field `a.b` đặt tên mới:

```js
{ totalHours: 38, projectId: 'p1', projectName: 'Website' }
{ totalHours: 9,  projectId: 'p2', projectName: 'Recruit' }
```

**Sau `$sort`** → kết quả cuối (đã đúng thứ tự giảm dần).

Mẹo khi làm bài: chạy pipeline với 1 stage, `console.log` xem, rồi thêm dần stage tiếp theo.

## 2. Ép kiểu: aggregate KHÔNG tự ép kiểu

```js
const mongoose = require('mongoose');
const { id } = req.params;
if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

await Workson.aggregate([
  { $match: { proId: new mongoose.Types.ObjectId(id) } },               // KHÔNG phải { proId: id }
  { $match: { date: { $gte: new Date(req.query.from) } } },             // KHÔNG dùng chuỗi thô
  { $match: { workHours: { $gte: Number(req.query.min) } } },           // KHÔNG phải "10"
]);
```

`{ proId: id }` với id là chuỗi → **không báo lỗi**, chỉ trả `[]`. `find()` thì Mongoose tự ép, aggregate thì không.
Nếu `_id` là String (`"P01"`) thì so khớp thẳng bằng chuỗi, không dùng ObjectId.

## 3. Công thức (kèm kết quả với data mẫu)

**Đếm theo nhóm**

```js
await Employee.aggregate([
  { $group: { _id: '$depId', headcount: { $sum: 1 } } },
]);
// → [ { _id: 'd1', headcount: 3 }, { _id: 'd2', headcount: 1 } ]     (d3 không có ai → không xuất hiện)
```

**Trung bình + đếm, làm tròn**

```js
await Employee.aggregate([
  { $group: { _id: '$depId', avgSalary: { $avg: '$salary' }, headcount: { $sum: 1 } } },
  { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dep' } },
  { $unwind: '$dep' },
  { $project: { _id: 0, department: '$dep.depName', headcount: 1, avgSalary: { $round: ['$avgSalary', 2] } } },
]);
// → [ { headcount: 3, department: 'IT', avgSalary: 1233.33 },     // (1000+1500+1200)/3
//     { headcount: 1, department: 'HR', avgSalary: 800 } ]
```

`$round` cho ra `800` chứ không phải `800.00`. Nếu đề yêu cầu số `800.00` thì map kết quả rồi dùng `JSON.rawJSON(x.toFixed(2))`, xem [05-JS](05-JS.md) §4.

**Đếm có điều kiện + tỉ lệ** (có mặt / vắng)

```js
// attendances: s1 → PRESENT, PRESENT, ABSENT;  s2 → PRESENT, ABSENT, ABSENT  (đều classId c1)
await Attendance.aggregate([
  { $match: { classId: new mongoose.Types.ObjectId(classId) } },
  { $group: {
      _id: '$studentId',
      total: { $sum: 1 },
      present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },   // PRESENT cộng 1, còn lại cộng 0
  } },
  { $addFields: { rate: { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 2] } } },
  { $sort: { rate: 1 } },
]);
// → [ { _id: 's2', total: 3, present: 1, rate: 33.33 },
//     { _id: 's1', total: 3, present: 2, rate: 66.67 } ]
```

**Nhóm theo ngày**

```js
await Employee.aggregate([
  { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$hiredAt' } }, count: { $sum: 1 } } },
  { $sort: { _id: 1 } },
]);
// → [ { _id: '2022-03-01', count: 1 }, { _id: '2023-01-15', count: 1 }, { _id: '2023-05-10', count: 2 } ]
```

**Nhóm theo 2 key** (`_id` là object)

```js
await Employee.aggregate([
  { $group: { _id: { dep: '$depId', year: { $year: '$hiredAt' } }, n: { $sum: 1 } } },
  // lúc này: { _id: { dep: 'd1', year: 2023 }, n: 2 }  → $project để "trải phẳng" _id
  { $project: { _id: 0, dep: '$_id.dep', year: '$_id.year', n: 1 } },
]);
// → [ { n: 1, dep: 'd1', year: 2022 }, { n: 2, dep: 'd1', year: 2023 }, { n: 1, dep: 'd2', year: 2023 } ]
```

**Mảng nhúng: unwind rồi group**

```js
// classes
{ _id: 'c1', name: 'SDN302', enrollments: [ {s1 ENROLLED}, {s2 DROPPED}, {s3 ENROLLED} ] }
{ _id: 'c2', name: 'MAE101', enrollments: [ {s1 ENROLLED} ] }
```

```js
await Class.aggregate([
  { $unwind: '$enrollments' },
  // lúc này 4 document, mỗi enrollment 1 doc:
  // { _id: 'c1', name: 'SDN302', enrollments: { student: 's1', status: 'ENROLLED' } }
  // { _id: 'c1', name: 'SDN302', enrollments: { student: 's2', status: 'DROPPED' } }   ...
  { $match: { 'enrollments.status': 'ENROLLED' } },
  { $group: { _id: '$_id', className: { $first: '$name' }, enrolled: { $sum: 1 } } },
]);
// → [ { _id: 'c1', className: 'SDN302', enrolled: 2 }, { _id: 'c2', className: 'MAE101', enrolled: 1 } ]

// Chỉ cần độ dài mảng (không lọc) thì không cần unwind:
await Class.aggregate([{ $project: { name: 1, size: { $size: '$enrollments' } } }]);
// → [ { _id: 'c1', name: 'SDN302', size: 3 }, { _id: 'c2', name: 'MAE101', size: 1 } ]
```

**Nối 3 collection** (workson → project → department)

```js
await Workson.aggregate([
  { $lookup: { from: 'projects', localField: 'proId', foreignField: '_id', as: 'p' } },
  { $unwind: '$p' },
  // { empId: 'e1', proId: 'p1', workHours: 10, p: { _id: 'p1', proName: 'Website', depId: 'd1' } }
  { $lookup: { from: 'departments', localField: 'p.depId', foreignField: '_id', as: 'd' } },
  { $unwind: '$d' },
  // { ..., p: {...}, d: { _id: 'd1', depName: 'IT' } }
  { $group: { _id: '$d.depName', hours: { $sum: '$workHours' } } },
]);
// → [ { _id: 'IT', hours: 38 }, { _id: 'HR', hours: 9 } ]
```

**Giữ cả nhóm có 0 phần tử** (phòng ban không có nhân viên): bắt đầu từ collection cha

```js
await Department.aggregate([
  { $lookup: { from: 'employees', localField: '_id', foreignField: 'depId', as: 'emps' } },
  // { _id: 'd3', depName: 'Sales', emps: [] }   ← Sales vẫn còn, emps rỗng
  { $project: { _id: 0, depName: 1, headcount: { $size: '$emps' } } },
]);
// → [ { depName: 'IT', headcount: 3 }, { depName: 'HR', headcount: 1 }, { depName: 'Sales', headcount: 0 } ]
// Nếu đi từ Employee.$group như "Đếm theo nhóm" → mất Sales.
```

**Lookup có điều kiện** (dạng pipeline)

```js
await Department.aggregate([
  { $lookup: {
      from: 'employees',
      let: { dep: '$_id' },                                        // biến từ doc bên ngoài, dùng là '$$dep'
      pipeline: [
        { $match: { $expr: { $eq: ['$depId', '$$dep'] } } },       // điều kiện join
        { $match: { salary: { $gte: 1000 } } },                    // điều kiện lọc thêm
        { $project: { empName: 1, _id: 0 } },
      ],
      as: 'richEmps',
  } },
]);
// → [ { _id: 'd1', depName: 'IT',    richEmps: [ { empName: 'An' }, { empName: 'Binh' }, { empName: 'Dung' } ] },
//     { _id: 'd2', depName: 'HR',    richEmps: [] },               // Chi lương 800 bị loại
//     { _id: 'd3', depName: 'Sales', richEmps: [] } ]
```

**Top N + lọc theo giá trị vừa tính**

```js
await Attendance.aggregate([
  { $group: { _id: '$studentId', absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } } } },
  // lúc này: { _id: 's1', absent: 1 }, { _id: 's2', absent: 2 }
  { $match: { absent: { $gt: 1 } } },     // $match SAU $group để lọc theo field vừa tính
  { $sort: { absent: -1 } },
  { $limit: 5 },
]);
// → [ { _id: 's2', absent: 2 } ]
```

**Phân trang kèm tổng số trong 1 query**

```js
// books (xem 03-Query): b1, b2, b3 là Novel; page = 1, limit = 2
const [r] = await Book.aggregate([
  { $match: { genre: 'Novel' } },
  { $sort: { _id: 1 } },
  { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], meta: [{ $count: 'total' }] } },
]);
// r = { items: [ {b1...}, {b2...} ], meta: [ { total: 3 } ] }
// không có kết quả: r = { items: [], meta: [] }
res.json({ total: r.meta[0]?.total ?? 0, items: r.items });
```

## Bẫy thường gặp

- `from` = tên collection (in ra bằng `Model.collection.name`), không phải tên model.
- `$unwind` bỏ các document có mảng rỗng/thiếu (inner join). Muốn LEFT JOIN: `{ $unwind: { path: '$dep', preserveNullAndEmptyArrays: true } }`.
- `$count` khi không có document nào trả `[]`, không phải `[{ total: 0 }]`.
- `$avg` khi không có giá trị → `null`; `$divide` cho 0 → lỗi: chặn bằng `$cond`.
- Kết quả là **object thuần**: không có `populate`, không có virtual. `_id` vẫn là ObjectId (`res.json` tự chuyển thành chuỗi).
- Thứ tự document sau `$group` **không cố định** (mỗi lần chạy có thể khác): đề cần thứ tự thì thêm `$sort`.
- Sau `$group` chỉ còn `_id` + các field tính toán: muốn giữ field khác thì dùng `$first`.
