import Link from "next/link";

export default function ToolsPage() {
  return (
    <main className="simple-page">
      <h1>Công cụ AI</h1>
      <p>Trang tạo video đã chuyển sang route mới.</p>
      <Link href="/user/video" className="chip-btn primary">Mở trang tạo video</Link>
    </main>
  );
}
