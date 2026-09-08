import { toast } from "sonner";

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
}

/**
 * Resilient multi-layer sharing helper:
 * 1. Native Web Share API (Mobile / supported HTTPS) with AbortError ignored.
 * 2. Clipboard API (Secure contexts / HTTPS).
 * 3. Invisible textarea fallback with execCommand for plain HTTP / local LAN IPs (e.g. 192.168.0.x).
 */
export async function shareContent(options: ShareOptions): Promise<boolean> {
  const shareUrl = options.url || (typeof window !== "undefined" ? window.location.href : "");
  const title = options.title || "MEVO";
  const text = options.text || (title ? `Listening to ${title}` : "Listening on MEVO");

  const shareData = {
    title,
    text,
    url: shareUrl,
  };

  // 1. Try Native Web Share API (Mobile / Supported HTTPS)
  if (
    typeof navigator !== "undefined" &&
    navigator.share &&
    (!navigator.canShare || navigator.canShare(shareData))
  ) {
    try {
      await navigator.share(shareData);
      return true;
    } catch (err: any) {
      // User dismissed or cancelled the share sheet – do not treat as an error
      if (err?.name === "AbortError") {
        return true;
      }
      console.warn("Native Web Share failed, falling back to clipboard copy...", err);
    }
  }

  // 2. Fallback to Clipboard API (Secure Contexts / HTTPS)
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof window !== "undefined" &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard!");
      return true;
    } catch (err) {
      console.warn("Clipboard API failed, using fallback textarea method...", err);
    }
  }

  // 3. Ultimate Fallback for HTTP / Local LAN IPs / Unsupported Browsers
  if (typeof document !== "undefined") {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      textArea.style.position = "fixed";
      textArea.style.top = "-9999px";
      textArea.style.left = "-9999px";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);

      if (successful) {
        toast.success("Link copied to clipboard!");
        return true;
      }
    } catch (err) {
      console.error("All share/copy fallbacks failed:", err);
    }
  }

  toast.error("Unable to copy link.");
  return false;
}
