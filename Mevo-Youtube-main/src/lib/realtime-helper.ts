import { supabase } from "@/lib/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export interface PostgresChangesOption {
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema?: string;
  table: string;
  filter?: string;
  callback: (payload: RealtimePostgresChangesPayload<Record<string, any>>) => void;
}

/**
 * Safe Supabase Realtime channel subscription helper.
 *
 * Prevents:
 * 1. "cannot add postgres_changes callbacks for realtime:... after subscribe()"
 * 2. Unhandled exceptions during mount/unmount or React StrictMode double mounts.
 * 3. Blank screens / crashes during fast route navigation (e.g. Home -> Song -> Back -> Album).
 * 4. Non-blocking: failures log a warning without breaking page rendering or route navigation.
 */
export function subscribeToRealtimeChanges(
  channelBaseName: string,
  configs: PostgresChangesOption[],
): () => void {
  let channel: RealtimeChannel | null = null;
  let isCleanedUp = false;

  try {
    // Clean up any existing channels in Supabase's client-side registry with similar topic
    const currentChannels = supabase.getChannels();
    for (const ch of currentChannels) {
      if (
        ch.topic === `realtime:${channelBaseName}` ||
        ch.topic === channelBaseName ||
        ch.topic.startsWith(`realtime:${channelBaseName}-`) ||
        ch.topic.startsWith(`${channelBaseName}-`)
      ) {
        try {
          void supabase.removeChannel(ch);
        } catch {
          /* ignore */
        }
      }
    }

    // Always use a unique topic per mount to prevent reuse of ALREADY SUBSCRIBED channels
    const uniqueTopic = `${channelBaseName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let newChannel = supabase.channel(uniqueTopic);

    // Attach ALL callbacks BEFORE calling subscribe()
    for (const config of configs) {
      newChannel = newChannel.on(
        "postgres_changes" as any,
        {
          event: config.event || "*",
          schema: config.schema || "public",
          table: config.table,
          filter: config.filter,
        },
        (payload) => {
          if (!isCleanedUp) {
            try {
              config.callback(payload);
            } catch (err) {
              console.warn("Realtime callback execution error:", err);
            }
          }
        },
      );
    }

    // Subscribe safely in a non-blocking way
    newChannel.subscribe((status, err) => {
      if (err) {
        console.warn(`Realtime subscription status [${status}] for ${uniqueTopic}:`, err);
      }
    });

    channel = newChannel;
  } catch (error) {
    // Non-blocking: realtime failures must NEVER crash page rendering or navigation
    console.warn(`Failed to initialize realtime channel for ${channelBaseName}:`, error);
  }

  return () => {
    isCleanedUp = true;
    if (channel) {
      try {
        void supabase.removeChannel(channel);
      } catch (err) {
        console.warn(`Error removing channel ${channelBaseName}:`, err);
      }
    }
  };
}
