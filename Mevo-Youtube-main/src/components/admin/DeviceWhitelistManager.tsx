import React, { useEffect, useState, useMemo } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Trash2,
  RefreshCw,
  Search,
  Smartphone,
  Laptop,
  Globe,
  CheckCircle2,
  Lock,
  Unlock,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import {
  fetchAllWhitelistedDevices,
  approveDeviceAccess,
  revokeDeviceAccess,
  deleteDeviceFromWhitelist,
  type WhitelistedDeviceRecord,
  type DeviceAccessStatus,
} from "@/services/deviceWhitelistService";
import { subscribeToRealtimeChanges } from "@/lib/realtime-helper";
import { toast } from "sonner";

export function DeviceWhitelistManager() {
  const [devices, setDevices] = useState<WhitelistedDeviceRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "approved" | "revoked">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadDevices = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllWhitelistedDevices();
      setDevices(data);
    } catch (err) {
      toast.error("Failed to load device whitelist.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDevices();

    // Setup Supabase Realtime for automatic updates when devices register or change
    const cleanup = subscribeToRealtimeChanges("admin-device-whitelist-sync", [
      {
        table: "device_whitelist",
        callback: () => {
          void loadDevices();
        },
      },
    ]);

    return cleanup;
  }, []);

  const handleApprove = async (device: WhitelistedDeviceRecord) => {
    setActionInProgress(device.id);
    const ok = await approveDeviceAccess(device.id);
    setActionInProgress(null);
    if (ok) {
      toast.success(`Approved device access for ${device.device_name || device.device_id.slice(0, 8)}`);
      setDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, status: "approved", updated_at: new Date().toISOString() } : d))
      );
    } else {
      toast.error("Failed to approve device.");
    }
  };

  const handleRevoke = async (device: WhitelistedDeviceRecord) => {
    setActionInProgress(device.id);
    const ok = await revokeDeviceAccess(device.id);
    setActionInProgress(null);
    if (ok) {
      toast.warning(`Revoked download access for ${device.device_name || device.device_id.slice(0, 8)}`);
      setDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, status: "revoked", updated_at: new Date().toISOString() } : d))
      );
    } else {
      toast.error("Failed to revoke device access.");
    }
  };

  const handleDelete = async (device: WhitelistedDeviceRecord) => {
    if (!confirm(`Are you sure you want to remove device "${device.device_name || device.device_id}" from the whitelist database?`)) {
      return;
    }
    setActionInProgress(device.id);
    const ok = await deleteDeviceFromWhitelist(device.id);
    setActionInProgress(null);
    if (ok) {
      toast.success("Device removed from whitelist.");
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
    } else {
      toast.error("Failed to delete device.");
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.info("Device ID copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const matchesTab = activeTab === "all" || device.status === activeTab;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        device.device_id.toLowerCase().includes(query) ||
        (device.device_name && device.device_name.toLowerCase().includes(query));
      return matchesTab && matchesSearch;
    });
  }, [devices, activeTab, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: devices.length,
      pending: devices.filter((d) => d.status === "pending").length,
      approved: devices.filter((d) => d.status === "approved").length,
      revoked: devices.filter((d) => d.status === "revoked").length,
    };
  }, [devices]);

  const getDeviceIcon = (name?: string | null) => {
    const lower = (name || "").toLowerCase();
    if (lower.includes("mobile") || lower.includes("android") || lower.includes("iphone")) {
      return <Smartphone className="size-4 text-emerald-400" />;
    }
    if (lower.includes("mac") || lower.includes("windows") || lower.includes("desktop")) {
      return <Laptop className="size-4 text-cyan-400" />;
    }
    return <Globe className="size-4 text-purple-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.03] border border-white/10 p-5 rounded-2xl backdrop-blur-md">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <ShieldCheck className="size-6 text-[#4FD1C5]" />
            Global Device Whitelist & Access Revocation
          </h2>
          <p className="text-sm text-white/60 mt-1">
            Authorize or revoke complete MP3 download permissions across the entire platform per device.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadDevices()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin text-[#4FD1C5]" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-black/40 border border-white/10 rounded-xl overflow-x-auto">
          {(["all", "pending", "approved", "revoked"] as const).map((tab) => {
            const isActive = activeTab === tab;
            const badgeCount = counts[tab];
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-[#4FD1C5]/20 text-[#4FD1C5] border border-[#4FD1C5]/30 shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <span className="capitalize">{tab}</span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                    tab === "pending" && badgeCount > 0
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                      : isActive
                        ? "bg-[#4FD1C5]/30 text-[#4FD1C5]"
                        : "bg-white/10 text-white/60"
                  }`}
                >
                  {badgeCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative min-w-[260px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            type="text"
            placeholder="Search by Device ID or Browser/OS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#4FD1C5]/50 transition-colors"
          />
        </div>
      </div>

      {/* Devices List Table */}
      <div className="overflow-x-auto border border-white/10 rounded-2xl bg-black/20 backdrop-blur-sm">
        <table className="w-full text-left text-xs text-white/80">
          <thead className="border-b border-white/10 bg-white/[0.02] text-white/50 text-[11px] font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3.5 px-4">Device / Hardware</th>
              <th className="py-3.5 px-4">Device ID</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4">Requested Date</th>
              <th className="py-3.5 px-4">Last Updated</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-white/40">
                  <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-[#4FD1C5]" />
                  Loading registered devices...
                </td>
              </tr>
            ) : filteredDevices.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-white/40">
                  <AlertCircle className="size-8 mx-auto mb-2 text-white/20" />
                  No devices found in this view.
                </td>
              </tr>
            ) : (
              filteredDevices.map((device) => {
                const isCurrentAction = actionInProgress === device.id;
                return (
                  <tr
                    key={device.id}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Device / Hardware Info */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                          {getDeviceIcon(device.device_name)}
                        </div>
                        <div>
                          <div className="font-semibold text-white">
                            {device.device_name || "Unknown Hardware"}
                          </div>
                          <div className="text-[11px] text-white/40">
                            {device.user_id ? "Registered User" : "Anonymous Client"}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Device ID */}
                    <td className="py-4 px-4 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5 text-white/70">
                        <span>{device.device_id.slice(0, 16)}...</span>
                        <button
                          onClick={() => handleCopy(device.device_id, device.id)}
                          title="Copy Full Device ID"
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-opacity cursor-pointer"
                        >
                          {copiedId === device.id ? (
                            <Check className="size-3 text-emerald-400" />
                          ) : (
                            <Copy className="size-3 text-white/40 hover:text-white" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 px-4">
                      {device.status === "approved" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="size-3" />
                          Approved
                        </span>
                      )}
                      {device.status === "pending" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 animate-pulse">
                          <Clock className="size-3" />
                          Pending Review
                        </span>
                      )}
                      {device.status === "revoked" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          <ShieldAlert className="size-3" />
                          Revoked / Locked
                        </span>
                      )}
                    </td>

                    {/* Requested Date */}
                    <td className="py-4 px-4 text-white/50 text-[11px]">
                      {new Date(device.requested_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    {/* Last Updated */}
                    <td className="py-4 px-4 text-white/50 text-[11px]">
                      {new Date(device.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {device.status !== "approved" && (
                          <button
                            onClick={() => void handleApprove(device)}
                            disabled={isCurrentAction}
                            title="Approve Device for MP3 Downloads"
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <Unlock className="size-3" />
                            Approve
                          </button>
                        )}

                        {device.status === "approved" && (
                          <button
                            onClick={() => void handleRevoke(device)}
                            disabled={isCurrentAction}
                            title="Revoke / Lock Downloads for this Device"
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <Lock className="size-3" />
                            Revoke Access
                          </button>
                        )}

                        <button
                          onClick={() => void handleDelete(device)}
                          disabled={isCurrentAction}
                          title="Delete Device record"
                          className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DeviceWhitelistManager;
