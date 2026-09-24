import { History, Image as ImageIcon, Video } from "lucide-react";
import { StudioInfoPage } from "@/components/studio-info-page";

export default function ProjectsPage() {
  return (
    <StudioInfoPage
      active="dashboard"
      eyebrow="Your workspace"
      title="Dự án của tôi"
      description="Khu vực dự án chưa có nguồn dữ liệu riêng, vì vậy trang chỉ dẫn tới các workflow và lịch sử thật đang hoạt động."
      actions={[
        { href: "/user#generator", label: "Bắt đầu với hình ảnh", description: "Tạo visual mới từ prompt hoặc ảnh tham chiếu.", icon: ImageIcon },
        { href: "/user/video", label: "Bắt đầu với video", description: "Thiết lập scene, model và chất lượng đầu ra.", icon: Video },
        { href: "/user/history", label: "Xem nội dung gần đây", description: "Tiếp tục từ ảnh và video anh đã tạo.", icon: History },
      ]}
    />
  );
}
