import React, { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  RefreshCw,
  Search,
  Download,
  Smartphone,
  Music,
  Filter,
} from "lucide-react";
import {
  fetchAllDownloadRequests,
  approveDownloadRequest,
  rejectDownloadRequest,
  deleteDownloadRequest,
  type DownloadRequestRecord,
} from "@/services/downloadRequestService";
import { subscribeToRealtimeChanges } from "@/lib/realtime-helper";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function DownloadRequestsManager() {
  const [requests, setRequests] = useState<DownloadRequestRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllDownloadRequests();
      setRequests(data);
    } catch (err) {
      toast.error("Failed to load download requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  // Realtime updates when requests are added or modified
  useEffect(() => {
    const cleanup = subscribeToRealtimeChanges("admin-download-requests-sync", [
      {
        table: "download_requests",
        callback: () => {
          void loadRequests();
        },
      },
    ]);
    return cleanup;
  }, [loadRequests]);

  const handleApprove = async (id: string, songName?: string | null) => {
    setProcessingId(id);
    const success = await approveDownloadRequest(id);
    setProcessingId(null);
    if (success) {
      toast.success(`Approved download request for "${songName || 'Track'}"`);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: "approved", approved_at: new Date().toISOString() } : r
        )
      );
    } else {
      toast.error("Could not approve download request.");
    }
  };

  const handleReject = async (id: string, songName?: string | null) => {
    setProcessingId(id);
    const success = await rejectDownloadRequest(id);
    setProcessingId(null);
    if (success) {
      toast.info(`Rejected download request for "${songName || 'Track'}"`);
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "rejected" } : r))
      );
    } else {
      toast.error("Could not reject download request.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this request record?")) return;
    setProcessingId(id);
    const success = await deleteDownloadRequest(id);
    setProcessingId(null);
    if (success) {
      toast.success("Download request record deleted.");
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } else {
      toast.error("Could not delete request record.");
    }
  };

  // Filter & search processing
  const filtered = requests.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.song_id.toLowerCase().includes(q) ||
        r.device_id.toLowerCase().includes(q) ||
        (r.song_title && r.song_title.toLowerCase().includes(q)) ||
        (r.song_artist && r.song_artist.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;

  return (
    <div className="space-y-6">
      {/* Header & Quick Metric Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-6 text-teal-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">
              Download Authorization & Requests
            </h2>
          </div>
          <p className="text-xs text-white/60 mt-1">
            Review and approve device download requests for high-fidelity offline playback.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadRequests()}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin text-teal-400")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setFilterStatus("pending")}
          className={cn(
            "rounded-xl border p-3.5 transition-all cursor-pointer",
            filterStatus === "pending"
              ? "border-amber-500/50 bg-amber-500/15"
              : "border-white/10 bg-white/5 hover:bg-white/[0.08]"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400">Pending</span>
            <Clock className="size-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-white">{pendingCount}</p>
        </div>

        <div
          onClick={() => setFilterStatus("approved")}
          className={cn(
            "rounded-xl border p-3.5 transition-all cursor-pointer",
            filterStatus === "approved"
              ? "border-teal-500/50 bg-teal-500/15"
              : "border-white/10 bg-white/5 hover:bg-white/[0.08]"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-teal-400">Approved</span>
            <CheckCircle2 className="size-4 text-teal-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-white">{approvedCount}</p>
        </div>

        <div
          onClick={() => setFilterStatus("rejected")}
          className={cn(
            "rounded-xl border p-3.5 transition-all cursor-pointer",
            filterStatus === "rejected"
              ? "border-red-500/50 bg-red-500/15"
              : "border-white/10 bg-white/5 hover:bg-white/[0.08]"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-400">Rejected</span>
            <XCircle className="size-4 text-red-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-white">{rejectedCount}</p>
        </div>

        <div
          onClick={() => setFilterStatus("all")}
          className={cn(
            "rounded-xl border p-3.5 transition-all cursor-pointer",
            filterStatus === "all"
              ? "border-white/30 bg-white/15"
              : "border-white/10 bg-white/5 hover:bg-white/[0.08]"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/80">Total Requests</span>
            <Download className="size-4 text-white/60" />
          </div>
          <p className="mt-2 text-2xl font-black text-white">{requests.length}</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            type="text"
            placeholder="Search by song name, artist, song ID, or device ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-4 text-xs sm:text-sm text-white placeholder-white/40 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {(["all", "pending", "approved", "rejected"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer",
                filterStatus === status
                  ? "bg-teal-400/20 text-teal-300 border border-teal-400/40"
                  : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white"
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Management Table */}
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md">
        <table className="w-full text-left text-xs sm:text-sm text-white/80">
          <thead className="border-b border-white/10 bg-white/5 text-[11px] font-bold uppercase tracking-wider text-white/60">
            <tr>
              <th className="py-3.5 px-4">Song Information</th>
              <th className="py-3.5 px-4">Device ID</th>
              <th className="py-3.5 px-4">Request Date</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-white/50">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="size-6 animate-spin text-teal-400" />
                    <span>Loading download requests...</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-white/50">
                  No download requests found matching current filter.
                </td>
              </tr>
            ) : (
              filtered.map((req) => {
                const isProcessing = processingId === req.id;
                const formattedDate = new Date(req.created_at).toLocaleString();

                return (
                  <tr
                    key={req.id}
                    className="hover:bg-white/[0.03] transition-colors duration-150"
                  >
                    {/* Song Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
                          <Music className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate max-w-[200px] sm:max-w-[280px]">
                            {req.song_title || req.song_id}
                          </p>
                          <p className="text-[11px] text-white/50 truncate max-w-[200px]">
                            {req.song_artist || `ID: ${req.song_id}`}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Device ID */}
                    <td className="py-3.5 px-4 font-mono text-xs text-white/70">
                      <div className="flex items-center gap-1.5">
                        <Smartphone className="size-3.5 text-white/40 shrink-0" />
                        <span className="truncate max-w-[150px] sm:max-w-[200px]" title={req.device_id}>
                          {req.device_id}
                        </span>
                      </div>
                    </td>

                    {/* Request Date */}
                    <td className="py-3.5 px-4 text-xs text-white/60">
                      {formattedDate}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider border",
                          req.status === "approved"
                            ? "bg-teal-500/10 text-teal-400 border-teal-500/30"
                            : req.status === "pending"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse"
                              : "bg-red-500/10 text-red-400 border-red-500/30"
                        )}
                      >
                        {req.status === "approved" && <CheckCircle2 className="size-3" />}
                        {req.status === "pending" && <Clock className="size-3" />}
                        {req.status === "rejected" && <XCircle className="size-3" />}
                        {req.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {req.status !== "approved" && (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleApprove(req.id, req.song_title)}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-500/20 border border-teal-500/40 px-2.5 py-1 text-xs font-bold text-teal-300 hover:bg-teal-500/30 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <CheckCircle2 className="size-3.5" />
                            Approve
                          </button>
                        )}

                        {req.status !== "rejected" && (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleReject(req.id, req.song_title)}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <XCircle className="size-3.5" />
                            Reject
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleDelete(req.id)}
                          aria-label="Delete request record"
                          className="grid size-7 place-items-center rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 cursor-pointer"
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

export default DownloadRequestsManager;
