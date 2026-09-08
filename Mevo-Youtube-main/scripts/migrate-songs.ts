/**
 * Migration Script: Supabase Storage -> Public File Storage
 *
 * Downloads all existing audio files and cover images currently hosted on Supabase Storage (or external HTTP URLs)
 * and saves them into the local `public/music/` and `public/covers/` directories.
 * Then updates the database rows in Supabase to point to the new relative paths (/music/... and /covers/...).
 *
 * Usage:
 *   npx tsx scripts/migrate-songs.ts
 *   or
 *   node --import tsx scripts/migrate-songs.ts
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Environment Setup
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
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Error: Could not find VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const PUBLIC_DIR = join(process.cwd(), "public");

async function authenticateIfRequired() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (email && password) {
    console.log(`Authenticating as admin (${email})...`);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn(
        `Warning: Admin login failed (${error.message}). Operations requiring admin RLS may fail.`,
      );
    } else {
      console.log("✓ Authenticated as Admin.");
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFileName(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  return (
    nameWithoutExt
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "file"
  );
}

function getExtensionFromUrl(url: string, defaultExt: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && ext.length <= 4 && /^[a-z0-9]+$/.test(ext)) {
      return ext;
    }
  } catch {
    // ignore URL parse errors
  }
  return defaultExt;
}

function isRemoteUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

async function downloadAndSaveFile(
  url: string,
  folder: "music" | "covers",
  preferredName: string,
  defaultExt: string,
): Promise<string> {
  const ext = getExtensionFromUrl(url, defaultExt);
  const safeName = sanitizeFileName(preferredName);
  const uuid = crypto.randomUUID();
  const filename = `${uuid}-${safeName}.${ext}`;
  const relativePath = `/${folder}/${filename}`;

  const dirPath = join(PUBLIC_DIR, folder);
  const filePath = join(dirPath, filename);

  await mkdir(dirPath, { recursive: true });

  console.log(`Downloading: ${url} ...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download file (HTTP ${response.status} ${response.statusText}): ${url}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));

  console.log(`Saved locally: ${relativePath} (${arrayBuffer.byteLength} bytes)`);
  return relativePath;
}

// ---------------------------------------------------------------------------
// Migration Process
// ---------------------------------------------------------------------------

async function migrateSongs() {
  console.log("\n==========================================");
  console.log(" Starting Storage Migration for Songs...");
  console.log("==========================================\n");

  await authenticateIfRequired();

  const { data: songs, error } = await supabase.from("songs").select("*");

  if (error) {
    console.error("Error fetching songs from Supabase:", error);
    return;
  }

  if (!songs || songs.length === 0) {
    console.log("No songs found in the database.");
    return;
  }

  console.log(`Found ${songs.length} song(s) to process.\n`);

  let migratedCount = 0;

  for (const song of songs) {
    console.log(
      `\nProcessing Song [${song.id}]: "${song.title}" by ${song.artist_name || song.artist || "Unknown"}`,
    );

    const updates: Record<string, unknown> = {};

    // 1. Migrate Audio File
    if (isRemoteUrl(song.audio_file)) {
      try {
        const relativeAudio = await downloadAndSaveFile(
          song.audio_file,
          "music",
          song.title || "song",
          "mp3",
        );
        updates.audio_file = relativeAudio;
        updates.audio_path = relativeAudio;
      } catch (err) {
        console.error(`  x Failed to migrate audio for "${song.title}":`, err);
      }
    } else {
      console.log(`  ✓ Audio is already local: ${song.audio_file}`);
    }

    // 2. Migrate Cover Image
    if (isRemoteUrl(song.cover_image)) {
      try {
        const relativeCover = await downloadAndSaveFile(
          song.cover_image,
          "covers",
          song.title || "cover",
          "jpg",
        );
        updates.cover_image = relativeCover;
        updates.cover_path = relativeCover;
      } catch (err) {
        console.error(`  x Failed to migrate cover for "${song.title}":`, err);
      }
    } else if (song.cover_image) {
      console.log(`  ✓ Cover is already local: ${song.cover_image}`);
    }

    // 3. Update Database Row
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase.from("songs").update(updates).eq("id", song.id);

      if (updateError) {
        console.error(`  x Failed to update DB row for "${song.title}":`, updateError);
      } else {
        console.log(`  ✓ DB updated successfully for "${song.title}"`);
        migratedCount++;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Migrate Custom Albums (if any)
  // ---------------------------------------------------------------------------

  const { data: customAlbums } = await supabase.from("custom_albums").select("*");

  if (customAlbums && customAlbums.length > 0) {
    console.log(`\n\nChecking ${customAlbums.length} Custom Album(s)...`);

    for (const album of customAlbums) {
      if (isRemoteUrl(album.cover_image)) {
        try {
          const relativeCover = await downloadAndSaveFile(
            album.cover_image,
            "covers",
            album.title || "album-cover",
            "jpg",
          );

          await supabase
            .from("custom_albums")
            .update({
              cover_image: relativeCover,
              cover_path: relativeCover,
            })
            .eq("id", album.id);

          console.log(`  ✓ Custom album "${album.title}" cover migrated to ${relativeCover}`);
        } catch (err) {
          console.error(`  x Failed to migrate album cover for "${album.title}":`, err);
        }
      }
    }
  }

  console.log("\n==========================================");
  console.log(` Migration Finished! Total Updated: ${migratedCount}`);
  console.log("==========================================\n");
}

migrateSongs().catch((error) => {
  console.error("Migration failed unexpectedly:", error);
  process.exit(1);
});
