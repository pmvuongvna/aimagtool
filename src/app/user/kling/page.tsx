import VideoClient from "../video/video-client";

export default async function UserKlingPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const params = await searchParams;
  const initialPrompt = typeof params.prompt === "string" ? params.prompt : "";
  return <VideoClient initialPrompt={initialPrompt} variant="kling" />;
}
