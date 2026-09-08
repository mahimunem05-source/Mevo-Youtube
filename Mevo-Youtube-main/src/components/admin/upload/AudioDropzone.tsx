import { useCallback, useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioDropzoneProps {
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: string;
  onFiles: (files: File[]) => void;
}

const AUDIO_ACCEPT = ".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav";

function isAudioFile(file: File): boolean {
  return /\.(mp3|m4a|wav)$/i.test(file.name) || file.type.startsWith("audio/");
}

/** Click-to-select and drag-and-drop audio input used by both upload modes. */
export function AudioDropzone({
  multiple = false,
  disabled = false,
  label = "Drop an audio file here",
  hint = "MP3, M4A or WAV, up to 50 MB each.",
  onFiles,
}: AudioDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const emit = useCallback(
    (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []).filter(isAudioFile);

      if (files.length > 0) {
        onFiles(multiple ? files : files.slice(0, 1));
      }
    },
    [multiple, onFiles],
  );

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);

    if (disabled) {
      return;
    }

    emit(event.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={cn(
        "rounded-xl border-2 border-dashed p-6 text-center transition",
        dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
        disabled && "opacity-60",
      )}
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>

      <Button
        type="button"
        variant="outline"
        className="mt-4"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {multiple ? "Select audio files" : "Select audio file"}
      </Button>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={AUDIO_ACCEPT}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          emit(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
