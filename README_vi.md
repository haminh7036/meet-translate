# Meet Translate

> Đây là sản phẩm của vibe coding. Hoạt động nhưng sử dụng có nguy cơ riêng. Lỗi có thể xảy ra. PRs welcome. 😀

Dịch phụ đề Google Meet theo thời gian thực bằng Gemini AI.

## Tính năng

- **Dịch phụ đề real-time** — Dịch nội dung đang nói khi nó hiện trên màn hình
- **Đa ngôn ngữ** — Tiếng Việt, Tiếng Anh, Tiếng Trung
- **Deduplication thông minh** — Tránh dịch lại các câu đã dịch bằng IndexedDB
- **Panel nổi** — Di chuyển được, bạn có thể đặt ở bất kỳ đâu
- **Cài đặt được lưu** — API key và tùy chọn được đồng bộ qua thiết bị

## Yêu cầu

- Google Chrome (hoặc trình duyệt bất kỳ dựa trên Chromium)
- API key Gemini từ [Google AI Studio](https://aistudio.google.com/app/apikey)

## Cài đặt

1. Clone repo này
2. Cài đặt dependencies:

```bash
npm install
```

3. Build extension:

```bash
npm run build
```

4. Load trong Chrome:
   - Mở `chrome://extensions`
   - Bật **Developer mode** (góc phải trên)
   - Click **Load unpacked**
   - Chọn thư mục `dist/`

## Cách sử dụng

1. Click icon extension trong toolbar
2. Nhập API key Gemini
3. Chọn ngôn ngữ đích
4. Bật extension
5. Tham gia cuộc gọi Google Meet với phụ đề bật
6. Panel dịch sẽ tự động xuất hiện

## Commands

| Command | Mô tả |
|---------|-------|
| `npm run build` | Build production → `dist/` |
| `npm run dev` | Watch mode để dev |
| `npm run lint` | Check ESLint |
| `npm run typecheck` | Check type TypeScript |

## Công nghệ sử dụng

- **Vite** — Build tool
- **Vue 3** — UI Popup
- **TypeScript** — Type safety
- **TailwindCSS v4** — Styling
- **Gemini API** — Dịch thuật

## License

[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
