import { useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACCEPTED_COVER_ACCEPT, prepareCoverImage } from "@/lib/cover-image";

interface CoverPickerProps {
  previewUrl: string | null;
  fromEmbedded: boolean;
  error?: string;
  disabled?: boolean;
  compact?: boolean;
  onCoverSelected: (file: File, previewUrl: string) => void;
  onError: (message: string) => void;
  onClear?: () => void;
}

export const NO_ARTWORK_MESSAGE =
  "No embedded artwork was found. Please add a cover image before publishing.";

/**
 * Square cover preview plus click / drag-and-drop selection.
 * Images are validated and optimised before they ever reach Storage.
 */
export function CoverPicker({
  previewUrl,
  fromEmbedded,
  error = "",
  disabled = false,
  compact = false,
  onCoverSelected,
  onError,
  onClear,
}: CoverPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [working, setWorking] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setWorking(true);

    try {
      const prepared = await prepareCoverImage(file);
      onCoverSelected(prepared.file, prepared.previewUrl);
    } catch (prepareError) {
      onError(prepareError instanceof Error ? prepareError.message : "Could not use this image.");
    } finally {
      setWorking(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);

    if (!disabled) {
      void handleFile(event.dataTransfer.files?.[0]);
    }
  }

  const size = compact ? "size-16" : "size-28";

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          "flex items-center gap-3 rounded-xl border border-dashed p-3 transition",
          dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
        )}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Cover preview"
            className={cn(size, "shrink-0 rounded-lg border object-cover")}
          />
        ) : (
          <div
            className={cn(
              size,
              "flex shrink-0 items-center justify-center rounded-lg border border-dashed text-[10px] text-muted-foreground",
            )}
          >
            No cover
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs text-muted-foreground">
            {previewUrl
              ? fromEmbedded
                ? "Using the artwork embedded in this audio file."
                : "Using the cover image you selected."
              : NO_ARTWORK_MESSAGE}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || working}
              onClick={() => inputRef.current?.click()}
            >
              {working ? "Processing..." : previewUrl ? "Change cover" : "Add cover image"}
            </Button>

            {previewUrl && onClear && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || working}
                onClick={onClear}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ACCEPTED_COVER_ACCEPT}
        disabled={disabled}
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
