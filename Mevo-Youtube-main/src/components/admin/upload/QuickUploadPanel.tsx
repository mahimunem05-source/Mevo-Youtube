import { toast } from "sonner";
import { useCallback, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";

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
import { DraftFields, DuplicateNotice, SectionSelect } from "./DraftFields";

interface QuickUploadPanelProps {
  onPublished: () => void;
  onManageSong: (songId: string) => void;
}

const MAX_AUDIO_SIZE = 50 * 1024 * 1024;

/**
 * Single-song upload: drop a file, everything is detected automatically,
 * and one button publishes it.
 */
export function QuickUploadPanel({ onPublished, onManageSong }: QuickUploadPanelProps) {
  const [draft, setDraft] = useState<SongDraft | null>(null);
  const [defaultSection, setDefaultSection] = useState<SongSection>("bangla-beats");
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const patchDraft = useCallback((patch: Partial<SongDraft>) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const next = { ...current, ...patch };

      if (
        next.status !== "published" &&
        next.status !== "published-with-warning" &&
        next.status !== "failed"
      ) {
        next.status = computeDraftStatus(next);
      }

      return next;
    });
  }, []);

  async function handleFiles(files: File[]) {
    const file = files[0];

    if (!file) {
      return;
    }

    setMessage("");
    setMessageType("");

    if (file.size > MAX_AUDIO_SIZE) {
      setMessage("Audio file must be smaller than 50 MB.");
      setMessageType("error");
      return;
    }

    const initial = createEmptyDraft(file, defaultSection, false);
    setDraft(initial);

    try {
      const analyzed = await analyzeDraft(initial);
      setDraft({ ...analyzed, section: defaultSection });
    } catch (error) {
      console.error("Metadata read failed:", error);
      setDraft(null);
      setMessage("Could not read this audio file.");
      setMessageType("error");
    }
  }

  async function handlePublish() {
    if (!draft || !isDraftReady(draft)) {
      return;
    }

    setPublishing(true);
    setMessage("");
    setMessageType("");

    try {
      const result = await publishDraft(draft, (status) =>
        setDraft((current) => (current ? { ...current, status } : current)),
      );

      const successText = `Published: ${result.song.title} — ${result.song.artist}`;
      setMessage(result.trendingWarning || successText);
      setMessageType(result.trendingWarning ? "error" : "success");

      if (result.trendingWarning) {
        toast.warning(result.trendingWarning);
      } else {
        toast.success(successText);
      }

      setDraft(null);
      onPublished();
    } catch (error) {
      console.error("Upload failed:", error);
      const errorText = error instanceof Error ? error.message : "Upload failed.";

      setDraft((current) =>
        current
          ? {
              ...current,
              status: "failed",
              errorMessage: errorText,
            }
          : current,
      );

      setMessage(errorText);
      setMessageType("error");
      toast.error(errorText);
    } finally {
      setPublishing(false);
    }
  }

  const busy =
    publishing ||
    draft?.status === "reading-metadata" ||
    draft?.status === "uploading-audio" ||
    draft?.status === "uploading-cover" ||
    draft?.status === "saving-song";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Upload</CardTitle>

        <CardDescription>
          Drop one song. Title, artist, album, genre, duration and artwork are detected
          automatically.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {!draft && (
          <>
            <div className="space-y-1">
              <label htmlFor="quick-default-section" className="text-xs font-medium">
                Default section
              </label>

              <SectionSelect
                id="quick-default-section"
                value={defaultSection}
                onChange={setDefaultSection}
              />
            </div>

            <AudioDropzone onFiles={handleFiles} disabled={busy} />
          </>
        )}

        {draft && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{draft.audioFile.name}</p>

                <p className="text-xs text-muted-foreground">
                  {DRAFT_STATUS_LABELS[draft.status]}
                  {draft.albumResolution ? ` — ${draft.albumResolution.message}` : ""}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Remove
              </Button>
            </div>

            <DuplicateNotice
              draft={draft}
              disabled={busy}
              onAcknowledge={() => patchDraft({ duplicateAcknowledged: true })}
              onSkip={() => setDraft(null)}
              onOpenExisting={onManageSong}
              onEditExisting={onManageSong}
            />

            {draft.metadata && <DraftFields draft={draft} disabled={busy} onChange={patchDraft} />}

            {draft.errorMessage && <p className="text-sm text-red-500">{draft.errorMessage}</p>}

            <Button type="button" onClick={handlePublish} disabled={busy || !isDraftReady(draft)}>
              {publishing ? DRAFT_STATUS_LABELS[draft.status] : "Publish song"}
            </Button>
          </div>
        )}

        {message && (
          <p
            role="alert"
            className={
              messageType === "success" ? "text-sm text-green-500" : "text-sm text-red-500"
            }
          >
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
