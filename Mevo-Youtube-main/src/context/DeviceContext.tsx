import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId, getDeviceName } from "@/utils/device";
import {
  getDeviceWhitelistStatus,
  requestDeviceWhitelistAccess,
  type DeviceAccessStatus,
} from "@/services/deviceWhitelistService";
import { toast } from "sonner";

interface DeviceAccessContextType {
  deviceId: string;
  deviceName: string;
  status: DeviceAccessStatus;
  isApproved: boolean;
  isDownloadUnlocked: boolean;
  isLoading: boolean;
  requestAccess: (customName?: string) => Promise<boolean>;
  refetchStatus: () => Promise<void>;
}

const DeviceAccessContext = createContext<DeviceAccessContextType | null>(null);

export function DeviceAccessProvider({ children }: { children: React.ReactNode }) {
  // Always use the persistent device ID from localStorage / memory cache
  const [deviceId] = useState<string>(() => getDeviceId());
  const [deviceName] = useState<string>(() => getDeviceName());
  const [status, setStatus] = useState<DeviceAccessStatus>("unregistered");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Status fetcher
  const checkStatus = useCallback(async () => {
    try {
      const currentStatus = await getDeviceWhitelistStatus(deviceId);
      setStatus(currentStatus);
    } catch (err) {
      console.warn("Failed to check device whitelist status:", err);
      setStatus("unregistered");
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  // Initial fetch on mount
  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  // Periodic polling & Window Focus / Tab Visibility Sync
  useEffect(() => {
    // 1. Check when tab becomes visible or receives window focus
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void checkStatus();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    // 2. Periodic poll every 20 seconds
    const interval = setInterval(() => {
      void checkStatus();
    }, 20000);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      clearInterval(interval);
    };
  }, [checkStatus]);

  // Instant Supabase Realtime synchronization for this specific device
  useEffect(() => {
    if (!deviceId || deviceId === "mevo_server_environment") return;

    const channelName = `realtime-device-whitelist-${deviceId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "device_whitelist",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setStatus("unregistered");
            toast.info("Device download registration was removed.");
          } else if (payload.new && (payload.new as { status?: string }).status) {
            const raw = String((payload.new as { status: string }).status || "").toLowerCase().trim();
            const newStatus: DeviceAccessStatus =
              raw === "approved" ? "approved" : raw === "pending" ? "pending" : raw === "revoked" ? "revoked" : "unregistered";

            setStatus(newStatus);

            if (newStatus === "approved") {
              toast.success("Device Whitelist Approved! All MP3 downloads are now unlocked.", {
                duration: 4500,
              });
            } else if (newStatus === "revoked") {
              toast.error("Device download access has been revoked by admin.", {
                duration: 4000,
              });
            }
          }
        }
      )
      .subscribe((subStatus) => {
        if (subStatus === "SUBSCRIBED") {
          // Re-check once subscribed to prevent any race condition
          void getDeviceWhitelistStatus(deviceId).then((latest) => {
            setStatus((prev) => (prev !== latest ? latest : prev));
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [deviceId]);

  const requestAccess = useCallback(
    async (customName?: string): Promise<boolean> => {
      setIsLoading(true);
      const result = await requestDeviceWhitelistAccess(customName || deviceName);
      setIsLoading(false);

      if (result.success) {
        setStatus(result.status);
        toast.info("Device registration submitted! Waiting for Admin approval.", {
          duration: 3500,
        });
        return true;
      } else {
        toast.error(result.message || "Failed to submit device whitelist request.");
        return false;
      }
    },
    [deviceName]
  );

  const isApproved = status === "approved";

  const value: DeviceAccessContextType = {
    deviceId,
    deviceName,
    status,
    isApproved,
    isDownloadUnlocked: isApproved,
    isLoading,
    requestAccess,
    refetchStatus: checkStatus,
  };

  return (
    <DeviceAccessContext.Provider value={value}>
      {children}
    </DeviceAccessContext.Provider>
  );
}

export function useDeviceAccess(): DeviceAccessContextType {
  const ctx = useContext(DeviceAccessContext);
  if (!ctx) {
    throw new Error("useDeviceAccess must be used within a DeviceAccessProvider");
  }
  return ctx;
}

export default DeviceAccessProvider;
