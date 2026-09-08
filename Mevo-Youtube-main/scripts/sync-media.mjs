import { createClient } from "@supabase/supabase-js";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

// 1. Supabase Credentials
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

// 2. Backblaze Credentials
const B2_ENDPOINT = process.env.VITE_B2_ENDPOINT || "https://s3.us-east-005.backblazeb2.com";
const B2_KEY_ID = process.env.VITE_B2_KEY_ID || process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.VITE_B2_APPLICATION_KEY || process.env.B2_APPLICATION_KEY;
const BUCKET_NAME = process.env.VITE_B2_BUCKET || process.env.B2_BUCKET || "mevo-music";
const WORKER_BASE_URL = (
  process.env.VITE_CLOUDFLARE_DELIVERY_URL || "https://mevo-media.mahimunem05.workers.dev"
).replace(/\/+$/, "");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Error: Missing Supabase credentials in .env.local");
  process.exit(1);
}

if (!B2_KEY_ID || !B2_APPLICATION_KEY) {
  console.error("❌ Error: Missing Backblaze B2 credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const s3 = new S3Client({
  endpoint: B2_ENDPOINT,
  region: process.env.VITE_B2_REGION || "us-east-005",
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APPLICATION_KEY,
  },
});

async function getAllB2Files(prefix) {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  });
  const response = await s3.send(command);
  return (response.Contents || []).map((item) => item.Key);
}

function cleanString(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function syncDatabase() {
  console.log("Fetching files from Backblaze B2...");
  const b2Songs = await getAllB2Files("songs/");
  const b2Covers = await getAllB2Files("covers/");

  console.log("Fetching songs from Supabase...");
  const { data: dbSongs, error } = await supabase
    .from("songs")
    .select("id, title, audio_file, cover_image");

  if (error) {
    console.error("Supabase fetch error:", error);
    return;
  }

  console.log(`Processing ${dbSongs.length} songs...`);

  for (const song of dbSongs) {
    const cleanTitle = cleanString(song.title);

    // Match files from B2
    const matchedAudio = b2Songs.find((file) => cleanString(file).includes(cleanTitle));
    const matchedCover = b2Covers.find((file) => cleanString(file).includes(cleanTitle));

    const updates = {};
    if (matchedAudio) {
      updates.audio_file = `${WORKER_BASE_URL}/${matchedAudio}`;
    }
    if (matchedCover) {
      updates.cover_image = `${WORKER_BASE_URL}/${matchedCover}`;
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase.from("songs").update(updates).eq("id", song.id);

      if (updateError) {
        console.error(`❌ Failed to update ${song.title}:`, updateError.message);
      } else {
        console.log(`✅ Updated: ${song.title}`);
      }
    } else {
      console.log(`⚠️ No match found for: ${song.title}`);
    }
  }

  console.log("\n🎉 Synchronization Complete!");
}

syncDatabase();
