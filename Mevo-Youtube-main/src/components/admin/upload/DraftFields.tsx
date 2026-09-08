import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { SONG_SECTION_OPTIONS, type SongSection } from "@/services/songService";

import type { SongDraft } from "@/lib/song-draft";
import { CoverPicker } from "./CoverPicker";

export function formatClock(value: number): string {
  const total = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SectionSelect({
  value,
  onChange,
  disabled,
  id,
}: {
  value: SongSection;
  onChange: (value: SongSection) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as SongSection)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {SONG_SECTION_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface DraftFieldsProps {
  draft: SongDraft;
  disabled?: boolean;
  onChange: (patch: Partial<SongDraft>) => void;
}

/** Expanded, fully editable detail fields for one draft. */
export function DraftFields({ draft, disabled, onChange }: DraftFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <label className="text-xs font-medium">Cover image</label>

        <CoverPicker
          previewUrl={draft.coverPreviewUrl}
          fromEmbedded={draft.coverFromEmbedded}
          error={draft.coverError}
          disabled={disabled}
          onCoverSelected={(file, previewUrl) =>
            onChange({
              coverFile: file,
              coverPreviewUrl: previewUrl,
              coverFromEmbedded: false,
              coverError: "",
            })
          }
          onError={(message) => onChange({ coverError: message })}
          onClear={() =>
            onChange({
              coverFile: null,
              coverPreviewUrl: null,
              coverFromEmbedded: false,
            })
          }
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Title</label>
        <Input
          value={draft.title}
          disabled={disabled}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Artist</label>
        <Input
          value={draft.artist}
          disabled={disabled}
          onChange={(event) => onChange({ artist: event.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Album</label>
        <Input
          value={draft.album}
          placeholder="Leave empty for a single"
          disabled={disabled}
          onChange={(event) => onChange({ album: event.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Genre</label>
        <Input
          value={draft.genre}
          disabled={disabled}
          onChange={(event) => onChange({ genre: event.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Release date</label>
        <Input
          type="date"
          value={draft.releaseDate}
          disabled={disabled}
          onChange={(event) => onChange({ releaseDate: event.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">Track</label>
          <Input
            value={draft.trackNumber}
            inputMode="numeric"
            disabled={disabled}
            onChange={(event) => onChange({ trackNumber: event.target.value.replace(/\D/g, "") })}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Disc</label>
          <Input
            value={draft.discNumber}
            inputMode="numeric"
            disabled={disabled}
            onChange={(event) => onChange({ discNumber: event.target.value.replace(/\D/g, "") })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Section</label>
        <SectionSelect
          value={draft.section}
          disabled={disabled}
          onChange={(section) => onChange({ section, sectionTouched: true })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Duration</label>
        <Input value={formatClock(draft.duration)} readOnly />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Add this song to Trending</p>
            <p className="text-xs text-muted-foreground">
              Uses the existing Trending selection, not a song column.
            </p>
          </div>

          <Switch
            checked={draft.trending}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ trending: checked, trendingTouched: true })}
          />
        </div>

        {draft.trending && (
          <div className="space-y-1">
            <label className="text-xs font-medium">Trending position (optional)</label>

            <Input
              value={draft.trendingPosition}
              inputMode="numeric"
              placeholder="Automatic next available position"
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  trendingPosition: event.target.value.replace(/\D/g, ""),
                })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface DuplicateNoticeProps {
  draft: SongDraft;
  disabled?: boolean;
  onAcknowledge: () => void;
  onSkip: () => void;
  onOpenExisting: (songId: string) => void;
  onEditExisting: (songId: string) => void;
}

export function DuplicateNotice({
  draft,
  disabled,
  onAcknowledge,
  onSkip,
  onOpenExisting,
  onEditExisting,
}: DuplicateNoticeProps) {
  if (!draft.duplicate) {
    return null;
  }

  const existing = draft.duplicate.song;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="text-sm font-medium text-amber-600">{draft.duplicate.message}</p>

      <p className="mt-1 text-xs text-muted-foreground">
        {existing.title} — {existing.artist}
        {existing.album ? ` (${existing.album})` : ""}
      </p>

      {draft.duplicateAcknowledged ? (
        <p className="mt-2 text-xs text-muted-foreground">
          This will be published as a separate song.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onOpenExisting(existing.id)}
          >
            Open existing song
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onEditExisting(existing.id)}
          >
            Edit existing song
          </Button>

          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onSkip}>
            Skip this upload
          </Button>

          <Button type="button" size="sm" disabled={disabled} onClick={onAcknowledge}>
            Upload as a separate song
          </Button>
        </div>
      )}
    </div>
  );
}
