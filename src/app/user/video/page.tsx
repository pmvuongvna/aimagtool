import VideoClient from "./video-client";

export default async function UserVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const params = await searchParams;
  const initialPrompt = typeof params.prompt === "string" ? params.prompt : "";
  return <VideoClient initialPrompt={initialPrompt} />;
}
