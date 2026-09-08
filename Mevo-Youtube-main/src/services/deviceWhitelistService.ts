import { supabase } from "@/lib/supabase";
import { getDeviceId, getDeviceName } from "@/utils/device";

export type DeviceAccessStatus = "unregistered" | "pending" | "approved" | "revoked";

export interface WhitelistedDeviceRecord {
  id: string;
  device_id: string;
  device_name?: string | null;
  user_id?: string | null;
  status: "pending" | "approved" | "revoked";
  requested_at: string;
  updated_at: string;
}

/**
 * Checks the whitelist status of the current (or given) device ID against Supabase.
 */
export async function getDeviceWhitelistStatus(customDeviceId?: string): Promise<DeviceAccessStatus> {
  const deviceId = customDeviceId || getDeviceId();
  if (!deviceId || deviceId === "mevo_server_environment") return "unregistered";

  try {
    const { data, error } = await supabase
      .from("device_whitelist")
      .select("status")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error || !data) {
      return "unregistered";
    }

    const rawStatus = String(data.status || "").toLowerCase().trim();
    if (rawStatus === "approved") return "approved";
    if (rawStatus === "pending") return "pending";
    if (rawStatus === "revoked") return "revoked";
    return (rawStatus as DeviceAccessStatus) || "unregistered";
  } catch (err) {
    console.warn("Could not check device whitelist status:", err);
    return "unregistered";
  }
}

/**
 * Submits a global whitelist access request for this device.
 */
export async function requestDeviceWhitelistAccess(
  customDeviceName?: string
): Promise<{ success: boolean; status: DeviceAccessStatus; message?: string }> {
  const deviceId = getDeviceId();
  const deviceName = customDeviceName || getDeviceName();

  if (!deviceId) {
    return { success: false, status: "unregistered", message: "Missing device identifier." };
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("device_whitelist")
      .upsert(
        {
          device_id: deviceId,
          device_name: deviceName,
          user_id: userId,
          status: "pending",
          updated_at: now,
        },
        { onConflict: "device_id" }
      )
      .select("status")
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      status: (data?.status as DeviceAccessStatus) || "pending",
    };
  } catch (err: any) {
    console.error("Failed to request device whitelist access:", err);
    return {
      success: false,
      status: "unregistered",
      message: err.message || "Failed to submit device access request.",
    };
  }
}

/**
 * Admin: Fetch all registered devices with optional status filter.
 */
export async function fetchAllWhitelistedDevices(
  statusFilter?: "pending" | "approved" | "revoked"
): Promise<WhitelistedDeviceRecord[]> {
  try {
    let query = supabase
      .from("device_whitelist")
      .select("*")
      .order("requested_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as WhitelistedDeviceRecord[]) || [];
  } catch (err) {
    console.error("Failed to fetch whitelisted devices:", err);
    return [];
  }
}

/**
 * Admin: Approve a device for site-wide MP3 downloads.
 */
export async function approveDeviceAccess(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("device_whitelist")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Failed to approve device access:", err);
    return false;
  }
}

/**
 * Admin: Revoke / Lock download permissions for a device.
 */
export async function revokeDeviceAccess(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("device_whitelist")
      .update({
        status: "revoked",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Failed to revoke device access:", err);
    return false;
  }
}

/**
 * Admin: Remove a device record from the whitelist table.
 */
export async function deleteDeviceFromWhitelist(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("device_whitelist")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Failed to delete device from whitelist:", err);
    return false;
  }
}
