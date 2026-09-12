/**
 * YouTube IFrame Player Bridge for MEVO
 * Bypasses datacenter IP-locking and bot detection blocks by playing
 * YouTube tracks via the official YouTube IFrame Player directly in the browser.
 */

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type PlayerStateCallback = (state: "playing" | "paused" | "buffering" | "ended" | "ready") => void;
type ErrorCallback = (error: any) => void;

class YouTubePlayerBridge {
  private player: any = null;
  private isReady = false;
  private currentVideoId: string | null = null;
  private pendingVideoId: string | null = null;
  private pendingAutoplay = false;
  private stateCallbacks = new Set<PlayerStateCallback>();
  private errorCallbacks = new Set<ErrorCallback>();
  private containerId = "mevo-youtube-iframe-container";
  private initialized = false;
  private currentVolume = 0.8;
  private currentMuted = false;
  private retryTimer: any = null;

  init(containerId = "mevo-youtube-iframe-container") {
    if (typeof window === "undefined") return;
    this.containerId = containerId;

    if (this.player) return;

    if (this.initialized) {
      if (!this.player && document.getElementById(this.containerId)) {
        this.createPlayer();
      }
      return;
    }

    this.initialized = true;

    if (window.YT && window.YT.Player) {
      this.createPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === "function") {
          try {
            prevCallback();
          } catch {
            // ignore
          }
        }
        this.createPlayer();
      };

      if (!document.getElementById("youtube-iframe-api")) {
        const tag = document.createElement("script");
        tag.id = "youtube-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }
  }

  private createPlayer() {
    if (typeof window === "undefined") return;
    const container = document.getElementById(this.containerId);
    if (!container) {
      if (!this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          if (!this.player && document.getElementById(this.containerId)) {
            this.createPlayer();
          }
        }, 150);
      }
      return;
    }

    if (!window.YT || !window.YT.Player) {
      return;
    }

    try {
      this.player = new window.YT.Player(this.containerId, {
        height: "200",
        width: "200",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          enablejsapi: 1,
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: () => {
            this.isReady = true;
            this.setVolume(this.currentVolume, this.currentMuted);
            this.notifyState("ready");
            if (this.pendingVideoId) {
              const vid = this.pendingVideoId;
              const play = this.pendingAutoplay;
              this.pendingVideoId = null;
              this.pendingAutoplay = false;
              this.loadVideo(vid, play);
            }
          },
          onStateChange: (event: any) => {
            if (!window.YT) return;
            switch (event.data) {
              case window.YT.PlayerState.PLAYING:
                this.notifyState("playing");
                break;
              case window.YT.PlayerState.PAUSED:
                this.notifyState("paused");
                break;
              case window.YT.PlayerState.BUFFERING:
                this.notifyState("buffering");
                break;
              case window.YT.PlayerState.ENDED:
                this.notifyState("ended");
                break;
            }
          },
          onError: (error: any) => {
            console.warn("[YouTubePlayerBridge] Player error:", error);
            this.errorCallbacks.forEach((cb) => {
              try {
                cb(error);
              } catch {
                // ignore
              }
            });
          },
        },
      });
    } catch (err) {
      console.error("[YouTubePlayerBridge] Failed to create player:", err);
    }
  }

  getCurrentVideoId(): string | null {
    return this.currentVideoId;
  }

  loadVideo(videoId: string, autoplay = true) {
    const cleanId = videoId.replace(/^yt-/, "").trim();
    if (!cleanId) return;

    if (this.currentVideoId === cleanId && this.isReady && this.player) {
      if (autoplay) {
        this.play();
      }
      return;
    }

    this.currentVideoId = cleanId;

    if (!this.isReady || !this.player || typeof this.player.loadVideoById !== "function") {
      this.pendingVideoId = cleanId;
      this.pendingAutoplay = autoplay;
      return;
    }

    try {
      if (autoplay) {
        this.player.loadVideoById(cleanId);
      } else {
        this.player.cueVideoById(cleanId);
      }
    } catch (err) {
      console.warn("[YouTubePlayerBridge] loadVideoById notice:", err);
    }
  }

  play() {
    if (!this.isReady || !this.player || typeof this.player.playVideo !== "function") {
      this.pendingAutoplay = true;
      return;
    }
    try {
      this.player.playVideo();
    } catch (err) {
      console.warn("[YouTubePlayerBridge] play error:", err);
    }
  }

  pause() {
    if (!this.isReady || !this.player || typeof this.player.pauseVideo !== "function") return;
    try {
      this.player.pauseVideo();
    } catch (err) {
      console.warn("[YouTubePlayerBridge] pause error:", err);
    }
  }

  stop() {
    if (!this.isReady || !this.player || typeof this.player.stopVideo !== "function") return;
    try {
      this.player.stopVideo();
      this.currentVideoId = null;
    } catch {
      // ignore
    }
  }

  seek(seconds: number) {
    if (!this.isReady || !this.player || typeof this.player.seekTo !== "function") return;
    try {
      this.player.seekTo(seconds, true);
    } catch {
      // ignore
    }
  }

  setVolume(volume0to1: number, muted = false) {
    this.currentVolume = volume0to1;
    this.currentMuted = muted;
    if (!this.isReady || !this.player) return;
    try {
      if (muted) {
        if (typeof this.player.mute === "function") this.player.mute();
      } else {
        if (typeof this.player.unMute === "function") this.player.unMute();
        if (typeof this.player.setVolume === "function") {
          this.player.setVolume(Math.round(Math.max(0, Math.min(1, volume0to1)) * 100));
        }
      }
    } catch {
      // ignore
    }
  }

  getCurrentTime(): number {
    if (!this.isReady || !this.player || typeof this.player.getCurrentTime !== "function") return 0;
    try {
      return this.player.getCurrentTime() || 0;
    } catch {
      return 0;
    }
  }

  getDuration(): number {
    if (!this.isReady || !this.player || typeof this.player.getDuration !== "function") return 0;
    try {
      return this.player.getDuration() || 0;
    } catch {
      return 0;
    }
  }

  onStateChange(cb: PlayerStateCallback): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  onError(cb: ErrorCallback): () => void {
    this.errorCallbacks.add(cb);
    return () => this.errorCallbacks.delete(cb);
  }

  private notifyState(state: "playing" | "paused" | "buffering" | "ended" | "ready") {
    this.stateCallbacks.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error("[YouTubePlayerBridge] state callback error:", err);
      }
    });
  }
}

export const youtubePlayerBridge = new YouTubePlayerBridge();
