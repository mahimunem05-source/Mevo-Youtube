import { memo, useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { DEFAULT_COVER } from "@/data/songs";
import { cn } from "@/lib/utils";

export interface SongCoverImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  fallbackSrc?: string;
  className?: string;
  alt?: string;
}

function SongCoverImageComponent({
  src,
  fallbackSrc = DEFAULT_COVER,
  alt = "",
  className,
  loading = "lazy",
  decoding = "async",
  onError,
  onLoad,
  ...props
}: SongCoverImageProps) {
  const initialSrc = src?.trim() || fallbackSrc;
  const [imgSrc, setImgSrc] = useState<string>(initialSrc);
  const retriedRef = useRef(false);
  const lastSrcPropRef = useRef(src);

  // Sync state when incoming src prop changes
  useEffect(() => {
    if (src !== lastSrcPropRef.current) {
      lastSrcPropRef.current = src;
      retriedRef.current = false;
      setImgSrc(src?.trim() || fallbackSrc);
    }
  }, [src, fallbackSrc]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Gracefully fall back to default cover placeholder immediately
    if (imgSrc !== fallbackSrc) {
      setImgSrc(fallbackSrc);
    }
    onError?.(e);
  };

  return (
    <img
      src={imgSrc}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={handleError}
      onLoad={onLoad}
      className={cn("size-full object-cover", className)}
      {...props}
    />
  );
}

export const SongCoverImage = memo(SongCoverImageComponent);
