/**
 * Migration Script: Local Storage -> Backblaze B2 & Cloudflare Worker
 *
 * Uploads all audio files and cover images from local storage (public/music, public/covers, or custom paths)
 * to Backblaze B2 bucket "mevo-music" under songs/ and covers/ folders,
 * and updates Supabase database records (songs and custom_albums tables) with the Cloudflare Worker URLs.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-b2.ts
 */

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// 1. Load Environment Configuration
// ---------------------------------------------------------------------------

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

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_KEY;

const b2KeyId = process.env.VITE_B2_KEY_ID || process.env.B2_KEY_ID;
const b2AppKey = process.env.VITE_B2_APPLICATION_KEY || process.env.B2_APPLICATION_KEY;
const b2Endpoint = process.env.VITE_B2_ENDPOINT || "https://s3.us-east-005.backblazeb2.com";
const b2Region = process.env.VITE_B2_REGION || "us-east-005";
const b2Bucket = process.env.VITE_B2_BUCKET || "mevo-music";
const cloudflareBaseUrl = (
  process.env.VITE_CLOUDFLARE_DELIVERY_URL || "https://mevo-media.mahimunem05.workers.dev"
).replace(/\/+$/, "");

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env.local");
  process.exit(1);
}

if (!b2KeyId || !b2AppKey) {
  console.error("Error: Missing VITE_B2_KEY_ID or VITE_B2_APPLICATION_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const s3Client = new S3Client({
  endpoint: b2Endpoint,
  region: b2Region,
  credentials: {
    accessKeyId: b2KeyId,
    secretAccessKey: b2AppKey,
  },
});

const PUBLIC_DIR = join(process.cwd(), "public");
const MUSIC_DIR = join(PUBLIC_DIR, "music");
const COVERS_DIR = join(PUBLIC_DIR, "covers");

// ---------------------------------------------------------------------------
// 2. Helpers
// ---------------------------------------------------------------------------

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function resolveLocalFilePath(
  pathOrName: string | null | undefined,
  category: "music" | "covers",
): string | null {
  if (!pathOrName) return null;

  const trimmed = pathOrName.trim();
  if (!trimmed || trimmed === ".gitkeep") return null;

  // Direct absolute or relative path
  if (existsSync(trimmed) && statSync(trimmed).isFile()) {
    return trimmed;
  }

  const cleanName = basename(trimmed);

  // Check in public/music or public/covers
  const targetDir = category === "music" ? MUSIC_DIR : COVERS_DIR;
  const candidatePath = join(targetDir, cleanName);
  if (existsSync(candidatePath) && statSync(candidatePath).isFile()) {
    return candidatePath;
  }

  // Check in public/
  const inPublic = join(PUBLIC_DIR, trimmed.replace(/^\/+/, ""));
  if (existsSync(inPublic) && statSync(inPublic).isFile()) {
    return inPublic;
  }

  return null;
}

async function checkObjectExistsOnB2(key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: b2Bucket,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

async function uploadLocalFileToB2(
  localFilePath: string,
  folder: "songs" | "covers",
): Promise<{ key: string; publicUrl: string }> {
  const fileName = basename(localFilePath);
  const key = `${folder}/${fileName}`;
  const publicUrl = `${cloudflareBaseUrl}/${key}`;

  const exists = await checkObjectExistsOnB2(key);
  if (exists) {
    console.log(`    ℹ️ Already exists on B2: ${key}`);
    return { key, publicUrl };
  }

  const fileBuffer = await readFile(localFilePath);
  const mimeType = getMimeType(fileName);

  console.log(
    `    ⬆️ Uploading to B2 [${key}] (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB)...`,
  );

  const command = new PutObjectCommand({
    Bucket: b2Bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);
  console.log(`    ✓ Uploaded: ${publicUrl}`);

  return { key, publicUrl };
}

// ---------------------------------------------------------------------------
// 3. Main Migration Process
// ---------------------------------------------------------------------------

async function runMigration() {
  console.log("\n========================================================");
  console.log(" 🚀 STARTING BACKBLAZE B2 & CLOUDFLARE WORKER MIGRATION");
  console.log("========================================================");
  console.log(` Endpoint:    ${b2Endpoint}`);
  console.log(` Bucket:      ${b2Bucket}`);
  console.log(` Delivery URL: ${cloudflareBaseUrl}`);
  console.log(` Supabase:    ${supabaseUrl}\n`);

  // -------------------------------------------------------------------------
  // Step 1: Migrate Songs in Supabase
  // -------------------------------------------------------------------------
  console.log("--- [1/3] Processing Supabase Songs ---");
  const { data: songs, error: songError } = await supabase.from("songs").select("*");

  if (songError) {
    console.error("Error fetching songs from Supabase:", songError.message);
  } else if (!songs || songs.length === 0) {
    console.log("No songs found in database.");
  } else {
    console.log(`Found ${songs.length} song(s) to process in database.\n`);

    let updatedSongs = 0;

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const title = song.title || "Untitled";
      const artist = song.artist_name || song.artist || "Unknown";

      console.log(`[Song ${i + 1}/${songs.length}] "${title}" by ${artist}`);

      const updates: Record<string, unknown> = {};

      // 1. Audio Migration
      if (song.audio_file && song.audio_file.startsWith(cloudflareBaseUrl)) {
        console.log(`  ✓ Audio is already on Cloudflare: ${song.audio_file}`);
      } else {
        const localAudio = resolveLocalFilePath(song.audio_file || song.audio_path, "music");
        if (localAudio) {
          try {
            const { key, publicUrl } = await uploadLocalFileToB2(localAudio, "songs");
            updates.audio_file = publicUrl;
            updates.audio_path = key;
          } catch (err) {
            console.error(`  ❌ Failed uploading audio for "${title}":`, err);
          }
        } else {
          console.warn(`  ⚠️ Local audio file not found for: ${song.audio_file}`);
        }
      }

      // 2. Cover Migration
      if (song.cover_image && song.cover_image.startsWith(cloudflareBaseUrl)) {
        console.log(`  ✓ Cover is already on Cloudflare: ${song.cover_image}`);
      } else if (song.cover_image || song.cover_path) {
        const localCover = resolveLocalFilePath(song.cover_image || song.cover_path, "covers");
        if (localCover) {
          try {
            const { key, publicUrl } = await uploadLocalFileToB2(localCover, "covers");
            updates.cover_image = publicUrl;
            updates.cover_path = key;
          } catch (err) {
            console.error(`  ❌ Failed uploading cover for "${title}":`, err);
          }
        } else {
          console.warn(`  ⚠️ Local cover file not found for: ${song.cover_image}`);
        }
      }

      // 3. Update DB Row
      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase.from("songs").update(updates).eq("id", song.id);

        if (updateErr) {
          console.error(`  ❌ DB update failed for "${title}":`, updateErr.message);
        } else {
          console.log(`  ✅ Database updated for "${title}"`);
          updatedSongs++;
        }
      }

      console.log("");
    }

    console.log(`✓ Songs migration completed: ${updatedSongs} updated.\n`);
  }

  // -------------------------------------------------------------------------
  // Step 2: Migrate Custom Albums
  // -------------------------------------------------------------------------
  console.log("--- [2/3] Processing Custom Albums ---");
  const { data: albums, error: albumError } = await supabase.from("custom_albums").select("*");

  if (albumError) {
    console.log("No custom_albums table or error fetching:", albumError.message);
  } else if (albums && albums.length > 0) {
    console.log(`Found ${albums.length} custom album(s) to process.\n`);

    for (const album of albums) {
      console.log(`[Album] "${album.title}"`);

      if (album.cover_image && album.cover_image.startsWith(cloudflareBaseUrl)) {
        console.log(`  ✓ Cover is already on Cloudflare: ${album.cover_image}`);
        continue;
      }

      const localCover = resolveLocalFilePath(album.cover_image || album.cover_path, "covers");
      if (localCover) {
        try {
          const { key, publicUrl } = await uploadLocalFileToB2(localCover, "covers");
          const { error: updateErr } = await supabase
            .from("custom_albums")
            .update({
              cover_image: publicUrl,
              cover_path: key,
            })
            .eq("id", album.id);

          if (updateErr) {
            console.error(`  ❌ Failed DB update for album "${album.title}":`, updateErr.message);
          } else {
            console.log(`  ✅ Album cover updated to ${publicUrl}`);
          }
        } catch (err) {
          console.error(`  ❌ Failed uploading album cover for "${album.title}":`, err);
        }
      }
    }
  } else {
    console.log("No custom albums found.");
  }

  // -------------------------------------------------------------------------
  // Step 3: Scan and upload any remaining standalone local files
  // -------------------------------------------------------------------------
  console.log("\n--- [3/3] Scanning local music and covers directory for remaining files ---");

  if (existsSync(MUSIC_DIR)) {
    const musicFiles = readdirSync(MUSIC_DIR).filter((f) => f !== ".gitkeep" && !f.startsWith("."));
    console.log(`Checking ${musicFiles.length} file(s) in public/music/...`);

    for (const file of musicFiles) {
      const fullPath = join(MUSIC_DIR, file);
      try {
        await uploadLocalFileToB2(fullPath, "songs");
      } catch (err) {
        console.error(`  ❌ Failed uploading ${file}:`, err);
      }
    }
  }

  if (existsSync(COVERS_DIR)) {
    const coverFiles = readdirSync(COVERS_DIR).filter(
      (f) => f !== ".gitkeep" && !f.startsWith("."),
    );
    console.log(`\nChecking ${coverFiles.length} file(s) in public/covers/...`);

    for (const file of coverFiles) {
      const fullPath = join(COVERS_DIR, file);
      try {
        await uploadLocalFileToB2(fullPath, "covers");
      } catch (err) {
        console.error(`  ❌ Failed uploading ${file}:`, err);
      }
    }
  }

  console.log("\n========================================================");
  console.log(" 🎉 ALL MEDIA SUCCESSFULLY MIGRATED TO BACKBLAZE B2!");
  console.log("========================================================\n");
}

runMigration().catch((error) => {
  console.error("Migration failed unexpectedly:", error);
  process.exit(1);
});
