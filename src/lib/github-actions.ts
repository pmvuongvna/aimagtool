import "server-only";
import { getGitHubImportConfig } from "@/lib/env";

export async function dispatchMeiGenImportWorkflow(count?: number) {
  const config = getGitHubImportConfig();
  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${encodeURIComponent(config.workflowFile)}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Escanor-MeiGen-Dispatcher/1.0",
      },
      body: JSON.stringify({
        ref: config.ref,
        inputs: count ? { count: String(count) } : {},
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub workflow dispatch failed: ${response.status} ${body || "<empty body>"}`);
  }

  return {
    owner: config.owner,
    repo: config.repo,
    workflowFile: config.workflowFile,
    ref: config.ref,
    count,
  };
}
