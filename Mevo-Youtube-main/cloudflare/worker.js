/**
 * Cloudflare Worker / Edge API Proxy for MEVO Secure Downloads
 *
 * Workflow:
 * 1. Validates `songId` and `deviceId` from query params.
 * 2. Checks Supabase `download_requests` table using SUPABASE_SERVICE_ROLE_KEY.
 * 3. If `status === 'approved'`: Streams the MP3 from Backblaze B2 / Extractor origin.
 * 4. If not approved: Returns 403 Forbidden ("Access Denied: Device not approved").
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-ID",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (url.pathname === "/api/download" || url.pathname === "/download") {
      const songId = url.searchParams.get("songId") || url.searchParams.get("id");
      const deviceId =
        url.searchParams.get("deviceId") || request.headers.get("X-Device-ID");

      if (!songId) {
        return new Response(JSON.stringify({ error: "Missing songId parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // 1. Verify Device Approval via Supabase Global Device Whitelist
      const supabaseUrl = env.SUPABASE_URL || "https://your-project.supabase.co";
      const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

      if (deviceId && supabaseKey) {
        try {
          // Check device_whitelist table
          const whitelistEndpoint = `${supabaseUrl}/rest/v1/device_whitelist?select=status&device_id=eq.${encodeURIComponent(
            deviceId
          )}&limit=1`;

          const checkRes = await fetch(whitelistEndpoint, {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              Accept: "application/json",
            },
          });

          if (!checkRes.ok) {
            return new Response(
              JSON.stringify({ error: "Failed to verify download authorization" }),
              {
                status: 500,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
              }
            );
          }

          const records = await checkRes.json();
          let isApproved = records.length > 0 && records[0].status === "approved";

          // Optional fallback to download_requests table if not found in device_whitelist
          if (!isApproved && (!records || records.length === 0)) {
            const cleanSongId = songId.replace(/^yt-/, "");
            const songReqEndpoint = `${supabaseUrl}/rest/v1/download_requests?select=status&device_id=eq.${encodeURIComponent(
              deviceId
            )}&or=(song_id.eq.${encodeURIComponent(cleanSongId)},song_id.eq.yt-${encodeURIComponent(
              cleanSongId
            )})&limit=1`;

            const songCheckRes = await fetch(songReqEndpoint, {
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                Accept: "application/json",
              },
            });

            if (songCheckRes.ok) {
              const songRecords = await songCheckRes.json();
              if (songRecords.length > 0 && songRecords[0].status === "approved") {
                isApproved = true;
              }
            }
          }

          if (!isApproved) {
            return new Response(
              JSON.stringify({
                error: "Access Denied: Device not approved for download.",
                code: 403,
              }),
              {
                status: 403,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
              }
            );
          }
        } catch (err) {
          return new Response(JSON.stringify({ error: "Internal authorization error" }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
      }

      // 2. Stream Audio File from Storage Origin (Backblaze B2 / Extractor Backend)
      const storageOrigin = env.STORAGE_ORIGIN || "http://localhost:5000";
      const originUrl = `${storageOrigin}/download?id=${encodeURIComponent(songId)}`;

      const audioResponse = await fetch(originUrl);
      if (!audioResponse.ok) {
        return new Response(JSON.stringify({ error: "Failed to retrieve audio stream" }), {
          status: audioResponse.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // 3. Return MP3 Stream with Attachment Headers
      const cleanFilename = (url.searchParams.get("title") || songId).replace(/[^\w\s-]/gi, "");
      const responseHeaders = new Headers(audioResponse.headers);
      responseHeaders.set("Content-Type", "audio/mpeg");
      responseHeaders.set(
        "Content-Disposition",
        `attachment; filename="${cleanFilename || "track"}.mp3"`
      );
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set(
        "Access-Control-Expose-Headers",
        "Content-Disposition, Content-Length"
      );

      return new Response(audioResponse.body, {
        status: 200,
        headers: responseHeaders,
      });
    }

    return new Response("MEVO Secure Audio Proxy Active", { status: 200 });
  },
};
