import UserClient from "./user-client";

export default async function UserPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const params = await searchParams;
  const initialPrompt = typeof params.prompt === "string" ? params.prompt : "";

  return <UserClient initialPrompt={initialPrompt} />;
}
