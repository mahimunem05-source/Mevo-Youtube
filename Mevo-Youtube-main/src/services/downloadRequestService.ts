import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/utils/device";

export type DownloadRequestStatus = "none" | "pending" | "approved" | "rejected";

export interface DownloadRequestRecord {
  id: string;
  song_id: string;
  song_title?: string | null;
  song_artist?: string | null;
  device_id: string;
  user_id?: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at?: string | null;
}

/**
 * Checks the current download request status for a song from the active device.
 */
export async function getDownloadRequestStatus(songId: string, customDeviceId?: string): Promise<DownloadRequestStatus> {
  const deviceId = customDeviceId || getDeviceId();
  if (!songId || !deviceId) return "none";

  try {
    const { data, error } = await supabase
      .from("download_requests")
      .select("status")
      .eq("song_id", songId)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error || !data) {
      return "none";
    }

    return (data.status as DownloadRequestStatus) || "none";
  } catch (err) {
    console.warn("Could not check download request status:", err);
    return "none";
  }
}

/**
 * Submits a new download request to the database.
 */
export async function submitDownloadRequest(
  songId: string,
  songTitle?: string,
  songArtist?: string
): Promise<{ success: boolean; status: DownloadRequestStatus; message?: string }> {
  const deviceId = getDeviceId();
  if (!songId || !deviceId) {
    return { success: false, status: "none", message: "Missing song or device identifier." };
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;

    const { data, error } = await supabase
      .from("download_requests")
      .upsert(
        {
          song_id: songId,
          song_title: songTitle || null,
          song_artist: songArtist || null,
          device_id: deviceId,
          user_id: userId,
          status: "pending",
          created_at: new Date().toISOString(),
        },
        { onConflict: "song_id,device_id" }
      )
      .select("status")
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      status: (data?.status as DownloadRequestStatus) || "pending",
    };
  } catch (err: any) {
    console.error("Failed to submit download request:", err);
    return {
      success: false,
      status: "none",
      message: err.message || "Failed to submit request.",
    };
  }
}

/**
 * Admin: Fetch all download requests with optional status filter.
 */
export async function fetchAllDownloadRequests(status?: "pending" | "approved" | "rejected"): Promise<DownloadRequestRecord[]> {
  try {
    let query = supabase
      .from("download_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as DownloadRequestRecord[]) || [];
  } catch (err) {
    console.error("Failed to fetch download requests:", err);
    return [];
  }
}

/**
 * Admin: Approve a download request.
 */
export async function approveDownloadRequest(requestId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("download_requests")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Failed to approve download request:", err);
    return false;
  }
}

/**
 * Admin: Reject a download request.
 */
export async function rejectDownloadRequest(requestId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("download_requests")
      .update({
        status: "rejected",
        approved_at: null,
      })
      .eq("id", requestId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Failed to reject download request:", err);
    return false;
  }
}

/**
 * Admin: Delete a download request.
 */
export async function deleteDownloadRequest(requestId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("download_requests")
      .delete()
      .eq("id", requestId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Failed to delete download request:", err);
    return false;
  }
}
