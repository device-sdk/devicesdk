#!/usr/bin/env node

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "fs";
import { basename, join } from "path";

// Required environment variables
const REQUIRED_ENV_VARS = [
  "CF_ACCOUNT_ID",
  "CF_R2_ACCESS_KEY_ID",
  "CF_R2_SECRET_ACCESS_KEY",
];

const BUCKET_NAME = "devicesdk-firmwares";

// Files to upload from dist/
const FIRMWARE_FILES = [
  "devicesdk-pico-w-client.uf2",
  "devicesdk-pico2-w-client.uf2",
];

function checkEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error("Error: Missing required environment variables:");
    missing.forEach((v) => console.error(`  - ${v}`));
    console.error("\nPlease set the following environment variables:");
    console.error("  CF_ACCOUNT_ID        - Your Cloudflare account ID");
    console.error("  CF_R2_ACCESS_KEY_ID  - R2 API token access key ID");
    console.error("  CF_R2_SECRET_ACCESS_KEY - R2 API token secret access key");
    process.exit(1);
  }
}

function createR2Client() {
  const accountId = process.env.CF_ACCOUNT_ID;

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
    },
  });
}

async function uploadFile(client, filePath, key) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileContent = readFileSync(filePath);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ContentType: "application/octet-stream",
  });

  await client.send(command);
  console.log(`Uploaded: ${key}`);
}

async function main() {
  console.log("Publishing firmwares to Cloudflare R2...\n");

  // Check environment variables
  checkEnvVars();

  // Get dist directory (relative to script location or cwd)
  const distDir = process.argv[2] || join(process.cwd(), "dist");

  if (!existsSync(distDir)) {
    console.error(`Error: dist directory not found: ${distDir}`);
    console.error("Please run 'make build' first to generate firmware files.");
    process.exit(1);
  }

  // Create R2 client
  const client = createR2Client();

  // Upload each firmware file
  let uploadCount = 0;
  for (const filename of FIRMWARE_FILES) {
    const filePath = join(distDir, filename);

    if (!existsSync(filePath)) {
      console.warn(`Warning: Skipping missing file: ${filename}`);
      continue;
    }

    try {
      await uploadFile(client, filePath, filename);
      uploadCount++;
    } catch (error) {
      console.error(`Error uploading ${filename}: ${error.message}`);
      process.exit(1);
    }
  }

  if (uploadCount === 0) {
    console.error("Error: No firmware files were uploaded.");
    process.exit(1);
  }

  console.log(`\nSuccessfully uploaded ${uploadCount} firmware file(s) to R2 bucket '${BUCKET_NAME}'.`);
}

main().catch((error) => {
  console.error("Unexpected error:", error.message);
  process.exit(1);
});
