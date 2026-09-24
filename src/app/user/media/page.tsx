import { History, Image as ImageIcon, Video } from "lucide-react";
import { StudioInfoPage } from "@/components/studio-info-page";

export default function MediaPage() {
  return (
    <StudioInfoPage
      active="history"
      eyebrow="Media workspace"
      title="Ảnh & Video AI"
      description="Tạo nội dung mới hoặc mở thư viện thật từ lịch sử tài khoản của anh."
      actions={[
        { href: "/user#generator", label: "Tạo hình ảnh", description: "Mở image composer với model và cài đặt hiện tại.", icon: ImageIcon },
        { href: "/user/video", label: "Tạo video", description: "Chuyển prompt hoặc ảnh tham chiếu thành video.", icon: Video },
        { href: "/user/history", label: "Mở thư viện", description: "Xem lại ảnh và video đã tạo trong 7 ngày gần nhất.", icon: History },
      ]}
    />
  );
}
