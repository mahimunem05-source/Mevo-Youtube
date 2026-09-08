import { useEffect, useState, useRef } from "react";
import { LoaderCircle, Upload, Check, Trash2, Image as ImageIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ACCEPTED_COVER_ACCEPT, prepareCoverImage } from "@/lib/cover-image";
import { upsertArtist, uploadArtistImage, type Artist } from "@/services/artistService";

interface ArtistEditDialogProps {
  open: boolean;
  artist: {
    id?: string;
    name: string;
    image_url?: string | null;
    is_verified?: boolean;
    fallbackCover?: string | null;
  } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function getArtistInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "♪";
}

export function ArtistEditDialog({ open, artist, onOpenChange, onSaved }: ArtistEditDialogProps) {
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || !artist) {
      return;
    }

    setName(artist.name ?? "");
    setImageUrl(artist.image_url ?? "");
    setIsVerified(Boolean(artist.is_verified));
    setImageFile(null);
    setImagePreview(artist.image_url || null);
    setError("");
  }, [open, artist]);

  async function handleFileSelect(file: File | undefined) {
    if (!file) return;

    try {
      setUploadingImage(true);
      setError("");

      const prepared = await prepareCoverImage(file);
      setImageFile(prepared.file);
      setImagePreview(prepared.previewUrl);

      // Upload file directly
      const publicUrl = await uploadArtistImage(prepared.file);
      setImageUrl(publicUrl);
      setImagePreview(publicUrl);
      toast.success("Artist photo uploaded successfully.");
    } catch (err) {
      console.error("Image upload failed:", err);
      setError(err instanceof Error ? err.message : "Failed to process image file.");
      toast.error("Image upload failed.");
    } finally {
      setUploadingImage(false);
    }
  }

  function handleClearImage() {
    setImageFile(null);
    setImageUrl("");
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Artist name cannot be empty.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await upsertArtist({
        id: artist?.id,
        name: name.trim(),
        image_url: imageUrl.trim() || null,
        is_verified: isVerified,
      });

      toast.success(`Artist "${name.trim()}" saved.`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Save artist error:", err);
      setError(err instanceof Error ? err.message : "Failed to save artist profile.");
    } finally {
      setSaving(false);
    }
  }

  const activeDisplayImage = imagePreview || imageUrl || artist?.fallbackCover;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#12191D] border-white/10 text-white sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="size-5 text-teal-400" />
            Edit Artist Profile
          </DialogTitle>
          <DialogDescription className="text-white/60 text-xs">
            Customize profile picture and verification status for this artist.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Profile Picture Preview & Upload */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div
                className={`
                  relative size-28 rounded-full overflow-hidden border-2 transition-all duration-300
                  ${isVerified ? "border-[#4FD1C5] shadow-[0_0_24px_rgba(79,209,197,0.35)]" : "border-white/20"}
                `}
              >
                {activeDisplayImage ? (
                  <img
                    src={activeDisplayImage}
                    alt={name || "Artist preview"}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-[#182227] text-2xl font-bold text-teal-400">
                    {getArtistInitials(name || "Artist")}
                  </div>
                )}

                {uploadingImage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <LoaderCircle className="size-6 animate-spin text-teal-400" />
                  </div>
                )}
              </div>

              {/* Verified badge preview */}
              {isVerified && (
                <div className="absolute bottom-0 right-0 grid size-7 place-items-center rounded-full bg-[#4FD1C5] text-[#071012] border-2 border-[#12191D] shadow-md">
                  <Check className="size-4 stroke-[3]" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_COVER_ACCEPT}
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                disabled={uploadingImage || saving}
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs border-white/15 bg-white/5 hover:bg-white/10 hover:text-white"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage || saving}
              >
                <Upload className="size-3.5" />
                Upload Photo
              </Button>

              {(imageUrl || imagePreview) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={handleClearImage}
                  disabled={uploadingImage || saving}
                >
                  <Trash2 className="size-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Artist Name Input */}
          <div className="space-y-1.5">
            <Label htmlFor="artist-name" className="text-xs text-white/80">
              Artist Name
            </Label>
            <Input
              id="artist-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Arijit Singh"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-sm focus-visible:ring-teal-400"
            />
          </div>

          {/* Direct Image URL Input */}
          <div className="space-y-1.5">
            <Label
              htmlFor="artist-image-url"
              className="text-xs text-white/80 flex items-center justify-between"
            >
              <span>Image URL (Direct link or CDN)</span>
              {imageUrl && (
                <span className="text-[10px] text-teal-400 font-mono">Custom photo set</span>
              )}
            </Label>
            <Input
              id="artist-image-url"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setImagePreview(e.target.value.trim() || null);
              }}
              placeholder="https://..."
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-xs font-mono focus-visible:ring-teal-400"
            />
            <p className="text-[11px] text-white/40">
              Leave blank to automatically fallback to the first track's cover art.
            </p>
          </div>

          {/* Verified Status Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="space-y-0.5">
              <Label
                htmlFor="artist-verified"
                className="text-xs font-bold text-white flex items-center gap-1.5"
              >
                <Check className="size-3.5 text-teal-400 stroke-[3]" />
                Verified Artist Badge
              </Label>
              <p className="text-[11px] text-white/50">
                Displays the teal checkmark badge on artist cards and page.
              </p>
            </div>
            <Switch id="artist-verified" checked={isVerified} onCheckedChange={setIsVerified} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="text-white/60 hover:text-white"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || uploadingImage}
            className="bg-[#4FD1C5] text-[#071012] font-bold hover:bg-[#4FD1C5]/90"
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <LoaderCircle className="size-4 animate-spin" />
                Saving...
              </span>
            ) : (
              "Save Artist"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
