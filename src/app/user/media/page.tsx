import Link from "next/link";

export default function MediaPage() {
  return (
    <main className="simple-page">
      <h1>Ảnh & Video AI</h1>
      <p>Trang media đã sẵn sàng để mở rộng thư viện thật.</p>
      <Link href="/user" className="chip-btn primary">Quay lại Dashboard</Link>
    </main>
  );
}
