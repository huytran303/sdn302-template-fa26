# 06 · Xác thực JWT (TÙY CHỌN)

> **Chỉ dùng khi đề cho sẵn `jsonwebtoken` (và `bcryptjs`).** Hai thư viện này KHÔNG có trong `package.json` của template,
> và trong giờ thi không được tải thêm. `require('jsonwebtoken')` khi chưa cài sẽ làm server crash.

## Tra nhanh

| Bước | Code |
|---|---|
| Tạo token (lúc login) | `jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1h' })` |
| Kiểm tra token | `jwt.verify(token, process.env.JWT_SECRET)` → payload hoặc ném lỗi |
| Đọc không kiểm tra | `jwt.decode(token)` (không bao giờ dùng để xác thực) |
| Hash mật khẩu | `await bcrypt.hash(plain, 10)` |
| So sánh mật khẩu | `await bcrypt.compare(plain, hash)` → boolean |
| Header phía client | `Authorization: Bearer <token>` |

`.env`: `JWT_SECRET=mot_chuoi_dai_ngau_nhien`. Không để secret mặc định cứng trong code.
Payload JWT chỉ được **ký, không mã hóa**: ai cũng đọc được. Không bao giờ để mật khẩu trong đó.

## 1. Model User (thêm vào `models.js`)

```js
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
});
const User = mongoose.model('User', userSchema, 'users');
```

Nếu collection users của đề lưu mật khẩu dạng **thô** thì so sánh bằng `===` thay vì bcrypt: làm theo dữ liệu.

## 2. Middleware

```js
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const [scheme, token] = (req.get('Authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);  // { id, role, iat, exp }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Forbidden' });
```

## 3. Đăng ký / đăng nhập / route được bảo vệ

```js
const bcrypt = require('bcryptjs');

app.post('/register', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const user = await User.create({ email, password: await bcrypt.hash(password, 10) }); // trùng email → 409 qua handler
  res.status(201).json({ id: user._id, email: user.email });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = email && (await User.findOne({ email: String(email).toLowerCase() }));
  if (!user || !(await bcrypt.compare(String(password ?? ''), user.password))) {
    return res.status(401).json({ error: 'Wrong email or password' });   // cùng 1 thông báo cho cả 2 trường hợp
  }
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

app.get('/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.delete('/books/:id', auth, requireRole('admin'), handler);
app.get('/my-orders', auth, async (req, res) => res.json(await Order.find({ user: req.user.id })));
```

## Bẫy thường gặp

| Lỗi | Nguyên nhân |
|---|---|
| `jwt must be provided` | thiếu header / tách chuỗi sai |
| `invalid signature` | secret lúc sign khác lúc verify (`.env` chưa được load) |
| `jwt expired` | token hết hạn: đăng nhập lại |
| `secretOrPrivateKey must have a value` | thiếu `JWT_SECRET` trong `.env` |
| `req.user` là undefined | quên gắn `auth` vào route đó |
| so sánh mật khẩu luôn sai | mật khẩu trong DB là dạng thô (hoặc bị hash 2 lần) |
