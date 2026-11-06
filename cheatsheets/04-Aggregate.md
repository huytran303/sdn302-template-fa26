# 04 · Aggregate (báo cáo, thống kê, join kèm tính toán)

Dùng khi đề cần **đếm / tổng / trung bình / nhóm / join rồi lọc theo field bảng join**. Join chỉ để hiển thị → `populate` ([03-Query](03-Query.md) §6).

Model ví dụ (Nhân viên – Phòng ban – Dự án – Workson):

```
departments { _id, depName }
employees   { _id, empName, salary, depId -> departments }
projects    { _id, proName, depId -> departments }
worksons    { _id, empId -> employees, proId -> projects, workHours }
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

## 1. Ép kiểu: aggregate KHÔNG tự ép kiểu

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

Nếu `_id` là String (`"P01"`) thì so khớp thẳng bằng chuỗi, không dùng ObjectId.

## 2. Công thức

**Đếm theo nhóm**

```js
await Employee.aggregate([
  { $group: { _id: '$depId', headcount: { $sum: 1 } } },
]);
// [ { _id: ObjectId(...), headcount: 5 }, ... ]
```

**Nhóm → join lấy tên → định dạng → sắp xếp** (dạng hay ra thi nhất)

```js
await Workson.aggregate([
  { $group: { _id: '$proId', totalHours: { $sum: '$workHours' } } },
  { $lookup: { from: 'projects', localField: '_id', foreignField: '_id', as: 'project' } },  // _id lúc này chính là proId
  { $unwind: '$project' },
  { $project: { _id: 0, projectId: '$_id', projectName: '$project.proName', totalHours: 1 } },
  { $sort: { totalHours: -1 } },
]);
```

**Trung bình + đếm, làm tròn**

```js
await Employee.aggregate([
  { $group: { _id: '$depId', avgSalary: { $avg: '$salary' }, headcount: { $sum: 1 } } },
  { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dep' } },
  { $unwind: '$dep' },
  { $project: { _id: 0, department: '$dep.depName', headcount: 1, avgSalary: { $round: ['$avgSalary', 2] } } },
]);
```

`$round` cho ra `90` chứ không phải `90.0`. Nếu đề yêu cầu số `90.0` thì map kết quả rồi dùng `JSON.rawJSON(x.toFixed(1))`, xem [05-JS](05-JS.md) §5.

**Đếm có điều kiện + tỉ lệ** (có mặt / vắng)

```js
await Attendance.aggregate([
  { $match: { classId: new mongoose.Types.ObjectId(classId) } },
  { $group: {
      _id: '$studentId',
      total: { $sum: 1 },
      present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
  } },
  { $addFields: { rate: { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 2] } } },
  { $sort: { rate: 1 } },
]);
```

**Nhóm theo ngày**

```js
{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, count: { $sum: 1 } } },
{ $sort: { _id: 1 } },
```

**Nhóm theo 2 key**

```js
{ $group: { _id: { dep: '$depId', year: { $year: '$hiredAt' } }, n: { $sum: 1 } } },
{ $project: { _id: 0, dep: '$_id.dep', year: '$_id.year', n: 1 } },
```

**Mảng nhúng: unwind rồi group**

```js
await Class.aggregate([
  { $unwind: '$enrollments' },
  { $match: { 'enrollments.status': 'ENROLLED' } },
  { $group: { _id: '$_id', className: { $first: '$name' }, enrolled: { $sum: 1 } } },
]);
// hoặc không cần unwind: { $project: { name: 1, size: { $size: '$enrollments' } } }
```

**Nối 3 collection** (workson → project → department)

```js
await Workson.aggregate([
  { $lookup: { from: 'projects', localField: 'proId', foreignField: '_id', as: 'p' } },
  { $unwind: '$p' },
  { $lookup: { from: 'departments', localField: 'p.depId', foreignField: '_id', as: 'd' } },
  { $unwind: '$d' },
  { $group: { _id: '$d.depName', hours: { $sum: '$workHours' } } },
]);
```

**Giữ cả nhóm có 0 phần tử** (phòng ban không có nhân viên): bắt đầu từ collection cha

```js
await Department.aggregate([
  { $lookup: { from: 'employees', localField: '_id', foreignField: 'depId', as: 'emps' } },
  { $project: { _id: 0, depName: 1, headcount: { $size: '$emps' } } },
]);
```

**Lookup có điều kiện** (dạng pipeline)

```js
{ $lookup: {
    from: 'employees',
    let: { dep: '$_id' },
    pipeline: [
      { $match: { $expr: { $eq: ['$depId', '$$dep'] } } },
      { $match: { salary: { $gte: 1000 } } },
      { $project: { empName: 1, _id: 0 } },
    ],
    as: 'richEmps',
} }
```

**Top N + lọc theo giá trị vừa tính**

```js
{ $group: { _id: '$studentId', absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } } } },
{ $match: { absent: { $gt: 3 } } },     // $match SAU $group để lọc theo field vừa tính
{ $sort: { absent: -1 } },
{ $limit: 5 },
```

**Phân trang kèm tổng số trong 1 query**

```js
const [r] = await Book.aggregate([
  { $match: filter },
  { $sort: { _id: 1 } },
  { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], meta: [{ $count: 'total' }] } },
]);
res.json({ total: r.meta[0]?.total ?? 0, items: r.items });   // meta là [] khi không có kết quả
```

## Bẫy thường gặp

- `from` = tên collection (in ra bằng `Model.collection.name`), không phải tên model.
- `$unwind` bỏ các document có mảng rỗng/thiếu (inner join). Muốn LEFT JOIN: `{ $unwind: { path: '$dep', preserveNullAndEmptyArrays: true } }`.
- `$count` khi không có document nào trả `[]`, không phải `[{ total: 0 }]`.
- `$avg` khi không có giá trị → `null`; `$divide` cho 0 → lỗi: chặn bằng `$cond`.
- Kết quả là **object thuần**: không có `populate`, không có virtual. `_id` vẫn là ObjectId (`res.json` tự chuyển thành chuỗi).
- Sau `$group` chỉ còn `_id` + các field tính toán: muốn giữ field khác thì dùng `$first`.
