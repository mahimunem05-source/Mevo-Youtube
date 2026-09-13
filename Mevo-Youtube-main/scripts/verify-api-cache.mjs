import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = fs.readFileSync(".env.local", "utf-8");
const url = env.match(/VITE_SUPABASE_URL=([^\r\n]+)/)[1].trim();
const key = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=([^\r\n]+)/)[1].trim();

const supabase = createClient(url, key);

async function verify() {
  console.log("Checking api_cache table at:", url);
  const { data, error } = await supabase.from("api_cache").select("*").limit(1);

  if (error) {
    console.error("api_cache verification FAILED:", error.message);
    process.exit(1);
  }

  console.log("api_cache table EXISTS and is accessible via PostgREST!");
  
  // Test write and read
  const testKey = "test:verification_" + Date.now();
  const testPayload = { test: true, timestamp: Date.now() };
  const expiresAt = new Date(Date.now() + 60000).toISOString();

  const { error: insertErr } = await supabase.from("api_cache").upsert({
    cache_key: testKey,
    cache_type: "test",
    data: testPayload,
    expires_at: expiresAt,
  });

  if (insertErr) {
    console.error("api_cache write test FAILED:", insertErr.message);
    process.exit(1);
  }

  const { data: readData, error: readErr } = await supabase
    .from("api_cache")
    .select("*")
    .eq("cache_key", testKey)
    .single();

  if (readErr || !readData) {
    console.error("api_cache read test FAILED:", readErr?.message);
    process.exit(1);
  }

  console.log("api_cache read/write test PASSED:", readData.cache_key);

  // Clean up test entry
  await supabase.from("api_cache").delete().eq("cache_key", testKey);
  console.log("api_cache test cleanup completed successfully.");
}

verify().catch((err) => {
  console.error("Error running verification:", err);
  process.exit(1);
});
