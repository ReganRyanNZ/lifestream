import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type StorageMode = "local" | "r2";

export const storageMode: StorageMode = process.env.STORAGE_MODE === "r2" ? "r2" : "local";

const LOCAL_DIR = path.join(process.cwd(), ".storage");

/**
 * Audio/artwork objects live at content-keyed immutable keys ("a/<id>.m4a",
 * "img/<hash>.jpg") and are served with year-long cache headers.
 */
export function publicUrlFor(key: string): string {
  if (storageMode === "r2") {
    const base = process.env.R2_PUBLIC_BASE;
    if (!base) throw new Error("STORAGE_MODE=r2 requires R2_PUBLIC_BASE");
    return `${base.replace(/\/$/, "")}/${key}`;
  }
  return `/api/file/${key}`;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (storageMode === "local") {
    const dest = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, body);
    return;
  }

  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

export async function objectExists(key: string): Promise<boolean> {
  if (storageMode === "local") {
    try {
      await fs.stat(path.join(LOCAL_DIR, key));
      return true;
    } catch {
      return false;
    }
  }
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    await (await getR2Client()).send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }),
    );
    return true;
  } catch {
    return false;
  }
}

type R2Client = import("@aws-sdk/client-s3").S3Client;
let r2: R2Client | null = null;
async function getR2Client(): Promise<R2Client> {
  if (r2) return r2;
  const { S3Client } = await import("@aws-sdk/client-s3");
  r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return r2;
}

export function sha1(content: Buffer | string): string {
  return createHash("sha1").update(content).digest("hex");
}
