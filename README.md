# App Review Dashboard

Dashboard nội bộ cho team: nhập tên bất kỳ app nào → tự tìm trên Google Play +
Apple App Store → crawl review → phân loại bằng Claude → xem dashboard tương
tác + export Excel.

## Kiến trúc

- **`api/search-apps.js`** — Vercel serverless function, tìm app theo tên trên
  cả Google Play (`google-play-scraper`) và Apple (`itunes.apple.com/search`).
- **`api/crawl-reviews.js`** — Vercel serverless function, crawl review từ
  Google Play (tối đa ~600 review/lần) và Apple RSS feed (tối đa ~500 review,
  giới hạn cứng từ chính Apple). Cả 2 bước này cần chạy server-side vì bị
  chặn CORS nếu gọi thẳng từ browser.
- **`public/`** — frontend tĩnh (HTML/CSS/JS thuần, không cần build step).
  Sau khi crawl xong, **browser gọi thẳng tới Anthropic API** để phân loại
  review bằng API key người dùng tự nhập (lưu trong `localStorage`, không đi
  qua server nào khác).

## Vì sao phân loại chạy phía browser?

Bạn đã chọn phương án gọi thẳng Anthropic API từ browser (giống CX Agent
Superbot trước đây) — nhanh, không cần thêm backend/secret management, nhưng
**API key sẽ hiện diện ở phía client**. Điều này chấp nhận được cho công cụ
nội bộ team dùng key cá nhân của từng người, nhưng:

- Đừng public URL này ra ngoài internet không kiểm soát — bất kỳ ai có URL và
  tự nhập key của họ đều dùng được, nhưng key của mỗi người chỉ nằm trên máy
  người đó (không lộ cho người khác trong team).
- Nếu sau này cần bảo mật hơn (VD: dùng chung 1 key công ty, không muốn từng
  người tự có key riêng), cần chuyển bước classify sang một serverless
  function khác (`api/classify.js`) đọc key từ biến môi trường Vercel — có
  thể nhờ mình làm thêm khi cần.

## Deploy lên Vercel (miễn phí, ~5 phút)

### Cách 1 — qua GitHub (khuyên dùng, tự động deploy lại mỗi lần sửa code)

1. Tạo 1 repo GitHub mới, push toàn bộ thư mục này lên.
2. Vào [vercel.com](https://vercel.com) → đăng nhập bằng GitHub → **Add New
   Project** → chọn repo vừa tạo → **Deploy** (không cần chỉnh gì, Vercel tự
   nhận diện cấu trúc `api/` + `public/`).
3. Sau ~1 phút, Vercel cho 1 domain miễn phí dạng
   `ten-project.vercel.app` — vào được ngay.

### Cách 2 — deploy trực tiếp bằng CLI (không cần GitHub)

```bash
npm install -g vercel
cd app-review-dashboard
vercel login
vercel --prod
```

## Trỏ domain riêng (khi bạn có domain)

1. Vào project trên Vercel Dashboard → **Settings → Domains** → nhập domain
   của bạn (VD: `reviews.acb-design.com`).
2. Vercel cho 1 bản ghi CNAME (hoặc A record nếu domain gốc) — vào trang quản
   lý DNS của nhà cung cấp domain (Namecheap, GoDaddy, Mắt Bão, PA Vietnam...)
   thêm bản ghi đó.
3. Đợi DNS propagate (thường 5-30 phút) — Vercel tự cấp SSL (https) miễn phí.

## Team dùng thế nào

Mỗi người trong team:
1. Mở URL dashboard.
2. Nhập tên app cần tra cứu → chọn đúng app trong danh sách kết quả (Google
   Play + App Store).
3. Nhập **Anthropic API key của riêng họ** (một lần, lưu trong trình duyệt
   của họ) — lấy key tại [console.anthropic.com](https://console.anthropic.com).
4. Chọn taxonomy phù hợp (mặc định: taxonomy ngân hàng tiếng Việt, hoặc
   generic tiếng Anh cho app không phải ngân hàng).
5. Bấm **Crawl + Phân loại + Xem Dashboard**.

## Chế độ crawl

Dashboard có 2 chế độ, chọn ở dropdown "Chế độ crawl" trước khi bấm chạy:

- **N review mới nhất** (mặc định, nhanh): ~600 Google Play + ~500 App Store,
  không quan tâm review đó cũ hay mới bao nhiêu ngày.
- **Theo khoảng ngày** (VD: 1 năm gần đây): Google Play sẽ phân trang liên tục
  cho đến khi gặp review cũ hơn ngày bắt đầu bạn chọn (không giới hạn số
  lượng, chỉ giới hạn bởi thời gian request — có safety cap ~5000 review để
  tránh treo). **App Store vẫn giới hạn cứng ~500 review gần nhất** vì đó là
  giới hạn từ chính RSS feed công khai của Apple, không có cách nào vượt qua
  được — nếu app có nhiều review, khoảng ngày xa có thể không được Apple phủ
  hết dù Google Play thì đủ.

## Vì sao đôi khi App Store trả về 0 review?

Apple's RSS feed dùng CDN cache riêng cho từng trang, và tại một thời điểm
bất kỳ phần lớn các trang đang "nguội" (cache rỗng) trong khi 1-2 trang đang
"ấm" (có dữ liệu thật) — đây là hành vi của chính Apple, không phải lỗi của
dashboard. Code đã thử "quét" (sweep) tối đa 20 lần, mỗi lần cách nhau
500ms, nhưng nếu vận rủi trúng toàn bộ 12 lần "nguội" liên tiếp thì vẫn có
thể ra kết quả rỗng ở 1 lần chạy. Cách xử lý:
- Bấm nút **"Crawl thêm App Store"** để chạy lại và gộp thêm — dữ liệu cũ
  không mất.
- Dashboard cũng tự chẩn đoán: nếu 0 request nào thành công (không phải do
  cache mà do lỗi mạng thật), sẽ hiện rõ số liệu lỗi HTTP/kết nối cụ thể thay
  vì chỉ báo "0 review" chung chung — mở Console của trình duyệt (F12 →
  Console) để xem chi tiết `Apple crawl diagnostics`.



- **Google Play**: lấy tối đa ~600 review mới nhất mỗi lần chạy (3 trang x
  200). Muốn nhiều hơn, tăng `maxPages`/`pageSize` trong
  `api/crawl-reviews.js` — lưu ý tăng cũng làm request lâu hơn, có thể chạm
  timeout của Vercel function (đang set 30s trong `vercel.json`).
- **Apple App Store**: RSS feed công khai của Apple giới hạn cứng ~500 review
  gần nhất, và cache của Apple's CDN không ổn định (có lúc trả về đủ, có lúc
  trả về ít hơn ở cùng 1 app). Nếu số lượng thấp bất thường, bấm nút
  **"Crawl thêm App Store"** để gọi lại và gộp thêm — không mất dữ liệu đã có.
- **Chi phí**: mỗi lần phân loại gọi Claude (model `claude-haiku-4-5`) theo
  batch ~40 review/lần gọi — chi phí tính vào API key của người chạy, theo
  giá Anthropic API hiện hành.
- **Không lưu trữ lịch sử**: mỗi lần chạy là on-demand, không có database —
  đóng tab là mất kết quả (trừ khi bấm Export Excel trước).

## Chạy thử local (không cần deploy)

```bash
npm install
node dev-server.js
# mở http://localhost:3456
```

## Tùy biến taxonomy

Sửa trực tiếp `public/taxonomies.js` — thêm 1 entry mới vào object
`TAXONOMIES` theo đúng shape hiện có (`label`, `fallback`, `categories`), nó
sẽ tự xuất hiện trong dropdown chọn taxonomy trên UI.
