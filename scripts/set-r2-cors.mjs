#!/usr/bin/env node
/**
 * Set the CORS policy on the R2 media bucket.
 *
 * The app's <audio> uses crossorigin="anonymous" so the service worker can
 * read and cache audio responses — that requires the bucket to send
 * Access-Control-Allow-Origin. Public read-only media, so allow any origin.
 *
 * Usage: node scripts/set-r2-cors.mjs [--get]
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

const args = new Map();
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--")) args.set(a.slice(2), true);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const policy = {
  CORSRules: [
    {
      AllowedOrigins: ["*"],
      AllowedMethods: ["GET", "HEAD"],
      AllowedHeaders: ["*"],
      MaxAgeSeconds: 3600,
    },
  ],
};

if (args.has("get")) {
  const r = await client.send(new GetBucketCorsCommand({ Bucket: process.env.R2_BUCKET }));
  console.log(JSON.stringify(r.CORSRules, null, 2));
} else {
  await client.send(new PutBucketCorsCommand({ Bucket: process.env.R2_BUCKET, CORSConfiguration: policy }));
  console.log(`CORS policy set on bucket "${process.env.R2_BUCKET}"`);
}
