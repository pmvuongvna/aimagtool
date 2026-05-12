import Link from "next/link";

export default function ProjectsPage() {
  return (
    <main className="simple-page">
      <h1>Dự án của tôi</h1>
      <p>Route đã hoạt động. Phần danh sách chi tiết có thể nối trực tiếp API thật ở bước tiếp theo.</p>
      <Link href="/user" className="chip-btn primary">Quay lại Dashboard</Link>
    </main>
  );
}
