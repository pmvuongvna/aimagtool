import { GalleryHorizontalEnd, Video, WandSparkles } from "lucide-react";
import { StudioInfoPage } from "@/components/studio-info-page";

export default function ToolsPage() {
  return (
    <StudioInfoPage
      active="kling"
      eyebrow="Creative tools"
      title="Công cụ AI"
      description="Chọn đúng workflow cho nội dung anh muốn tạo. Mọi công cụ bên dưới đều sử dụng model và luồng xử lý hiện có."
      actions={[
        { href: "/user/kling", label: "Kling Motion", description: "Điều khiển chuyển động bằng ảnh và video tham chiếu.", icon: WandSparkles },
        { href: "/user/video", label: "AI Video", description: "Tạo video với Grok Imagine hoặc Seedance 2.", icon: Video },
        { href: "/user/templates", label: "Prompt Templates", description: "Khám phá prompt đã được tuyển chọn cho ảnh và video.", icon: GalleryHorizontalEnd },
      ]}
    />
  );
}
