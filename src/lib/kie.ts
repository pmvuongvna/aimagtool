const KIE_BASE_URL = "https://api.kie.ai/api/v1";
const KIE_UPLOAD_URL = "https://upload.kie.ai/api/v1";
const KIE_UPLOAD_QUICKSTART_URL = "https://kieai.redpandaai.co/api";

type KieEnvelope<T> = {
  success?: boolean;
  code: number;
  msg: string;
  data?: T;
};

function getApiKey() {
  return getKieApiKey();
}

async function kieFetch<T>(path: string, init: RequestInit): Promise<KieEnvelope<T>> {
  const apiKey = getApiKey();
  const res = await fetch(`${KIE_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const payload = (await res.json()) as KieEnvelope<T>;

  if (!res.ok) {
    throw new Error(payload.msg || "Kie API request failed");
  }

  if (typeof payload.code === "number" && payload.code !== 200) {
    throw new Error(payload.msg || "Kie returned non-success code");
  }

  return payload;
}

export async function createTask(model: string, input: Record<string, unknown>) {
  return kieFetch<{ taskId?: string }>("/jobs/createTask", {
    method: "POST",
    body: JSON.stringify({ model, input }),
  });
}

export async function createUpscaleTask(imageUrl: string, scale = 2) {
  return createTask("topaz-image-upscale", {
    image_url: imageUrl,
    scale,
  });
}

export async function getTaskDetails(taskId: string) {
  return kieFetch<Record<string, unknown>>(`/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
  });
}

export async function uploadFileToKie(file: File, kind: "image" | "video" = "image") {
  const apiKey = getApiKey();
  const endpoints = [
    `${KIE_UPLOAD_QUICKSTART_URL}/file-stream-upload`,
    `${KIE_UPLOAD_URL}/file-stream-upload`,
  ];

  let lastError = "Kie upload failed";

  for (const endpoint of endpoints) {
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("uploadPath", kind === "video" ? "videos" : "images");
      if (file.name) form.append("fileName", file.name);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        cache: "no-store",
      });

      const payload = (await res.json()) as KieEnvelope<Record<string, unknown>>;

      if (!res.ok) {
        lastError = payload.msg || `Upload failed (${res.status})`;
        continue;
      }

      const hasSuccessFlag = typeof payload.success === "boolean";
      if ((hasSuccessFlag && !payload.success) || payload.code !== 200) {
        lastError = payload.msg || "Kie upload returned non-success code";
        continue;
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Network upload error";
    }
  }

  throw new Error(lastError);
}
import "server-only";
import { getKieApiKey } from "@/lib/env";
