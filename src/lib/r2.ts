import "server-only";
import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getR2Config, hasR2Config } from "@/lib/env";

const USER_AGENT = "Mozilla/5.0 (compatible; EscanorAssetMirror/1.0; +https://escanor.app)";
const MAX_FILE_SIZE = 12 * 1024 * 1024;

let client: S3Client | null = null;

function getClient() {
  if (client) return client;
  const config = getR2Config();
  const endpointUrl = new URL(config.endpoint);
  endpointUrl.pathname = "";
  endpointUrl.search = "";
  endpointUrl.hash = "";

  client = new S3Client({
    region: "auto",
    endpoint: endpointUrl.toString(),
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

function normalizePublicUrl(baseUrl: string, key: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedKey = key.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${normalizedBase}/${normalizedKey}`;
}

function extractR2ObjectKey(url: string, config: ReturnType<typeof getR2Config>) {
  try {
    const target = new URL(url);
    const endpoint = new URL(config.endpoint);
    const publicBase = new URL(config.publicBaseUrl);
    const cleanPath = target.pathname.replace(/^\/+/, "");

    if (target.origin === publicBase.origin) {
      const basePath = publicBase.pathname.replace(/^\/+|\/+$/g, "");
      if (!basePath) return cleanPath;
      if (cleanPath.startsWith(`${basePath}/`)) return cleanPath.slice(basePath.length + 1);
      return cleanPath;
    }

    if (target.origin === endpoint.origin) {
      if (cleanPath === config.bucketName) return "";
      if (cleanPath.startsWith(`${config.bucketName}/`)) return cleanPath.slice(config.bucketName.length + 1);
      return cleanPath;
    }

    if (/\.r2\.dev$/i.test(target.hostname)) {
      if (cleanPath.startsWith(`${config.bucketName}/`)) return cleanPath.slice(config.bucketName.length + 1);
      return cleanPath;
    }
  } catch {
    return "";
  }

  return "";
}

export function normalizeR2PublicImageUrl(url: string) {
  const sourceUrl = url.trim();
  if (!sourceUrl || !hasR2Config()) return sourceUrl;
  const config = getR2Config();
  const key = extractR2ObjectKey(sourceUrl, config);
  if (!key) return sourceUrl;
  return normalizePublicUrl(config.publicBaseUrl, key);
}

function inferExtension(contentType: string, sourceUrl: string) {
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.includes("png")) return "png";
  if (normalizedType.includes("webp")) return "webp";
  if (normalizedType.includes("gif")) return "gif";
  if (normalizedType.includes("svg")) return "svg";
  if (normalizedType.includes("avif")) return "avif";
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return "jpg";

  try {
    const pathname = new URL(sourceUrl).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    if (match?.[1]) return match[1].toLowerCase();
  } catch {
    // no-op
  }

  return "jpg";
}

export async function mirrorRemoteImageToR2(input: {
  sourceUrl: string;
  keyPrefix: string;
  cacheKey?: string;
}) {
  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  if (!hasR2Config()) return sourceUrl;

  const normalizedExistingUrl = normalizeR2PublicImageUrl(sourceUrl);
  if (normalizedExistingUrl !== sourceUrl) return normalizedExistingUrl;

  const config = getR2Config();
  if (sourceUrl.startsWith(config.publicBaseUrl)) return sourceUrl;

  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "cache-control": "no-cache",
      referer: "https://www.meigen.ai/",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Remote image fetch failed: ${response.status} ${sourceUrl}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Remote asset is not an image: ${contentType}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error(`Remote image is empty: ${sourceUrl}`);
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`Remote image exceeds ${MAX_FILE_SIZE} bytes: ${sourceUrl}`);
  }

  const extension = inferExtension(contentType, sourceUrl);
  const digest = createHash("sha1").update(input.cacheKey || sourceUrl).digest("hex");
  const key = `${input.keyPrefix.replace(/\/+$/, "")}/${digest}.${extension}`;

  await getClient().send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return normalizePublicUrl(config.publicBaseUrl, key);
}
