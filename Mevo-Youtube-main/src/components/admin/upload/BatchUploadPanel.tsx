import { toast } from "sonner";
import { useCallback, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { runWithConcurrency } from "@/lib/upload-queue";

import {
  analyzeDraft,
  computeDraftStatus,
  createEmptyDraft,
  DRAFT_STATUS_LABELS,
  isDraftReady,
  publishDraft,
  type SongDraft,
} from "@/lib/song-draft";

import type { SongSection } from "@/services/songService";

import { AudioDropzone } from "./AudioDropzone";
import { CoverPicker } from "./CoverPicker";
import { DraftFields, DuplicateNotice, SectionSelect } from "./DraftFields";

interface BatchUploadPanelProps {
  onPublished: () => void;
  onManageSong: (songId: string) => void;
}

const MAX_AUDIO_SIZE = 50 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 2;

/** Batch upload with per-song status, inline fixes and bulk actions. */
export function BatchUploadPanel({ onPublished, onManageSong }: BatchUploadPanelProps) {
  const [drafts, setDrafts] = useState<SongDraft[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [defaultSection, setDefaultSection] = useState<SongSection>("bangla-beats");
  const [defaultTrending, setDefaultTrending] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const patchDraft = useCallback((id: string, patch: Partial<SongDraft>) => {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== id) {
          return draft;
        }

        const next = { ...draft, ...patch };

        if (
          !patch.status &&
          next.status !== "published" &&
          next.status !== "published-with-warning" &&
          next.status !== "failed"
        ) {
          next.status = computeDraftStatus(next);
        }

        return next;
      }),
    );
  }, []);

  async function handleFiles(files: File[]) {
    setMessage("");

    const accepted = files.filter((file) => file.size <= MAX_AUDIO_SIZE);
    const rejected = files.length - accepted.length;

    if (rejected > 0) {
      setMessage(`${rejected} file(s) skipped: larger than 50 MB.`);
    }

    const initialDrafts = accepted.map((file) =>
      createEmptyDraft(file, defaultSection, defaultTrending),
    );

    setDrafts((current) => [...current, ...initialDrafts]);

    // Metadata reading is sequential-ish so the UI stays responsive.
    await runWithConcurrency(
      initialDrafts.map((draft) => async () => {
        try {
          const analyzed = await analyzeDraft(draft);

          setDrafts((current) =>
            current.map((item) =>
              item.id === draft.id
                ? {
                    ...analyzed,
                    section: item.sectionTouched ? item.section : item.section,
                    trending: item.trending,
                  }
                : item,
            ),
          );
        } catch (error) {
          console.error("Metadata read failed:", error);

          patchDraft(draft.id, {
            status: "failed",
            errorMessage: "Could not read this audio file.",
          });
        }
      }),
      UPLOAD_CONCURRENCY,
    );
  }

  async function uploadDraft(draft: SongDraft) {
    try {
      const result = await publishDraft(draft, (status) => patchDraft(draft.id, { status }));

      patchDraft(draft.id, {
        publishedSongId: result.song.id,
        warningMessage: result.trendingWarning,
        errorMessage: "",
      });

      if (result.trendingWarning) {
        toast.warning(result.trendingWarning);
      } else {
        toast.success(`Published: ${result.song.title} — ${result.song.artist}`);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      const errorText = error instanceof Error ? error.message : "Upload failed.";

      patchDraft(draft.id, {
        status: "failed",
        errorMessage: errorText,
      });

      toast.error(`Failed to publish ${draft.title || draft.audioFile.name}: ${errorText}`);
    }
  }

  async function handleUploadAll() {
    const ready = drafts.filter(isDraftReady);

    if (ready.length === 0) {
      setMessage("No songs are ready to publish yet.");
      toast.info("No songs are ready to publish yet.");
      return;
    }

    setRunning(true);
    setMessage("");

    await runWithConcurrency(
      ready.map((draft) => async () => {
        // Use the latest edited version of the draft.
        const latest = drafts.find((item) => item.id === draft.id) ?? draft;

        await uploadDraft(latest);
      }),
      UPLOAD_CONCURRENCY,
    );

    setRunning(false);
    toast.success(`Batch upload finished (${ready.length} processed)`);
    onPublished();
  }

  const summary = useMemo(() => {
    const published = drafts.filter(
      (draft) => draft.status === "published" || draft.status === "published-with-warning",
    ).length;

    const failed = drafts.filter((draft) => draft.status === "failed").length;
    const ready = drafts.filter(isDraftReady).length;

    return { published, failed, ready };
  }, [drafts]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Upload</CardTitle>

        <CardDescription>
          Drop many songs at once. Each one keeps its own status, and problem files can be fixed
          without restarting the batch.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="batch-section" className="text-xs font-medium">
              Default section for new files
            </label>

            <SectionSelect id="batch-section" value={defaultSection} onChange={setDefaultSection} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Add new files to Trending</p>
              <p className="text-xs text-muted-foreground">
                Applies to files added after this is switched on.
              </p>
            </div>

            <Switch checked={defaultTrending} onCheckedChange={setDefaultTrending} />
          </div>
        </div>

        <AudioDropzone
          multiple
          disabled={running}
          label="Drop audio files here"
          onFiles={handleFiles}
        />

        {drafts.length > 0 && (
          <div className="space-y-3">
            {drafts.map((draft) => {
              const expanded = expandedId === draft.id;
              const done =
                draft.status === "published" || draft.status === "published-with-warning";

              return (
                <div key={draft.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {draft.title || draft.audioFile.name}
                      </p>

                      <p className="truncate text-xs text-muted-foreground">
                        {draft.artist || "Unknown Artist"} — {DRAFT_STATUS_LABELS[draft.status]}
                      </p>
                    </div>

                    {!done && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={running}
                        onClick={() => setExpandedId(expanded ? null : draft.id)}
                      >
                        {expanded ? "Close" : "Edit"}
                      </Button>
                    )}

                    {draft.status === "failed" && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={running}
                        onClick={() => void uploadDraft(draft)}
                      >
                        Retry
                      </Button>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={running}
                      onClick={() =>
                        setDrafts((current) => current.filter((item) => item.id !== draft.id))
                      }
                    >
                      Remove
                    </Button>
                  </div>

                  {!draft.coverFile && draft.metadata && !expanded && (
                    <div className="mt-3">
                      <CoverPicker
                        compact
                        previewUrl={draft.coverPreviewUrl}
                        fromEmbedded={draft.coverFromEmbedded}
                        error={draft.coverError}
                        disabled={running}
                        onCoverSelected={(file, previewUrl) =>
                          patchDraft(draft.id, {
                            coverFile: file,
                            coverPreviewUrl: previewUrl,
                            coverFromEmbedded: false,
                            coverError: "",
                          })
                        }
                        onError={(coverError) => patchDraft(draft.id, { coverError })}
                      />
                    </div>
                  )}

                  {draft.duplicate && !done && (
                    <div className="mt-3">
                      <DuplicateNotice
                        draft={draft}
                        disabled={running}
                        onAcknowledge={() => patchDraft(draft.id, { duplicateAcknowledged: true })}
                        onSkip={() =>
                          setDrafts((current) => current.filter((item) => item.id !== draft.id))
                        }
                        onOpenExisting={onManageSong}
                        onEditExisting={onManageSong}
                      />
                    </div>
                  )}

                  {expanded && draft.metadata && (
                    <div className="mt-4">
                      <DraftFields
                        draft={draft}
                        disabled={running}
                        onChange={(patch) => patchDraft(draft.id, patch)}
                      />
                    </div>
                  )}

                  {draft.errorMessage && (
                    <p className="mt-2 text-xs text-red-500">{draft.errorMessage}</p>
                  )}

                  {draft.warningMessage && (
                    <p className="mt-2 text-xs text-amber-600">{draft.warningMessage}</p>
                  )}
                </div>
              );
            })}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={handleUploadAll}
                disabled={running || summary.ready === 0}
              >
                {running ? "Uploading..." : `Publish ${summary.ready} ready song(s)`}
              </Button>

              <Button
                type="button"
                variant="ghost"
                disabled={running}
                onClick={() => setDrafts([])}
              >
                Clear list
              </Button>

              <p className="text-xs text-muted-foreground">
                {summary.published} published, {summary.failed} failed
              </p>
            </div>
          </div>
        )}

        {message && <p className="text-sm text-red-500">{message}</p>}
      </CardContent>
    </Card>
  );
}
