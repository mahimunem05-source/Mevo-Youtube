import static_ffmpeg
static_ffmpeg.add_paths()

import os
import re
import time
import uuid
import random
import shutil
import logging
import threading
from pathlib import Path
from datetime import datetime, timezone, timedelta
from flask import Flask, request, send_file, jsonify, redirect, Response, stream_with_context
import tempfile
from flask_cors import CORS
import requests
import yt_dlp
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load Environment Variables from multiple candidate locations
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

load_dotenv(dotenv_path=BASE_DIR / ".env")
load_dotenv(dotenv_path=ROOT_DIR / ".env")
load_dotenv(dotenv_path=ROOT_DIR / ".env.local")

# Ephemeral OS Temporary Directory for transient streaming/downloads ONLY.
# Never saved inside project or repository. Cleaned up immediately upon response completion.
TEMP_AUDIO_DIR = Path(tempfile.gettempdir()) / "mevo_transient_audio"
TEMP_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

def _periodic_temp_audio_cleaner():
    """Background daemon thread to sweep any aborted/orphan temporary audio files older than 5 minutes."""
    while True:
        try:
            time.sleep(300)  # Every 5 minutes
            now = time.time()
            if TEMP_AUDIO_DIR.exists():
                for item in TEMP_AUDIO_DIR.iterdir():
                    if item.is_file() and (now - item.stat().st_mtime) > 300:
                        try:
                            item.unlink(missing_ok=True)
                        except Exception:
                            pass
        except Exception:
            pass

threading.Thread(target=_periodic_temp_audio_cleaner, daemon=True, name="temp_audio_cleaner").start()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)s] - %(message)s"
)

# ---------------------------------------------------------------------------
# Multi-Key YouTube API Pool with Automatic Key Rotation on 403
# ---------------------------------------------------------------------------
class YouTubeKeyPool:
    def __init__(self, name: str = "default", keys: list[str] = None):
        self.name = name
        self._lock = threading.RLock()
        self._keys: list[str] = keys if keys is not None else []
        self._exhausted_keys: dict[str, float] = {}  # key -> timestamp when exhausted
        self._current_idx: int = 0
        if keys is None:
            self.reload_keys()

    def reload_keys(self, raw_keys_str: str = None):
        with self._lock:
            if raw_keys_str is None:
                raw_keys_str = (
                    os.getenv("YOUTUBE_API_KEYS")
                    or os.getenv("YOUTUBE_API_KEY")
                    or os.getenv("VITE_YOUTUBE_API_KEY")
                    or ""
                )
            # Parse comma or semicolon or newline separated keys
            keys: list[str] = []
            for piece in re.split(r"[,;\n\s]+", raw_keys_str):
                clean = piece.strip().strip('"').strip("'")
                if clean and clean != "your_google_youtube_api_key_here":
                    # Check for valid Google API key structure
                    match = re.search(r"AIzaSy[A-Za-z0-9_-]{33}", clean)
                    k = match.group(0) if match else clean
                    if k and k not in keys:
                        keys.append(k)

            self._keys = keys
            self._current_idx = 0
            logging.info(f"[YouTubeKeyPool:{self.name}] Loaded {len(self._keys)} API key(s)")

    def _cleanup_exhausted(self):
        """Reset keys that have been exhausted for more than 12 hours (daily quota reset)"""
        now = time.time()
        with self._lock:
            expired_keys = [k for k, ts in self._exhausted_keys.items() if now - ts > 12 * 3600]
            for k in expired_keys:
                del self._exhausted_keys[k]
                logging.info(f"[YouTubeKeyPool:{self.name}] Reset exhaustion state for key: {self._mask_key(k)}")

    @staticmethod
    def _mask_key(key: str) -> str:
        if len(key) <= 8:
            return "***"
        return f"{key[:6]}...{key[-4:]}"

    def get_active_key(self) -> str | None:
        self._cleanup_exhausted()
        with self._lock:
            if not self._keys:
                return None

            total = len(self._keys)
            for _ in range(total):
                idx = self._current_idx % total
                candidate = self._keys[idx]
                if candidate not in self._exhausted_keys:
                    return candidate
                self._current_idx = (self._current_idx + 1) % total

            return None  # All keys currently exhausted

    def mark_key_exhausted(self, key: str, reason: str = "403 Quota Exceeded"):
        with self._lock:
            if key not in self._exhausted_keys:
                self._exhausted_keys[key] = time.time()
                logging.warning(
                    f"[YouTubeKeyPool:{self.name}] Key {self._mask_key(key)} marked EXHAUSTED ({reason}). "
                    f"Active remaining: {len(self._keys) - len(self._exhausted_keys)}/{len(self._keys)}"
                )
            # Advance pointer
            if self._keys:
                self._current_idx = (self._current_idx + 1) % len(self._keys)

    def get_status(self) -> dict:
        self._cleanup_exhausted()
        with self._lock:
            return {
                "name": self.name,
                "total_keys": len(self._keys),
                "active_keys": len(self._keys) - len(self._exhausted_keys),
                "exhausted_keys": len(self._exhausted_keys),
                "has_available_key": self.get_active_key() is not None,
                "keys_preview": [self._mask_key(k) for k in self._keys],
            }


def _parse_keys(raw: str) -> list[str]:
    keys = []
    for piece in re.split(r"[,;\n\s]+", raw or ""):
        clean = piece.strip().strip('"').strip("'")
        if clean and clean != "your_google_youtube_api_key_here":
            match = re.search(r"AIzaSy[A-Za-z0-9_-]{33}", clean)
            k = match.group(0) if match else clean
            if k and k not in keys:
                keys.append(k)
    return keys


def init_youtube_pools() -> tuple[YouTubeKeyPool, YouTubeKeyPool]:
    disc_raw = os.getenv("SONG_DISCOVERY_API_KEYS") or ""
    search_raw = os.getenv("SEARCH_API_KEYS") or ""
    fallback_raw = (
        os.getenv("YOUTUBE_API_KEYS")
        or os.getenv("YOUTUBE_API_KEY")
        or os.getenv("VITE_YOUTUBE_API_KEY")
        or ""
    )

    disc_keys = _parse_keys(disc_raw)
    search_keys = _parse_keys(search_raw)
    fallback_keys = _parse_keys(fallback_raw)

    if not disc_keys and not search_keys and fallback_keys:
        if len(fallback_keys) >= 2:
            search_keys = [fallback_keys[-1]]
            disc_keys = fallback_keys[:-1]
        else:
            disc_keys = list(fallback_keys)
            search_keys = list(fallback_keys)
    elif not disc_keys and fallback_keys:
        disc_keys = [k for k in fallback_keys if k not in search_keys] or list(fallback_keys)
    elif not search_keys and fallback_keys:
        search_keys = [k for k in fallback_keys if k not in disc_keys] or list(fallback_keys)

    discovery_pool = YouTubeKeyPool(name="Song Discovery", keys=disc_keys)
    search_pool = YouTubeKeyPool(name="Search", keys=search_keys)

    logging.info(f"[YouTube Pools Initialized] Discovery Pool: {len(disc_keys)} key(s), Search Pool: {len(search_keys)} key(s)")
    return discovery_pool, search_pool


discovery_key_pool, search_key_pool = init_youtube_pools()
key_pool = search_key_pool  # Backward compatibility alias


def get_key_pool(pool: str = "search") -> YouTubeKeyPool:
    if pool in ("discovery", "category", "trending"):
        return discovery_key_pool
    return search_key_pool

# ---------------------------------------------------------------------------
# Single-Flight Request Deduplication / Coalescing
# ---------------------------------------------------------------------------
class SingleFlight:
    """
    Coalesces concurrent identical in-flight requests so only ONE upstream
    request executes. All concurrent callers await and receive the same response.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._calls: dict[str, tuple[threading.Event, dict]] = {}

    def execute(self, key: str, fn, *args, **kwargs):
        with self._lock:
            if key in self._calls:
                event, result_holder = self._calls[key]
                first_caller = False
            else:
                event = threading.Event()
                result_holder = {"val": None, "err": None}
                self._calls[key] = (event, result_holder)
                first_caller = True

        if not first_caller:
            event.wait()
            if result_holder["err"] is not None:
                raise result_holder["err"]
            return result_holder["val"]

        try:
            val = fn(*args, **kwargs)
            result_holder["val"] = val
            return val
        except Exception as e:
            result_holder["err"] = e
            raise
        finally:
            with self._lock:
                event.set()
                self._calls.pop(key, None)

    def stats(self) -> dict:
        with self._lock:
            return {
                "active_in_flight_count": len(self._calls),
                "in_flight_keys": list(self._calls.keys()),
            }


# ---------------------------------------------------------------------------
# Supabase PostgreSQL Cache Persistence Layer
# ---------------------------------------------------------------------------
class SupabaseCacheStore:
    """
    Optional PostgreSQL/Supabase persistence for shared cache records.
    Uses PostgREST endpoint /rest/v1/youtube_cache with UPSERT.
    """
    def __init__(self):
        self._supabase_url = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").rstrip("/")
        self._supabase_key = (
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            or os.getenv("SUPABASE_SERVICE_KEY")
            or os.getenv("SUPABASE_ANON_KEY")
            or os.getenv("VITE_SUPABASE_ANON_KEY")
            or ""
        )
        self._available = bool(self._supabase_url and self._supabase_key)
        self._disabled = False
        self._last_error = None

    def is_available(self) -> bool:
        return self._available and not self._disabled

    def get(self, cache_key: str):
        if not self.is_available():
            return None
        try:
            url = f"{self._supabase_url}/rest/v1/youtube_cache?cache_key=eq.{cache_key}&select=cache_key,payload,expires_at,stale_at&limit=1"
            headers = {
                "apikey": self._supabase_key,
                "Authorization": f"Bearer {self._supabase_key}",
                "Accept": "application/json"
            }
            res = requests.get(url, headers=headers, timeout=3)
            if res.ok:
                rows = res.json()
                if rows and isinstance(rows, list) and len(rows) > 0:
                    row = rows[0]
                    exp_str = row.get("expires_at")
                    if exp_str:
                        dt = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
                        if datetime.now(timezone.utc) <= dt:
                            return row.get("payload")
            return None
        except Exception as e:
            self._last_error = str(e)
            return None

    def set(self, cache_key: str, payload, ttl_seconds: int, stale_grace_seconds: int = 1800):
        if not self.is_available():
            return
        def _async_upsert():
            try:
                now = datetime.now(timezone.utc)
                expires_at = (now + timedelta(seconds=ttl_seconds)).isoformat()
                stale_at = (now + timedelta(seconds=ttl_seconds + stale_grace_seconds)).isoformat()
                url = f"{self._supabase_url}/rest/v1/youtube_cache"
                headers = {
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                }
                body = {
                    "cache_key": cache_key,
                    "payload": payload,
                    "created_at": now.isoformat(),
                    "expires_at": expires_at,
                    "stale_at": stale_at,
                    "metadata": {"source": "mevo_backend"}
                }
                requests.post(url, headers=headers, json=body, timeout=4)
            except Exception as e:
                self._last_error = str(e)
        threading.Thread(target=_async_upsert, daemon=True).start()


# ---------------------------------------------------------------------------
# Dual-Tier Shared Cache with Stale-While-Revalidate
# ---------------------------------------------------------------------------
class DualTierCache:
    """
    Tier 1: Fast in-memory dictionary with TTL and stale grace period.
    Tier 2: Shared Supabase table for cross-instance and process-restart persistence.
    """
    def __init__(self, default_ttl_seconds: int = 1800, stale_grace_seconds: int = 1800):
        self._lock = threading.RLock()
        self._cache: dict[str, dict] = {}
        self._default_ttl = default_ttl_seconds
        self._stale_grace = stale_grace_seconds
        self._supabase_store = SupabaseCacheStore()
        self._hits = 0
        self._stale_hits = 0
        self._misses = 0

    def get(self, key: str, allow_stale: bool = True):
        now = time.time()
        with self._lock:
            entry = self._cache.get(key)
            if entry:
                if now <= entry["expires_at"]:
                    self._hits += 1
                    return entry["data"]
                elif allow_stale and now <= (entry["expires_at"] + self._stale_grace):
                    self._stale_hits += 1
                    return entry["data"]
                else:
                    del self._cache[key]

        # Tier 2: Check Supabase
        s_data = self._supabase_store.get(key)
        if s_data is not None:
            with self._lock:
                self._cache[key] = {
                    "data": s_data,
                    "cached_at": now,
                    "expires_at": now + self._default_ttl,
                }
            self._hits += 1
            return s_data

        self._misses += 1
        return None

    def is_stale(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return False
            return now > entry["expires_at"] and now <= (entry["expires_at"] + self._stale_grace)

    def set(self, key: str, data, ttl: int | None = None):
        if ttl is None:
            ttl = self._default_ttl
        now = time.time()
        with self._lock:
            self._cache[key] = {
                "data": data,
                "cached_at": now,
                "expires_at": now + ttl,
            }
        self._supabase_store.set(key, data, ttl_seconds=ttl, stale_grace_seconds=self._stale_grace)

    def stats(self) -> dict:
        now = time.time()
        with self._lock:
            valid_keys = [k for k, v in self._cache.items() if now <= v["expires_at"]]
            stale_keys = [
                k for k, v in self._cache.items()
                if v["expires_at"] < now <= (v["expires_at"] + self._stale_grace)
            ]
            return {
                "total_entries": len(self._cache),
                "valid_entries": len(valid_keys),
                "stale_entries": len(stale_keys),
                "hits": self._hits,
                "stale_hits": self._stale_hits,
                "misses": self._misses,
                "default_ttl_seconds": self._default_ttl,
                "supabase_enabled": self._supabase_store.is_available(),
            }

    def clear(self):
        with self._lock:
            self._cache.clear()


# ---------------------------------------------------------------------------
# Rate Limiting & Request Budget Tracking
# ---------------------------------------------------------------------------
class TokenBucketRateLimiter:
    def __init__(self, rate: float = 12.0, capacity: float = 35.0):
        self._rate = rate
        self._capacity = capacity
        self._tokens: dict[str, float] = {}
        self._last_update: dict[str, float] = {}
        self._lock = threading.Lock()

    def allow(self, client_ip: str, cost: float = 1.0) -> bool:
        now = time.time()
        with self._lock:
            if client_ip not in self._tokens:
                self._tokens[client_ip] = self._capacity
                self._last_update[client_ip] = now

            elapsed = now - self._last_update[client_ip]
            self._last_update[client_ip] = now
            self._tokens[client_ip] = min(self._capacity, self._tokens[client_ip] + elapsed * self._rate)

            if self._tokens[client_ip] >= cost:
                self._tokens[client_ip] -= cost
                return True
            return False


class RequestBudgetTracker:
    def __init__(self):
        self._lock = threading.Lock()
        self._requests_total = 0
        self._cache_hits = 0
        self._cache_misses = 0
        self._upstream_calls = 0
        self._error_counts: dict[str, int] = {}
        self._endpoint_counts: dict[str, int] = {}

    def record_request(self, endpoint: str, hit: bool = False, upstream: bool = False, error: str = None):
        with self._lock:
            self._requests_total += 1
            if hit:
                self._cache_hits += 1
            else:
                self._cache_misses += 1
            if upstream:
                self._upstream_calls += 1
            if error:
                self._error_counts[error] = self._error_counts.get(error, 0) + 1
            self._endpoint_counts[endpoint] = self._endpoint_counts.get(endpoint, 0) + 1

    def stats(self) -> dict:
        with self._lock:
            return {
                "total_requests": self._requests_total,
                "cache_hits": self._cache_hits,
                "cache_misses": self._cache_misses,
                "upstream_calls": self._upstream_calls,
                "endpoint_counts": dict(self._endpoint_counts),
                "error_counts": dict(self._error_counts),
            }


# Core infrastructure singletons
search_cache = DualTierCache(default_ttl_seconds=1800, stale_grace_seconds=1800)
single_flight = SingleFlight()
request_budget = RequestBudgetTracker()
rate_limiter = TokenBucketRateLimiter(rate=12.0, capacity=35.0)

YOUTUBE_CONCURRENCY_LIMIT = max(1, int(os.getenv("YOUTUBE_CONCURRENCY", "4")))
EXTRACTOR_CONCURRENCY_LIMIT = max(1, int(os.getenv("EXTRACTOR_CONCURRENCY", "2")))
youtube_api_semaphore = threading.BoundedSemaphore(value=YOUTUBE_CONCURRENCY_LIMIT)
extractor_semaphore = threading.BoundedSemaphore(value=EXTRACTOR_CONCURRENCY_LIMIT)

# ---------------------------------------------------------------------------
# Flask Application Setup
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

def get_ffmpeg_dir():
    ffmpeg_exe = shutil.which("ffmpeg")
    if ffmpeg_exe:
        return os.path.dirname(ffmpeg_exe)
    return None

def extract_video_id(input_str: str) -> str:
    if not input_str:
        return ""
    clean = input_str.strip()
    if clean.startswith("yt-"):
        clean = clean[3:]
    if re.match(r"^[a-zA-Z0-9_-]{11}$", clean):
        return clean
    match = re.search(r"(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})", clean)
    if match:
        return match.group(1)
    return clean

def build_watch_url(input_str: str) -> str:
    vid_id = extract_video_id(input_str)
    if re.match(r"^[a-zA-Z0-9_-]{11}$", vid_id):
        return f"https://www.youtube.com/watch?v={vid_id}"
    if input_str.startswith("http://") or input_str.startswith("https://"):
        return input_str
    return f"https://www.youtube.com/watch?v={input_str}"

YOUTUBE_COOKIE_PATH: Path | None = None

def init_youtube_cookies() -> Path | None:
    """
    Safely initializes YouTube cookie file from environment variables or local file.
    Supports:
    - YOUTUBE_COOKIES (raw Netscape cookies text)
    - YOUTUBE_COOKIES_BASE64 (base64-encoded Netscape cookies text)
    - YOUTUBE_COOKIE_FILE (file path)
    - cookies.txt in backend or project root
    Cookies are written to a secure temporary file with 0600 permissions in TEMP_AUDIO_DIR.
    Never exposed to client or frontend bundle.
    """
    global YOUTUBE_COOKIE_PATH
    try:
        # 1. Check raw cookie content from environment
        cookie_content = os.getenv("YOUTUBE_COOKIES")
        if not cookie_content and os.getenv("YOUTUBE_COOKIES_BASE64"):
            import base64
            try:
                cookie_content = base64.b64decode(os.getenv("YOUTUBE_COOKIES_BASE64")).decode("utf-8")
            except Exception as b64_err:
                logging.error(f"[Cookies] Failed to decode YOUTUBE_COOKIES_BASE64: {b64_err}")

        if cookie_content and ("youtube.com" in cookie_content or "google.com" in cookie_content or "TRUE" in cookie_content):
            target_path = TEMP_AUDIO_DIR / "youtube_cookies.txt"
            target_path.write_text(cookie_content.strip() + "\n", encoding="utf-8")
            try:
                os.chmod(target_path, 0o600)
            except Exception:
                pass
            YOUTUBE_COOKIE_PATH = target_path
            logging.info(f"[Cookies] Successfully loaded YouTube session cookies from environment ({len(cookie_content)} bytes)")
            return YOUTUBE_COOKIE_PATH

        # 2. Check explicit cookie file paths
        candidate_paths = [
            os.getenv("YOUTUBE_COOKIE_FILE"),
            os.getenv("COOKIE_FILE"),
            str(BASE_DIR / "cookies.txt"),
            str(ROOT_DIR / "cookies.txt"),
            str(BASE_DIR / "youtube_cookies.txt"),
        ]
        for p in candidate_paths:
            if p and Path(p).is_file():
                YOUTUBE_COOKIE_PATH = Path(p)
                logging.info(f"[Cookies] Found YouTube cookie file at: {p}")
                return YOUTUBE_COOKIE_PATH
    except Exception as e:
        logging.error(f"[Cookies] Cookie initialization notice: {e}")

    return None

# Initialize cookies on module load
init_youtube_cookies()

def get_base_ydl_opts(client_list: list[str] | None = None):
    """Universal yt-dlp config with resilient player clients and secure cookie support"""
    opts = {
        "quiet": True,
        "no_warnings": True,
    }

    # Pass secure cookiefile if available
    cookie_file = YOUTUBE_COOKIE_PATH or init_youtube_cookies()
    if cookie_file and cookie_file.is_file():
        opts["cookiefile"] = str(cookie_file)

    # Proper headers mimicking modern client browser
    opts["http_headers"] = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Mode": "navigate",
    }

    if client_list is not None:
        opts["extractor_args"] = {
            "youtube": {
                "player_client": client_list
            }
        }
    else:
        # Default player clients: ['android', 'ios', 'web'] to eliminate 403 blocks
        opts["extractor_args"] = {
            "youtube": {
                "player_client": ["android", "ios", "web"]
            }
        }

    ffmpeg_dir = get_ffmpeg_dir()
    if ffmpeg_dir:
        opts["ffmpeg_location"] = ffmpeg_dir
    return opts

# ---------------------------------------------------------------------------
# Filtering & Title Parsing Helpers
# ---------------------------------------------------------------------------
BANNED_COMPILATION_RE = re.compile(
    r"\b(?:top\s*\d{1,3}|hot\s*\d{1,3}|billboard|top\s*songs?|best\s*songs?|hits?\s*202\d|mashup\s*preview|recaps?|countdowns?|this\s*week|megamix|compilations?|greatest\s*hits?|rankings?|jukebox|non\s*stop|nonstop|all\s*songs|full\s*album)\b",
    re.IGNORECASE
)

# Hard blacklist of news media, talk shows, cartoons, kids, and spam channels
BANNED_CHANNELS = [
    # News & Broadcasters
    "jamuna tv", "somoy tv", "ekattor", "channel 24", "independent television",
    "dbc news", "ntv news", "atn news", "news24", "bbc news", "cnn", "ndtv",
    "aaj tak", "zee news", "abp news", "india today", "al jazeera", "reuters",
    "wion", "dd news", "times now", "republic bharat", "inmusic", "top music hits",
    "billboard", "billboard chart", "billboard charts", "redlist", "chart data",
    "music chart", "top hits", "top songs", "ranking music", "music ranking",
    "song recap", "top music", "best music chart", "charts", "news", "television",
    "waz", "mahfil",
    # Kids & Cartoon Channels
    "cocomelon", "chuchu tv", "chuchutv", "pinkfong", "peppa pig", "super simple songs",
    "little angel", "kids tv", "lallu tv", "toons", "cartoon network", "nickelodeon",
    "disney junior", "disney channel", "pogo", "sonic gang", "hungama", "sony yay",
    "doraemon", "shinchan", "oggy and the cockroaches", "baby bus", "bounce patrol",
    "infobells", "geethanjali kids", "chu chu tv", "cvs 3d rhymes", "masha and the bear",
    "talking tom", "ryan's world", "vlad and niki", "diana and roma"
]

NEGATIVE_TERMS = [
    # Non-Music Formats
    "natok", "drama", "bangla natok", "telefilm", "waz", "mahfil", "talk show",
    "podcast", "press conference", "bulletin", "breaking news", "news", "reaction",
    "reacts", "first time hearing", "unboxing", "review", "tutorial", "gameplay",
    "walkthrough", "full movie", "movie scene", "trailer", "teaser", "interview",
    "funny video", "comedy scene", "prank", "roast", "status video", "whatsapp status",
    "status", "slowed", "reverb", "slowed+reverb", "slowed reverb", "fan edit",
    "1 hour loop", "10 hours loop", "1 hour", "10 hr", "hour loop", "hours loop",
    "bass boosted", "8d audio", "sped up", "nightcore", "ringtone", "bgm ringtone",
    "bhojpuri film", "short film",
    # Cartoons, Kids, Animations & Fan Edits
    "cartoon", "cartoons", "animated", "animation", "nursery rhymes", "nursery rhyme",
    "kids", "kid song", "kids song", "kids songs", "children song", "children songs",
    "anime amv", "amv", "gacha", "gacha life", "meme animation", "stickman",
    "cocomelon", "baby", "baby song", "cartoon video", "peppa pig", "chuchu tv",
    "chuchutv", "rhymes", "rhyme", "lullaby", "bedtime story", "toddler",
    "disney junior", "nick jr", "pinkfong", "doraemon", "shinchan", "oggy",
    "tom and jerry", "motu patlu", "chhota bheem", "little krishna", "ben 10",
    "superhero animation", "2d animation", "3d animation", "fan animated", "flipaclip",
    "claymation", "talking tom", "ai cover", "ai song", "ai music", "fan-made",
    "fan made", "mashup preview", "instrumental remake", "karaoke version",
    "vocal cut", "unofficial", "amateur cover", "cover by fan"
]

VERIFIED_RECORD_LABELS = [
    "t-series", "sony music", "svf", "saregama", "zee music", "universal music",
    "warner music", "tips official", "g-series", "anupam", "eagle music", "speed records",
    "yrf", "eros now", "times music", "aditya music", "lahari music", "virgin music",
    "rca records", "columbia records", "atlantic records", "def jam", "republic records",
    "interscope", "big hit", "hybe", "smtown", "jyp", "yg entertainment", "vevo"
]

def get_official_content_score(channel: str, title: str) -> int:
    c = (channel or "").lower()
    t = (title or "").lower()
    if c.endswith("- topic") or "- topic" in c:
        return 100
    for label in VERIFIED_RECORD_LABELS:
        if label in c:
            return 90
    if "vevo" in c or "official" in c:
        return 80
    if "official audio" in t or "official music video" in t:
        return 70
    if "official video" in t or "audio track" in t:
        return 60
    return 20

def is_blacklisted_media(title: str, channel: str, description: str = "") -> bool:
    t_lower = (title or "").lower()
    c_lower = (channel or "").lower()
    d_lower = (description or "").lower()
    combined = f"{t_lower} {c_lower} {d_lower}"

    for ch in BANNED_CHANNELS:
        if ch in c_lower:
            return True

    for term in NEGATIVE_TERMS:
        if term in combined:
            return True

    if BANNED_COMPILATION_RE.search(t_lower) or BANNED_COMPILATION_RE.search(c_lower):
        return True

    return False

SHORTS_MEDIA_RE = re.compile(r"#(?:shorts|short)\b|\bshorts\b|\bshort video\b|\btiktok\b|\/shorts\/|\(shorts\)|\[shorts\]|\breels?\b|\bytshorts\b", re.IGNORECASE)

def is_shorts_media(title: str, description: str = "", duration: int = 0) -> bool:
    if SHORTS_MEDIA_RE.search(title or "") or SHORTS_MEDIA_RE.search(description or ""):
        return True
    if duration and 0 < duration < 55:
        return True
    return False

def calculate_python_track_score(item: dict) -> float:
    now = time.time()
    pub_str = item.get("publishedAt")
    pub_time = 0
    if pub_str:
        try:
            if "T" in str(pub_str):
                dt = datetime.fromisoformat(str(pub_str).replace("Z", "+00:00"))
                pub_time = dt.timestamp()
            elif len(str(pub_str)) == 8 and str(pub_str).isdigit():
                dt = datetime.strptime(str(pub_str), "%Y%m%d")
                pub_time = dt.timestamp()
        except Exception:
            pass

    days = max(0.2, (now - pub_time) / 86400.0) if pub_time > 0 else 365.0
    views = max(0, int(item.get("viewCount") or item.get("view_count") or 0))

    import math
    daily_velocity = views / days
    hype_score = math.log10(max(1.0, daily_velocity)) * 12.0
    popularity_score = math.log10(max(1.0, views)) * 4.0

    base_freshness = 0.0
    if days <= 7:
        base_freshness = 40.0
    elif days <= 30:
        base_freshness = 30.0
    elif days <= 90:
        base_freshness = 20.0
    elif days <= 180:
        base_freshness = 10.0
    elif days <= 365:
        base_freshness = 5.0
    elif days <= 730:
        base_freshness = 0.0
    elif days <= 1460:
        base_freshness = -12.0
    elif days <= 2555:
        base_freshness = -24.0
    else:
        base_freshness = -38.0

    momentum_scale = min(1.0, max(0.1, daily_velocity / 50.0)) if base_freshness > 0 else 1.0
    freshness = base_freshness * momentum_scale

    official_score = get_official_content_score(item.get("artist") or item.get("channelTitle") or "", item.get("title") or "")
    official_bonus = 15.0 if official_score >= 60 else 0.0

    return hype_score + popularity_score + freshness + official_bonus

def clean_title_and_artist(raw_title: str, channel_name: str) -> tuple[str, str]:
    title = raw_title or "Unknown Title"
    artist = channel_name or "YouTube Artist"

    # 1. Strip hashtags
    cleaned = re.sub(r"#\w+", "", title)

    # 2. Strip bracket/parenthesis clutter: e.g. [Official Music Video], (Official Video), (4K 60FPS), [AMV]
    cleaned = re.sub(
        r"\[\s*(?:Official\s*(?:Music\s*)?Video|Official\s*Audio|Official\s*HD\s*Video|Full\s*Video|Music\s*Video|Lyric\s*Video|Audio|4K|HD|Full\s*Song|Visualizer|Shorts|Lyrics|Lofi|HQ|Full\s*HD|Remastered|Slowed\s*(?:and|&|\+)?\s*Reverb|8D\s*Audio|New\s*Song|Remix\s*Full\s*Song|AMV|Animation|Fan\s*Made)\s*\]",
        "",
        cleaned,
        flags=re.IGNORECASE
    )
    cleaned = re.sub(
        r"\(\s*(?:Official\s*(?:Music\s*)?Video|Official\s*Audio|Official\s*HD\s*Video|Full\s*Video|Music\s*Video|Lyric\s*Video|Audio|4K|HD|Full\s*Song|Visualizer|Shorts|Lyrics|Lofi|HQ|Full\s*HD|Remastered|Slowed\s*(?:and|&|\+)?\s*Reverb|4K\s*60FPS|8D\s*Audio|New\s*Song|Remix\s*Full\s*Song|AMV|Animation|Fan\s*Made|From\s*[^)]+)\s*\)",
        "",
        cleaned,
        flags=re.IGNORECASE
    )

    # 3. Strip prefixes like "Lyrical:", "Audio:", "Video:"
    cleaned = re.sub(r"^(?:Lyrical|Audio|Video|Official\s*Video|Official\s*Audio)\s*:\s*", "", cleaned, flags=re.IGNORECASE)

    # 4. Strip trailing pipe channel or record label annotations
    cleaned = re.sub(
        r"\s*\|\s*(?:Official\s*Video|Official\s*Audio|Full\s*Song|Lyrical\s*Video|Full\s*Audio|T-Series|Sony\s*Music\s*India|SVF|Zee\s*Music\s*Company|Saregama\s*Music|G-Series|Anupam\s*Recording\s*Media|Eagle\s*Music|Tips\s*Official|Speed\s*Records|Speed\s*Audio).*$",
        "",
        cleaned,
        flags=re.IGNORECASE
    ).strip()

    # 5. Strip standalone quality tokens
    cleaned = re.sub(r"\b(?:4K|8K|1080p|720p|60FPS|Full\s*HD|HD|HQ|Visualizer)\b", "", cleaned, flags=re.IGNORECASE).strip()

    # 6. Split "Artist - Title" patterns
    for sep in [" - ", " – ", " — ", " : "]:
        if sep in cleaned:
            parts = cleaned.split(sep, 1)
            p_artist = parts[0].strip()
            p_title = parts[1].strip()
            if p_artist and p_title:
                title = p_title
                artist = p_artist
                break
    else:
        if cleaned:
            title = cleaned

    clean_channel = re.sub(r"\s*-\s*Topic$", "", artist, flags=re.IGNORECASE)
    clean_channel = re.sub(r"\s*VEVO$", "", clean_channel, flags=re.IGNORECASE)
    clean_channel = re.sub(r"\s*Official$", "", clean_channel, flags=re.IGNORECASE).strip()
    if clean_channel:
        artist = clean_channel

    # Extra title cleanup
    title = re.sub(r"\s{2,}", " ", title).strip()

    return title or "Unknown Track", artist or "YouTube Artist"

def parse_iso8601_duration(duration_str: str) -> int:
    if not duration_str:
        return 0
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration_str)
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds

def get_base_url():
    """Determines base URL for constructing stream_url"""
    host = request.host_url.rstrip("/")
    return host

def build_uniform_item(vid_id: str, raw_title: str, channel: str, thumbnail: str, duration: int | float, view_count: int = 0, published_at: str = None, description: str = "", base_url: str = ""):
    title, artist = clean_title_and_artist(raw_title, channel)
    stream_url = f"{base_url}/stream?id={vid_id}" if base_url else f"/stream?id={vid_id}"
    best_thumb = thumbnail or f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"
    dur_seconds = int(duration) if isinstance(duration, (int, float)) and duration > 0 else 0

    return {
        "id": vid_id,
        "title": title,
        "artist": artist,
        "thumbnail": best_thumb,
        "duration": dur_seconds,
        "stream_url": stream_url,
        "audioUrl": stream_url,
        # Backward compatibility properties
        "channelTitle": channel or artist,
        "uploader": channel or artist,
        "viewCount": view_count or 0,
        "view_count": view_count or 0,
        "publishedAt": published_at,
        "description": description or "",
    }

# ---------------------------------------------------------------------------
# Search Provider: YouTube Data API v3 with Automatic Pool Rotation
# ---------------------------------------------------------------------------
def search_youtube_api_pool(query: str, limit: int = 25, base_url: str = "", page_token: str = None, pool: str = "search") -> tuple[list[dict], str | None] | None:
    """
    Attempts to search using YouTube Data API v3 with automatic key rotation on 403 quota errors,
    isolated to the specified pool ("discovery" or "search"), concurrency limiting via semaphore,
    and exponential backoff for transient 429/5xx errors.
    """
    active_pool = get_key_pool(pool)
    max_attempts = max(1, len(active_pool._keys) + 1)
    attempts = 0

    while attempts < max_attempts:
        key = active_pool.get_active_key()
        if not key:
            # Emergency failover: borrow active key from the other pool if available
            fallback_pool = search_key_pool if active_pool == discovery_key_pool else discovery_key_pool
            key = fallback_pool.get_active_key()
            if not key:
                logging.info(f"[YouTubeKeyPool:{active_pool.name}] No active API keys available in primary or fallback pool. Ready for yt-dlp fallback.")
                return None
            logging.warning(f"[YouTube API:{active_pool.name}] Primary pool exhausted. Borrowing active key {YouTubeKeyPool._mask_key(key)} from {fallback_pool.name} pool.")
            active_pool = fallback_pool

        attempts += 1
        masked = YouTubeKeyPool._mask_key(key)
        try:
            with youtube_api_semaphore:
                # 1. Search videos with bounded retry for transient 429/5xx
                search_url = "https://www.googleapis.com/youtube/v3/search"
                params = {
                    "part": "snippet",
                    "type": "video",
                    "videoCategoryId": "10",
                    "videoEmbeddable": "true",
                    "maxResults": min(50, max(limit, 10)),
                    "q": f"{query} -shorts -tiktok -billboard -top10 -top20 -top50 -top100 -recap -countdown -ranking",
                    "key": key,
                }
                if page_token and not page_token.startswith("offset:"):
                    params["pageToken"] = page_token

                res = None
                for retry in range(3):
                    try:
                        res = requests.get(search_url, params=params, timeout=8)
                        if res.status_code == 429 and "RESOURCE_EXHAUSTED" in res.text:
                            break
                        if res.status_code == 429 or (500 <= res.status_code < 600):
                            time.sleep(0.4 * (2 ** retry) + random.uniform(0.05, 0.2))
                            continue
                        break
                    except (requests.Timeout, requests.ConnectionError):
                        if retry < 2:
                            time.sleep(0.4 * (2 ** retry))
                            continue
                        raise

            if not res:
                return None

            if res.status_code == 403 or (res.status_code == 429 and "RESOURCE_EXHAUSTED" in res.text):
                err_data = res.json().get("error", {}) if res.content else {}
                err_msg = err_data.get("message", "Quota Exceeded")
                active_pool.mark_key_exhausted(key, reason=f"HTTP {res.status_code}: {err_msg}")
                continue

            if not res.ok:
                logging.warning(f"[YouTube API:{active_pool.name}] Search returned HTTP {res.status_code} with key {masked}: {res.text[:120]}")
                return None

            data = res.json()
            search_items = data.get("items", [])
            next_page_token = data.get("nextPageToken")
            if not search_items:
                return [], None

            # 2. Extract video IDs to fetch duration & high-quality thumbnail details
            video_ids = [
                item["id"]["videoId"] for item in search_items
                if isinstance(item.get("id"), dict) and item["id"].get("videoId")
            ]

            details_map = {}
            if video_ids:
                with youtube_api_semaphore:
                    details_url = "https://www.googleapis.com/youtube/v3/videos"
                    d_params = {
                        "part": "snippet,contentDetails,statistics,status",
                        "id": ",".join(video_ids),
                        "key": key,
                    }
                    d_res = requests.get(details_url, params=d_params, timeout=8)
                if d_res.status_code == 403:
                    active_pool.mark_key_exhausted(key, reason="403 on video details")
                    continue
                if d_res.ok:
                    for d_item in d_res.json().get("items", []):
                        vid_id = d_item.get("id")
                        if vid_id:
                            details_map[vid_id] = d_item

            # 3. Assemble uniform items
            results = []
            for s_item in search_items:
                vid_id = s_item.get("id", {}).get("videoId") if isinstance(s_item.get("id"), dict) else s_item.get("id")
                if not vid_id:
                    continue

                snippet = s_item.get("snippet", {})
                detail = details_map.get(vid_id, {})
                content_details = detail.get("contentDetails", {})
                statistics = detail.get("statistics", {})
                status_info = detail.get("status", {})

                # Strict rejection of kids/cartoons content & non-music categories
                if status_info.get("madeForKids") or status_info.get("selfDeclaredMadeForKids"):
                    continue
                # Skip non-embeddable videos — these cause YouTube error 101/150 in the player
                if detail and status_info.get("embeddable") is False:
                    continue
                if detail.get("snippet", {}).get("categoryId") and detail.get("snippet", {}).get("categoryId") != "10":
                    continue

                d_snippet = detail.get("snippet", {}) if isinstance(detail, dict) else {}
                raw_title = d_snippet.get("title") or snippet.get("title", "")
                channel = (
                    d_snippet.get("channelTitle")
                    or d_snippet.get("videoOwnerChannelTitle")
                    or snippet.get("channelTitle")
                    or snippet.get("videoOwnerChannelTitle")
                    or ""
                )
                desc = d_snippet.get("description") or snippet.get("description", "")
                published_at = d_snippet.get("publishedAt") or snippet.get("publishedAt")

                if is_blacklisted_media(raw_title, channel, desc):
                    continue

                # Parse duration
                dur_iso = content_details.get("duration", "")
                duration = parse_iso8601_duration(dur_iso)

                # Filter duration (60s to 480s bounds when duration is known)
                if duration > 0 and (duration < 60 or duration > 480):
                    continue

                # Thumbnail selection
                thumbnails = (detail.get("snippet", {}).get("thumbnails") or snippet.get("thumbnails") or {})
                thumb_url = (
                    thumbnails.get("maxres", {}).get("url")
                    or thumbnails.get("high", {}).get("url")
                    or thumbnails.get("medium", {}).get("url")
                    or f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"
                )

                view_count = int(statistics.get("viewCount", 0)) if str(statistics.get("viewCount", "")).isdigit() else 0

                uniform_item = build_uniform_item(
                    vid_id=vid_id,
                    raw_title=raw_title,
                    channel=channel,
                    thumbnail=thumb_url,
                    duration=duration,
                    view_count=view_count,
                    published_at=published_at,
                    description=desc,
                    base_url=base_url
                )
                results.append(uniform_item)

            results.sort(key=lambda it: get_official_content_score(it.get("artist", ""), it.get("title", "")), reverse=True)
            return results[:limit], next_page_token

        except Exception as e:
            logging.error(f"[YouTube API:{active_pool.name}] Search error with key {YouTubeKeyPool._mask_key(key)}: {str(e)}")
            return None

    return None

# ---------------------------------------------------------------------------
# Search Provider: yt-dlp Microservice Fallback (extract_flat: True)
# ---------------------------------------------------------------------------
def search_ytdlp_fallback(query: str, limit: int = 25, base_url: str = "", offset: int = 0) -> tuple[list[dict], str | None]:
    """
    Zero-downtime search fallback using yt-dlp with extract_flat=True.
    """
    try:
        ydl_opts = get_base_ydl_opts()
        ydl_opts["skip_download"] = True
        ydl_opts["extract_flat"] = True

        fetch_limit = min(250, max(offset + limit + 35, 60))
        search_query = f"ytsearch{fetch_limit}:{query.strip()}"

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(search_query, download=False)
            entries = res.get("entries", []) or []

            items = []
            for entry in entries:
                if not entry or not entry.get("id"):
                    continue
                vid_id = entry.get("id")
                dur = entry.get("duration") or 0
                title = entry.get("title") or "Unknown Title"
                uploader = entry.get("uploader") or entry.get("channel") or "Unknown Channel"
                desc = entry.get("description") or ""

                # Strict rejection of kids, cartoons, news & blacklisted media
                if is_blacklisted_media(title, uploader, desc):
                    continue
                if isinstance(dur, (int, float)) and dur > 0 and (dur < 60 or dur > 480):
                    continue

                thumbnails = entry.get("thumbnails") or []
                best_thumb = f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"
                if thumbnails:
                    best_thumb = thumbnails[-1].get("url") or best_thumb

                item = build_uniform_item(
                    vid_id=vid_id,
                    raw_title=title,
                    channel=uploader,
                    thumbnail=best_thumb,
                    duration=dur,
                    view_count=entry.get("view_count") or 0,
                    published_at=entry.get("upload_date"),
                    description=desc,
                    base_url=base_url
                )
                items.append(item)

            # Sort items by official credibility score
            items.sort(key=lambda it: get_official_content_score(it.get("artist", ""), it.get("title", "")), reverse=True)

            sliced_items = items[offset:offset + limit] if offset > 0 else items[:limit]
            next_token = f"offset:{offset + limit}" if len(items) > (offset + limit) else (f"offset:{offset + limit}" if len(sliced_items) >= limit else None)
            return sliced_items, next_token

    except Exception as e:
        logging.error(f"[yt-dlp fallback] Error executing search: {str(e)}")
        return [], None

# ---------------------------------------------------------------------------
# Core Unified Search Controller with Dual-Tier Caching & Single-Flight
# ---------------------------------------------------------------------------
def execute_search(query: str, limit: int = 25, search_type: str = "general", page_token: str = None, pool: str = None) -> tuple[list[dict], str | None, str]:
    normalized_q = query.strip().lower()
    if not normalized_q:
        return [], None, "none"

    target_pool = pool if pool else ("discovery" if search_type in ("category", "discovery", "trending") else "search")
    cache_key = f"search:{target_pool}:{normalized_q}:limit={limit}:type={search_type}:token={page_token or '0'}"
    cached_data = search_cache.get(cache_key)
    if cached_data is not None:
        request_budget.record_request("search", hit=True)
        return cached_data.get("items", []), cached_data.get("nextPageToken"), "cache"

    def _do_search():
        request_budget.record_request("search", hit=False, upstream=True)
        base_url = get_base_url()

        # 1. Try YouTube Data API Pool with designated pool
        api_res = search_youtube_api_pool(query.strip(), limit=limit, base_url=base_url, page_token=page_token, pool=target_pool)
        if api_res is not None:
            if isinstance(api_res, tuple) and len(api_res) == 2:
                items, next_token = api_res
            elif isinstance(api_res, list):
                items, next_token = api_res, None
            else:
                items, next_token = [], None

            if len(items) > 0:
                search_cache.set(cache_key, {"items": items, "nextPageToken": next_token}, ttl=900)
                return items, next_token, "youtube_api"

        # 2. Fallback to yt-dlp Microservice
        offset = 0
        if page_token and page_token.startswith("offset:"):
            try:
                offset = int(page_token.split(":")[1])
            except Exception:
                offset = 0

        logging.info(f"[Search Engine] Falling back to yt-dlp for query: '{query.strip()}' (pool={target_pool})")
        ytdlp_res = search_ytdlp_fallback(query.strip(), limit=limit, base_url=base_url, offset=offset)
        if ytdlp_res:
            if isinstance(ytdlp_res, tuple) and len(ytdlp_res) == 2:
                ytdlp_items, ytdlp_next = ytdlp_res
            elif isinstance(ytdlp_res, list):
                ytdlp_items, ytdlp_next = ytdlp_res, None
            else:
                ytdlp_items, ytdlp_next = [], None

            if ytdlp_items:
                search_cache.set(cache_key, {"items": ytdlp_items, "nextPageToken": ytdlp_next}, ttl=900)
                return ytdlp_items, ytdlp_next, "yt_dlp"

        return [], None, "none"

    return single_flight.execute(f"flight:{cache_key}", _do_search)


def fetch_trending_feed(region: str = "BD", limit: int = 50, section_id: str = "bangla", page_token: str = None) -> tuple[list[dict], str | None]:
    """
    Fetches the live YouTube MEVO Pulse trending feed via official music charts (chart=mostPopular&videoCategoryId=10),
    filtered for shorts, non-music, and ranked by current velocity, freshness, and popularity.
    Powered by Pool A (Song Discovery).
    """
    cache_key = f"youtube:trending:{region}:{limit}:{page_token or '0'}"
    cached = search_cache.get(cache_key)
    if cached is not None:
        request_budget.record_request("trending", hit=True)
        return cached

    def _generate_trending():
        request_budget.record_request("trending", hit=False, upstream=True)
        base_url = get_base_url()

        # 1. First priority: Official YouTube Music Chart using Pool A (Song Discovery)
        key = discovery_key_pool.get_active_key()
        if key:
            try:
                with youtube_api_semaphore:
                    t_url = "https://www.googleapis.com/youtube/v3/videos"
                    t_params = {
                        "part": "snippet,contentDetails,statistics,status",
                        "chart": "mostPopular",
                        "videoCategoryId": "10",
                        "regionCode": region,
                        "maxResults": 50,
                        "key": key
                    }
                    if page_token:
                        t_params["pageToken"] = page_token
                    t_res = requests.get(t_url, params=t_params, timeout=8)
                    if t_res.status_code == 403:
                        discovery_key_pool.mark_key_exhausted(key, "403 on chart trending")
                    elif t_res.ok:
                        data = t_res.json()
                        raw_items = data.get("items", [])
                        next_page_token = data.get("nextPageToken")
                        valid_items = []
                        seen_ids = set()
                        for it in raw_items:
                            vid_id = it.get("id")
                            if not vid_id or vid_id in seen_ids:
                                continue
                            snippet = it.get("snippet", {})
                            content = it.get("contentDetails", {})
                            stats = it.get("statistics", {})
                            status = it.get("status", {})

                            if status.get("embeddable") is False or status.get("madeForKids") or status.get("selfDeclaredMadeForKids"):
                                continue

                            raw_t = snippet.get("title", "")
                            channel = snippet.get("channelTitle", "")
                            desc = snippet.get("description", "")
                            dur = parse_iso8601_duration(content.get("duration", ""))

                            if is_blacklisted_media(raw_t, channel, desc) or is_shorts_media(raw_t, desc, dur):
                                continue
                            if dur > 0 and (dur < 55 or dur > 480):
                                continue

                            thumbnails = snippet.get("thumbnails", {})
                            thumb = (
                                thumbnails.get("maxres", {}).get("url")
                                or thumbnails.get("high", {}).get("url")
                                or thumbnails.get("medium", {}).get("url")
                                or f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"
                            )
                            views = int(stats.get("viewCount", 0)) if str(stats.get("viewCount", "")).isdigit() else 0

                            seen_ids.add(vid_id)
                            uniform = build_uniform_item(
                                vid_id=vid_id,
                                raw_title=raw_t,
                                channel=channel,
                                thumbnail=thumb,
                                duration=dur,
                                view_count=views,
                                published_at=snippet.get("publishedAt"),
                                description=desc,
                                base_url=base_url
                            )
                            uniform["section"] = section_id
                            uniform["category"] = "MEVO Pulse"
                            uniform["trending"] = True
                            valid_items.append(uniform)

                        if valid_items:
                            valid_items.sort(key=lambda x: calculate_python_track_score(x), reverse=True)
                            res = (valid_items, next_page_token)
                            search_cache.set(cache_key, res, ttl=1200)
                            return res
            except Exception as e:
                logging.warning(f"[fetch_trending_feed] YouTube API chart error: {e}")

        # 2. Fallback: Multi-category fresh music candidate search (routes via Pool A: discovery)
        PULSE_CATEGORIES = [
            ("hindi", "latest hindi official audio songs | trending bollywood music video -top10 -top20 -top50 -recap"),
            ("english", "viral english pop official audio | new english songs official -billboard -top10 -top20 -recap"),
            ("boost-aura", "drift phonk official audio | brazilian phonk viral audio -top10 -top20 -recap"),
            ("global", "kpop official audio | latin viral hits official video | afrobeats official audio -billboard -top10 -recap"),
            ("bangla", "new bangla songs official music video | latest bangla band official audio -top10 -top20 -recap"),
        ]
        category_target = max(10, (limit // len(PULSE_CATEGORIES)) + 2)
        category_lists = []

        for sec_genre, cat_query in PULSE_CATEGORIES:
            items, _, _ = execute_search(cat_query, limit=category_target, search_type="discovery", pool="discovery")
            if items:
                genre_items = []
                for it in items:
                    song_it = dict(it)
                    song_it["section"] = sec_genre
                    song_it["category"] = "MEVO Pulse"
                    song_it["trending"] = True
                    genre_items.append(song_it)
                category_lists.append(genre_items)

        blended = []
        seen_ids = set()
        max_len = max([len(l) for l in category_lists], default=0)

        for i in range(max_len):
            for l in category_lists:
                if i < len(l):
                    item = l[i]
                    vid_id = item.get("id")
                    if vid_id and vid_id not in seen_ids:
                        dur = item.get("duration", 0)
                        raw_t = item.get("title", "")
                        desc = item.get("description", "")
                        if is_shorts_media(raw_t, desc, dur):
                            continue
                        if not dur or (55 <= dur <= 480):
                            seen_ids.add(vid_id)
                            blended.append(item)

        if blended:
            blended.sort(key=lambda x: calculate_python_track_score(x), reverse=True)
            res = blended[:limit]
            search_cache.set(cache_key, res, ttl=1200)
            return res

        # 3. Final Fallback (routes via Pool A: discovery)
        fallback_items, _, _ = execute_search(
            "latest hindi bollywood english pop phonk viral official audio -billboard -top10 -top20 -top50 -top100 -recap -countdown",
            limit=limit * 2,
            search_type="discovery",
            pool="discovery"
        )
        final_list = []
        for it in fallback_items:
            vid_id = it.get("id")
            if vid_id and vid_id not in seen_ids:
                dur = it.get("duration", 0)
                raw_t = item.get("title", "")
                desc = it.get("description", "")
                if is_shorts_media(raw_t, desc, dur):
                    continue
                if not dur or (55 <= dur <= 480):
                    seen_ids.add(vid_id)
                    song_it = dict(it)
                    song_it["section"] = section_id
                    song_it["category"] = "MEVO Pulse"
                    song_it["trending"] = True
                    final_list.append(song_it)

        final_list.sort(key=lambda x: calculate_python_track_score(x), reverse=True)
        res = final_list[:limit]
        search_cache.set(cache_key, res, ttl=1200)
        return res

    return single_flight.execute(f"flight:{cache_key}", _generate_trending)


def fetch_category_feed(query: str, order: str = "viewCount", limit: int = 25, page_token: str = None, section_id: str = "bangla", category_title: str = "Category") -> dict:
    """
    Fetches category tracks with uniform player song output, query pagination, and single-flight coalescing.
    Powered by Pool A (Song Discovery).
    """
    normalized_q = query.strip().lower()
    cache_key = f"youtube:category:{normalized_q}:{order}:{limit}:{page_token or '0'}"
    cached = search_cache.get(cache_key)
    if cached is not None:
        request_budget.record_request("category", hit=True)
        return cached

    def _do_category():
        request_budget.record_request("category", hit=False, upstream=True)
        search_limit = 50
        items, next_token, source = execute_search(query, limit=search_limit, search_type="category", page_token=page_token, pool="discovery")
        songs = []
        for it in items:
            raw_t = it.get("title", "")
            desc = it.get("description", "")
            dur = it.get("duration", 0)
            if is_shorts_media(raw_t, desc, dur):
                continue
            if dur and (dur < 55 or dur > 480):
                continue
            song_it = dict(it)
            song_it["section"] = section_id
            song_it["category"] = category_title
            songs.append(song_it)

        songs.sort(key=lambda x: calculate_python_track_score(x), reverse=True)
        sliced_songs = songs

        result = {
            "songs": sliced_songs,
            "nextPageToken": next_token,
            "count": len(sliced_songs),
            "source": source
        }
        search_cache.set(cache_key, result, ttl=1800)
        return result

    return single_flight.execute(f"flight:{cache_key}", _do_category)


def fetch_video_details_batch(video_ids: list[str], pool: str = "discovery") -> dict:
    clean_ids = [extract_video_id(v) for v in video_ids if extract_video_id(v)]
    if not clean_ids:
        return {}

    result_map = {}
    missing_ids = []

    for vid in clean_ids:
        cached = search_cache.get(f"video_detail:{vid}")
        if cached:
            result_map[vid] = cached
        else:
            missing_ids.append(vid)

    if not missing_ids:
        return result_map

    active_pool = get_key_pool(pool)
    key = active_pool.get_active_key()
    if key and missing_ids:
        for i in range(0, len(missing_ids), 50):
            chunk = missing_ids[i:i+50]
            try:
                with youtube_api_semaphore:
                    d_url = "https://www.googleapis.com/youtube/v3/videos"
                    params = {
                        "part": "snippet,contentDetails,statistics,status",
                        "id": ",".join(chunk),
                        "key": key
                    }
                    res = requests.get(d_url, params=params, timeout=8)
                    if res.status_code == 403:
                        active_pool.mark_key_exhausted(key, "403 on video details batch")
                        break
                    if res.ok:
                        for item in res.json().get("items", []):
                            v_id = item.get("id")
                            if v_id:
                                snippet = item.get("snippet", {})
                                content_details = item.get("contentDetails", {})
                                stats = item.get("statistics", {})
                                thumbs = snippet.get("thumbnails", {})
                                best_thumb = (
                                    thumbs.get("maxres", {}).get("url")
                                    or thumbs.get("high", {}).get("url")
                                    or thumbs.get("medium", {}).get("url")
                                    or f"https://img.youtube.com/vi/{v_id}/hqdefault.jpg"
                                )
                                dur = parse_iso8601_duration(content_details.get("duration", ""))
                                v_data = {
                                    "id": v_id,
                                    "title": snippet.get("title", ""),
                                    "channelTitle": snippet.get("channelTitle", ""),
                                    "thumbnail": best_thumb,
                                    "duration": dur,
                                    "viewCount": int(stats.get("viewCount", 0)) if str(stats.get("viewCount", "")).isdigit() else 0,
                                    "publishedAt": snippet.get("publishedAt"),
                                    "description": snippet.get("description", ""),
                                }
                                result_map[v_id] = v_data
                                search_cache.set(f"video_detail:{v_id}", v_data, ttl=43200)
            except Exception as e:
                logging.error(f"[Batch Details] Error: {e}")

    return result_map


# ---------------------------------------------------------------------------
# API Routes: /api/search & /search
# ---------------------------------------------------------------------------
@app.route("/api/search", methods=["GET", "POST", "OPTIONS"])
@app.route("/search", methods=["GET", "POST", "OPTIONS"])
def search_endpoint():
    if request.method == "OPTIONS":
        response = Response("", status=200)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response

    client_ip = request.remote_addr or "unknown"
    if not rate_limiter.allow(client_ip):
        return jsonify({"error": "Rate limit exceeded. Please try again shortly.", "code": 429}), 429

    try:
        data = request.get_json(silent=True) or {}
        query = request.args.get("q") or request.args.get("query") or data.get("q") or data.get("query") or ""
        limit = int(request.args.get("limit") or data.get("limit") or 25)
        limit = max(1, min(50, limit))
        search_type = request.args.get("type") or data.get("type") or "general"
        page_token = request.args.get("pageToken") or request.args.get("page_token") or data.get("pageToken") or data.get("page_token")
        pool_param = request.args.get("pool") or data.get("pool")

        # Isolated routing: discovery requests use Pool A; live searches use Pool B
        target_pool = "discovery" if (pool_param == "discovery" or search_type in ("category", "discovery")) else "search"

        if not query.strip():
            return jsonify({
                "items": [],
                "count": 0,
                "nextPageToken": None,
                "source": "none",
                "query": "",
                "pool": target_pool
            })

        items, next_page_token, source = execute_search(query, limit=limit, search_type=search_type, page_token=page_token, pool=target_pool)

        return jsonify({
            "items": items,
            "count": len(items),
            "nextPageToken": next_page_token,
            "source": source,
            "query": query.strip(),
            "pool": target_pool
        })

    except Exception as e:
        logging.error(f"Search endpoint error: {str(e)}")
        return jsonify({"error": str(e), "items": [], "count": 0, "source": "error"}), 500


# ---------------------------------------------------------------------------
# API Routes: /api/youtube/trending & /api/trending
# ---------------------------------------------------------------------------
@app.route("/api/youtube/trending", methods=["GET", "OPTIONS"])
@app.route("/api/trending", methods=["GET", "OPTIONS"])
def trending_endpoint():
    if request.method == "OPTIONS":
        response = Response("", status=200)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return response

    client_ip = request.remote_addr or "unknown"
    if not rate_limiter.allow(client_ip):
        return jsonify({"error": "Rate limit exceeded. Please try again shortly.", "code": 429}), 429

    try:
        region = request.args.get("region") or "BD"
        limit = int(request.args.get("limit") or 50)
        limit = max(1, min(100, limit))
        section_id = request.args.get("sectionId") or "bangla"
        page_token = request.args.get("pageToken") or request.args.get("page_token")

        items, next_page_token = fetch_trending_feed(region=region, limit=limit, section_id=section_id, page_token=page_token)
        return jsonify({
            "items": items,
            "count": len(items),
            "region": region,
            "nextPageToken": next_page_token
        })
    except Exception as e:
        logging.error(f"Trending endpoint error: {e}")
        return jsonify({"error": str(e), "items": [], "count": 0}), 500


# ---------------------------------------------------------------------------
# API Routes: /api/youtube/category & /api/category
# ---------------------------------------------------------------------------
@app.route("/api/youtube/category", methods=["GET", "OPTIONS"])
@app.route("/api/category", methods=["GET", "OPTIONS"])
def category_endpoint():
    if request.method == "OPTIONS":
        response = Response("", status=200)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return response

    client_ip = request.remote_addr or "unknown"
    if not rate_limiter.allow(client_ip):
        return jsonify({"error": "Rate limit exceeded. Please try again shortly.", "code": 429}), 429

    try:
        query = request.args.get("q") or request.args.get("query") or ""
        order = request.args.get("order") or "viewCount"
        limit = int(request.args.get("limit") or 25)
        limit = max(1, min(50, limit))
        page_token = request.args.get("pageToken") or request.args.get("page_token")
        section_id = request.args.get("sectionId") or "bangla"
        category_title = request.args.get("categoryTitle") or "Category"

        if not query.strip():
            return jsonify({"songs": [], "count": 0, "nextPageToken": None})

        result = fetch_category_feed(
            query=query,
            order=order,
            limit=limit,
            page_token=page_token,
            section_id=section_id,
            category_title=category_title
        )
        return jsonify(result)
    except Exception as e:
        logging.error(f"Category endpoint error: {e}")
        return jsonify({"error": str(e), "songs": [], "count": 0, "nextPageToken": None}), 500


# ---------------------------------------------------------------------------
# API Routes: /api/youtube/videos & /api/videos
# ---------------------------------------------------------------------------
@app.route("/api/youtube/videos", methods=["GET", "POST", "OPTIONS"])
@app.route("/api/videos", methods=["GET", "POST", "OPTIONS"])
def videos_endpoint():
    if request.method == "OPTIONS":
        response = Response("", status=200)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response

    try:
        data = request.get_json(silent=True) or {}
        ids_raw = request.args.get("ids") or data.get("ids") or ""
        if isinstance(ids_raw, str):
            ids_list = [id_str.strip() for id_str in ids_raw.split(",") if id_str.strip()]
        elif isinstance(ids_raw, list):
            ids_list = [str(id_str).strip() for id_str in ids_raw if str(id_str).strip()]
        else:
            ids_list = []

        if not ids_list:
            return jsonify({"items": {}})

        pool_param = request.args.get("pool") or data.get("pool") or "discovery"
        target_pool = "search" if pool_param == "search" else "discovery"
        result = fetch_video_details_batch(ids_list[:50], pool=target_pool)
        return jsonify({"items": result, "pool": target_pool})
    except Exception as e:
        logging.error(f"Videos endpoint error: {e}")
        return jsonify({"error": str(e), "items": {}}), 500

# ---------------------------------------------------------------------------
# API Routes: /api/extract, /extract & /info (Uniform Metadata Extraction)
# ---------------------------------------------------------------------------
@app.route("/api/extract", methods=["POST", "GET", "OPTIONS"])
@app.route("/extract", methods=["POST", "GET", "OPTIONS"])
@app.route("/info", methods=["POST", "GET", "OPTIONS"])
def extract_metadata_endpoint():
    if request.method == "OPTIONS":
        response = Response("", status=200)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response

    try:
        data = request.get_json(silent=True) or {}
        raw_input = request.args.get("id") or request.args.get("url") or data.get("url") or data.get("id")
        if not raw_input:
            return jsonify({"error": "YouTube URL or ID is required"}), 400

        vid_id = extract_video_id(raw_input)
        cache_key = f"extract:{vid_id}"
        cached_item = search_cache.get(cache_key)
        if cached_item is not None:
            request_budget.record_request("extract", hit=True)
            return jsonify(cached_item)

        def _do_extract():
            request_budget.record_request("extract", hit=False, upstream=True)
            video_url = build_watch_url(raw_input)
            base_url = get_base_url()

            client_fallbacks = [
                ["ios", "android"],
                ["android"],
                ["ios"],
                ["mweb", "web_safari"],
            ]

            info = None
            last_err = None
            for client_list in client_fallbacks:
                try:
                    ydl_opts = get_base_ydl_opts(client_list=client_list)
                    ydl_opts["skip_download"] = True
                    with extractor_semaphore:
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            info = ydl.extract_info(video_url, download=False)
                            if info:
                                break
                except Exception as ex:
                    last_err = ex
                    msg = str(ex).lower()
                    if "bot" in msg or "sign in" in msg or "429" in msg:
                        logging.warning(f"[ExtractMetadata] Challenge with client {client_list}, trying fallback...")
                        continue
                    break

            if not info:
                if last_err:
                    raise last_err
                raise Exception("Failed to extract metadata")

            extracted_id = info.get("id") or vid_id
            raw_title = info.get("title") or "Unknown Title"
            channel = info.get("uploader") or info.get("channel") or "Unknown Channel"
            duration = info.get("duration") or 0
            thumbnail = info.get("thumbnail") or f"https://img.youtube.com/vi/{extracted_id}/hqdefault.jpg"
            view_count = info.get("view_count") or 0
            published_at = info.get("upload_date")
            desc = info.get("description") or ""

            uniform_obj = build_uniform_item(
                vid_id=extracted_id,
                raw_title=raw_title,
                channel=channel,
                thumbnail=thumbnail,
                duration=duration,
                view_count=view_count,
                published_at=published_at,
                description=desc,
                base_url=base_url
            )
            # Add extra direct stream reference for extractor clients
            uniform_obj["audioUrl"] = f"{base_url}/stream?id={extracted_id}"

            # Cache extract metadata for 12 hours
            search_cache.set(cache_key, uniform_obj, ttl=43200)
            return uniform_obj

        result = single_flight.execute(f"flight:{cache_key}", _do_extract)
        return jsonify(result)

    except Exception as e:
        logging.error(f"Extract endpoint error: {str(e)}")
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------------------------
# API Routes: /stream & /download
# ---------------------------------------------------------------------------
@app.route("/stream", methods=["GET", "HEAD", "POST", "OPTIONS"])
def stream_audio():
    if request.method == "OPTIONS":
        return "", 200

    try:
        data = request.get_json(silent=True) or {}
        raw_input = request.args.get("id") or request.args.get("url") or data.get("url") or data.get("id")
        if not raw_input:
            return jsonify({"error": "Video ID or URL parameter missing"}), 400

        vid_id = extract_video_id(raw_input)
        video_url = build_watch_url(raw_input)
        force_refresh = request.args.get("refresh") == "1" or request.args.get("force") == "1"

        if request.method == "POST":
            base_url = get_base_url()
            stream_path = f"{base_url}/stream?id={vid_id}" if base_url else f"/stream?id={vid_id}"
            return jsonify({
                "id": vid_id,
                "audioUrl": stream_path,
                "stream_url": stream_path,
            })

        cache_key = f"stream:{vid_id}"
        audio_url = None

        if not force_refresh:
            cached_stream = search_cache.get(cache_key)
            if cached_stream:
                request_budget.record_request("stream", hit=True)
                audio_url = cached_stream.get("audioUrl") if isinstance(cached_stream, dict) else cached_stream

        # 2. Extract direct audio stream with mobile player clients (ios, android)
        def _extract_stream():
            request_budget.record_request("stream", hit=False, upstream=True)

            client_fallbacks = [
                ["android", "ios", "web"],
                ["ios", "android"],
                ["android"],
                ["ios"],
            ]

            format_fallbacks = [
                "bestaudio/best",
                "bestaudio[ext=m4a]/bestaudio/best",
                "best",
            ]

            last_err = None
            for client_list in client_fallbacks:
                for fmt in format_fallbacks:
                    try:
                        ydl_opts = get_base_ydl_opts(client_list=client_list)
                        ydl_opts.update({
                            "format": fmt,
                            "skip_download": True,
                        })

                        with extractor_semaphore:
                            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                                info = ydl.extract_info(video_url, download=False)
                                extracted_url = info.get("url")

                                if not extracted_url and "formats" in info:
                                    audio_formats = [
                                        f for f in info["formats"]
                                        if f.get("url") and (
                                            f.get("acodec") != "none"
                                            or "audio" in (f.get("format_note") or "").lower()
                                            or f.get("resolution") == "audio only"
                                        )
                                    ]
                                    if not audio_formats:
                                        audio_formats = [f for f in info["formats"] if f.get("url")]
                                    if audio_formats:
                                        audio_formats.sort(
                                            key=lambda f: (f.get("abr") or f.get("tbr") or 0),
                                            reverse=True,
                                        )
                                        extracted_url = audio_formats[0].get("url")

                                if extracted_url:
                                    base_url = get_base_url()
                                    stream_data = {
                                        "audioUrl": extracted_url,
                                        "stream_url": extracted_url,
                                        "title": info.get("title", ""),
                                        "uploader": info.get("uploader", ""),
                                        "duration": info.get("duration", 0),
                                        "thumbnail": info.get("thumbnail", ""),
                                        "id": vid_id,
                                    }
                                    search_cache.set(cache_key, stream_data, ttl=10800)
                                    return stream_data
                    except Exception as ex:
                        last_err = ex
                        msg = str(ex).lower()
                        if "bot" in msg or "sign in" in msg or "429" in msg or "login" in msg:
                            logging.warning(f"[StreamExtraction] Challenge with client {client_list}, trying next client...")
                            break
                        continue

            if last_err:
                raise last_err
            return None

        if not audio_url:
            stream_info = single_flight.execute(f"flight:{cache_key}", _extract_stream)
            if stream_info and stream_info.get("audioUrl"):
                audio_url = stream_info["audioUrl"]

        if not audio_url:
            return jsonify({"error": "Failed to resolve stream URL."}), 404

        # 3. Server-side Stream Proxying (Never 302 redirect directly to googlevideo.com)
        # YouTube CDN rejects open-ended ranges (e.g. bytes=0-) or un-ranged requests with 403 Forbidden.
        # Clamp to bounded 1MB chunks to ensure consistent HTTP 206 Partial Content responses.
        range_header = request.headers.get("Range")
        chunk_size = 1048576  # 1 MB chunk
        if range_header:
            match = re.match(r"bytes=(\d+)-(\d*)", range_header)
            if match:
                start = int(match.group(1)) if match.group(1) else 0
                client_end = int(match.group(2)) if match.group(2) else None
                end = min(client_end, start + chunk_size - 1) if client_end is not None else start + chunk_size - 1
                upstream_range = f"bytes={start}-{end}"
            else:
                upstream_range = f"bytes=0-{chunk_size - 1}"
        else:
            upstream_range = f"bytes=0-{chunk_size - 1}"

        upstream_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "identity;q=1, *;q=0",
            "Range": upstream_range,
        }

        upstream_res = None
        try:
            upstream_res = requests.get(audio_url, headers=upstream_headers, stream=True, timeout=15)
        except Exception as fetch_err:
            logging.warning(f"[StreamProxy] Initial fetch failed for {vid_id}: {fetch_err}")

        # Invalidate cache and retry extraction if upstream returns 403 Forbidden or fails
        if upstream_res is None or upstream_res.status_code == 403:
            logging.warning(f"[StreamProxy] Upstream 403 Forbidden for {vid_id}, refreshing extraction...")
            search_cache.delete(cache_key)
            try:
                refreshed_info = _extract_stream()
                if refreshed_info and refreshed_info.get("audioUrl"):
                    audio_url = refreshed_info["audioUrl"]
                    upstream_res = requests.get(audio_url, headers=upstream_headers, stream=True, timeout=15)
            except Exception as retry_err:
                logging.error(f"[StreamProxy] Retry extraction failed for {vid_id}: {retry_err}")

        if upstream_res is None or not upstream_res.ok:
            status_code = upstream_res.status_code if upstream_res is not None else 502
            return jsonify({"error": "Failed to stream audio from upstream source", "status": status_code}), status_code

        content_type = upstream_res.headers.get("Content-Type") or "audio/mp4"

        if request.method == "HEAD":
            head_resp = Response("", status=upstream_res.status_code)
            head_resp.headers["Content-Type"] = content_type
            head_resp.headers["Access-Control-Allow-Origin"] = "*"
            head_resp.headers["Access-Control-Allow-Headers"] = "Range, Content-Type, Accept, User-Agent"
            head_resp.headers["Access-Control-Expose-Headers"] = "Content-Range, Content-Length, Accept-Ranges"
            head_resp.headers["Accept-Ranges"] = "bytes"
            if "Content-Length" in upstream_res.headers:
                head_resp.headers["Content-Length"] = upstream_res.headers["Content-Length"]
            if "Content-Range" in upstream_res.headers:
                head_resp.headers["Content-Range"] = upstream_res.headers["Content-Range"]
            return head_resp

        def generate_audio_chunks():
            try:
                for chunk in upstream_res.iter_content(chunk_size=65536):
                    if chunk:
                        yield chunk
            except GeneratorExit:
                upstream_res.close()
            except Exception as pipe_err:
                logging.debug(f"[StreamProxy] Client disconnected during chunk streaming: {pipe_err}")
                upstream_res.close()

        response_headers = {
            "Content-Type": content_type,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Range, Content-Type, Accept, User-Agent",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=10800",
        }
        if "Content-Range" in upstream_res.headers:
            response_headers["Content-Range"] = upstream_res.headers["Content-Range"]
        if "Content-Length" in upstream_res.headers:
            response_headers["Content-Length"] = upstream_res.headers["Content-Length"]

        return Response(
            stream_with_context(generate_audio_chunks()),
            status=upstream_res.status_code,
            headers=response_headers,
        )

    except Exception as e:
        logging.error(f"Stream error: {str(e)}")
        return jsonify({"error": str(e)}), 500

def verify_device_download_approval(song_id: str, device_id: str) -> bool:
    """
    Queries Supabase device_whitelist table to verify device is globally approved for downloads.
    Also falls back to checking per-song download_requests table if needed.
    """
    if not device_id:
        return False

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or ""
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("VITE_SUPABASE_ANON_KEY")
        or ""
    )

    if not supabase_url or not supabase_key:
        logging.warning("[DownloadAuth] Supabase URL or Key not set. Allowing request in local dev.")
        return True

    clean_url = supabase_url.rstrip("/")
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Accept": "application/json",
    }

    try:
        # 1. Check Global Device Whitelist
        whitelist_endpoint = f"{clean_url}/rest/v1/device_whitelist?select=status&device_id=eq.{device_id}&limit=1"
        res = requests.get(whitelist_endpoint, headers=headers, timeout=5)
        if res.ok:
            records = res.json()
            if records and isinstance(records, list) and len(records) > 0:
                status = records[0].get("status")
                if status == "approved":
                    return True
                elif status in ["pending", "revoked"]:
                    return False

        # 2. Optional Fallback: Per-song download_requests table
        if song_id:
            clean_song_id = extract_video_id(song_id) or song_id
            req_endpoint = f"{clean_url}/rest/v1/download_requests?select=status&device_id=eq.{device_id}&or=(song_id.eq.{clean_song_id},song_id.eq.yt-{clean_song_id})&limit=1"
            req_res = requests.get(req_endpoint, headers=headers, timeout=5)
            if req_res.ok:
                req_records = req_res.json()
                if req_records and isinstance(req_records, list) and len(req_records) > 0:
                    return req_records[0].get("status") == "approved"

        return False
    except Exception as e:
        logging.error(f"[DownloadAuth] Verification error: {e}")
        return False

@app.route("/api/download", methods=["POST", "GET", "OPTIONS"])
@app.route("/download", methods=["POST", "GET", "OPTIONS"])
def extract_and_download():
    if request.method == "OPTIONS":
        response = Response("", status=200)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Device-ID"
        response.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
        return response

    req_id = uuid.uuid4().hex[:12]
    try:
        data = request.get_json(silent=True) or {}
        raw_input = (
            request.args.get("songId")
            or request.args.get("song_id")
            or request.args.get("id")
            or request.args.get("url")
            or data.get("songId")
            or data.get("song_id")
            or data.get("url")
            or data.get("id")
        )
        device_id = (
            request.args.get("deviceId")
            or request.args.get("device_id")
            or request.headers.get("X-Device-ID")
            or data.get("deviceId")
            or data.get("device_id")
        )

        if not raw_input:
            return jsonify({"error": "Song ID or YouTube URL is required"}), 400

        # Validate Device Authorization with Supabase if deviceId is provided
        if device_id:
            is_approved = verify_device_download_approval(raw_input, device_id)
            if not is_approved:
                return jsonify({
                    "error": "Access Denied: Device not approved for download.",
                    "status": "forbidden",
                    "code": 403
                }), 403

        vid_id = extract_video_id(raw_input)
        video_url = build_watch_url(raw_input)

        # Transcode in OS temporary directory with unique request ID (never saved in project)
        temp_prefix = f"mevo_{req_id}_{vid_id}"
        output_template = str(TEMP_AUDIO_DIR / f"{temp_prefix}.%(ext)s")

        ydl_opts = get_base_ydl_opts()
        ydl_opts.update({
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
            "quiet": True,
        })

        with extractor_semaphore:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=True)
                video_title = info.get("title", "track") if info else "track"

        target_file = TEMP_AUDIO_DIR / f"{temp_prefix}.mp3"
        if not target_file.exists():
            matched = list(TEMP_AUDIO_DIR.glob(f"{temp_prefix}.*"))
            if matched:
                target_file = matched[0]
            else:
                return jsonify({"error": "Audio extraction failed. Output file not generated."}), 500

        clean_title = "".join(c for c in video_title if c.isalnum() or c in (" ", "-", "_")).strip() or "track"
        file_size = target_file.stat().st_size
        target_path = str(target_file.resolve())

        def stream_and_cleanup(file_path):
            try:
                with open(file_path, "rb") as f:
                    while chunk := f.read(65536):
                        yield chunk
            finally:
                try:
                    if os.path.exists(file_path):
                        os.remove(file_path)
                except Exception:
                    pass

        response = Response(
            stream_and_cleanup(target_path),
            mimetype="audio/mpeg",
            headers={
                "Content-Disposition": f'attachment; filename="{clean_title}.mp3"',
                "Content-Length": str(file_size),
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-ID",
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
                "Content-Type": "audio/mpeg",
            }
        )
        return response

    except Exception as e:
        logging.error(f"Download error: {str(e)}")
        # Purge any partial files created for this request
        try:
            for p in TEMP_AUDIO_DIR.glob(f"mevo_{req_id}_*"):
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------------------------
# YouTube Closed Captions & Auto-Subtitles Extractor
# ---------------------------------------------------------------------------
try:
    from youtube_transcript_api import YouTubeTranscriptApi
    YOUTUBE_TRANSCRIPT_AVAILABLE = True
except ImportError:
    YOUTUBE_TRANSCRIPT_AVAILABLE = False
    logging.warning("[Lyrics] youtube-transcript-api is not installed.")

_lyrics_cache: dict[str, dict | None] = {}

@app.route("/api/lyrics/youtube", methods=["GET", "OPTIONS"])
def get_youtube_lyrics():
    if request.method == "OPTIONS":
        response = Response()
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return response

    raw_id = request.args.get("videoId") or request.args.get("video_id") or request.args.get("id")
    if not raw_id:
        return jsonify({"error": "videoId is required"}), 400

    vid_id = extract_video_id(raw_id)
    if not vid_id:
        return jsonify({"error": "Invalid videoId"}), 400

    if vid_id in _lyrics_cache:
        cached = _lyrics_cache[vid_id]
        resp = jsonify(cached or {"videoId": vid_id, "lyrics": None})
        resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp

    # 1. Try youtube-transcript-api
    if YOUTUBE_TRANSCRIPT_AVAILABLE:
        try:
            ytt = YouTubeTranscriptApi()
            transcript_list = ytt.list(vid_id)
            transcript = None

            # Priority 1: User/Studio created transcripts in Bengali, Hindi, English
            try:
                transcript = transcript_list.find_transcript(['bn', 'hi', 'en', 'es'])
            except Exception:
                pass

            # Priority 2: Auto-generated transcripts in Bengali, Hindi, English
            if not transcript:
                try:
                    transcript = transcript_list.find_generated_transcript(['bn', 'hi', 'en', 'es'])
                except Exception:
                    pass

            # Priority 3: Any available transcript
            if not transcript:
                for t in transcript_list:
                    transcript = t
                    break

            if transcript:
                fetched = transcript.fetch()
                synced_lines = []
                for item in fetched:
                    clean_text = item.text.strip().replace("\n", " ")
                    if clean_text:
                        synced_lines.append({
                            "time": round(float(item.start), 2),
                            "text": clean_text,
                            "duration": round(float(item.duration), 2)
                        })

                if synced_lines:
                    result = {
                        "videoId": vid_id,
                        "source": "youtube_captions",
                        "language": transcript.language_code,
                        "lyrics": synced_lines
                    }
                    _lyrics_cache[vid_id] = result
                    resp = jsonify(result)
                    resp.headers["Access-Control-Allow-Origin"] = "*"
                    return resp
        except Exception as e:
            logging.info(f"[Lyrics] YouTubeTranscriptApi failed for {vid_id}: {e}")

    # Fallback / No captions found
    _lyrics_cache[vid_id] = None
    resp = jsonify({"videoId": vid_id, "lyrics": None})
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

# ---------------------------------------------------------------------------
# YouTube Music "Watch-Next" Related Radio Extractor Endpoint
# ---------------------------------------------------------------------------
_related_queue_cache: dict[str, dict] = {}

def parse_time_string_to_seconds(dur_str: str) -> int:
    if not dur_str:
        return 0
    parts = dur_str.strip().split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except Exception:
        pass
    return 0

def is_junk_title(title: str) -> bool:
    lower = title.lower()
    junk_patterns = [
        r"\breaction\b", r"\breacts\b", r"\binterview\b", r"\bpodcast\b",
        r"\bbehind the scenes\b", r"\bvlog\b", r"\bmaking of\b", r"\breview\b",
        r"\bfirst time hearing\b", r"\bbreakdown\b", r"\bnews\b", r"\bshorts\b",
        r"\btiktok\b", r"\bgameplay\b"
    ]
    return any(re.search(pat, lower) for pat in junk_patterns)

@app.route("/api/queue/related", methods=["GET", "OPTIONS"])
@app.route("/queue/related", methods=["GET", "OPTIONS"])
def get_related_queue():
    if request.method == "OPTIONS":
        response = Response("", status=200)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return response

    client_ip = request.remote_addr or "unknown"
    if not rate_limiter.allow(client_ip):
        return jsonify({"error": "Rate limit exceeded. Please try again shortly.", "code": 429}), 429

    raw_id = request.args.get("videoId") or request.args.get("video_id") or request.args.get("id")
    if not raw_id:
        return jsonify({"error": "videoId is required"}), 400

    vid_id = extract_video_id(raw_id)
    if not vid_id:
        return jsonify({"error": "Invalid videoId"}), 400

    cache_key = f"youtube:related:{vid_id}"
    cached = search_cache.get(cache_key)
    if cached is not None:
        request_budget.record_request("related", hit=True)
        resp = jsonify(cached)
        resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp

    def _do_related():
        request_budget.record_request("related", hit=False, upstream=True)
        base_url = get_base_url()
        items = []
        seen_ids = set([vid_id])

        # 2. Extract from YouTube Innertube Watch-Next API
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Content-Type": "application/json"
            }
            payload = {
                "videoId": vid_id,
                "context": {
                    "client": {
                        "hl": "en",
                        "gl": "US",
                        "clientName": "WEB",
                        "clientVersion": "2.20240101.00.00"
                    }
                }
            }
            tube_res = requests.post("https://www.youtube.com/youtubei/v1/next", headers=headers, json=payload, timeout=8)
            if tube_res.status_code == 200:
                data = tube_res.json()
                secondary = data.get("contents", {}).get("twoColumnWatchNextResults", {}).get("secondaryResults", {}).get("secondaryResults", {}).get("results", [])
                if not secondary:
                    sections = data.get("contents", {}).get("twoColumnWatchNextResults", {}).get("secondaryResults", {}).get("secondaryResults", {}).get("contents", [])
                    for sec in sections:
                        sec_res = sec.get("itemSectionRenderer", {}).get("contents", [])
                        if sec_res:
                            secondary.extend(sec_res)

                for r in secondary:
                    # Format A: lockupViewModel
                    lockup = r.get("lockupViewModel")
                    if lockup:
                        v_id = lockup.get("contentId")
                        if not v_id or v_id in seen_ids or len(v_id) != 11:
                            continue

                        meta = lockup.get("metadata", {}).get("lockupMetadataViewModel", {})
                        raw_title = meta.get("title", {}).get("content", "").strip()

                        channel = ""
                        rows = meta.get("metadata", {}).get("contentMetadataViewModel", {}).get("metadataRows", [])
                        if rows and len(rows) > 0:
                            parts = rows[0].get("metadataParts", [])
                            if parts:
                                channel = parts[0].get("text", {}).get("content", "").strip()

                        if not raw_title or is_blacklisted_media(raw_title, channel):
                            continue

                        dur_str = ""
                        img_sources = lockup.get("contentImage", {}).get("thumbnailViewModel", {}).get("image", {}).get("sources", [])
                        thumb = img_sources[-1].get("url") if img_sources else f"https://img.youtube.com/vi/{v_id}/hqdefault.jpg"

                        overlays = lockup.get("contentImage", {}).get("thumbnailViewModel", {}).get("overlays", [])
                        for ov in overlays:
                            badges = ov.get("thumbnailBottomOverlayViewModel", {}).get("badges", [])
                            for b in badges:
                                badge_text = b.get("thumbnailBadgeViewModel", {}).get("text")
                                if badge_text and ":" in badge_text:
                                    dur_str = badge_text
                                    break

                        dur_sec = parse_time_string_to_seconds(dur_str)
                        seen_ids.add(v_id)
                        items.append(build_uniform_item(
                            vid_id=v_id,
                            raw_title=raw_title,
                            channel=channel or "YouTube Artist",
                            thumbnail=thumb,
                            duration=dur_sec or 210,
                            base_url=base_url
                        ))

                    # Format B: compactVideoRenderer (legacy)
                    compact = r.get("compactVideoRenderer")
                    if compact:
                        v_id = compact.get("videoId")
                        if not v_id or v_id in seen_ids or len(v_id) != 11:
                            continue

                        title_obj = compact.get("title", {})
                        raw_title = title_obj.get("simpleText") or (title_obj.get("runs", [{}])[0].get("text") if title_obj.get("runs") else "")

                        channel_obj = compact.get("shortBylineText", {}) or compact.get("longBylineText", {})
                        channel = channel_obj.get("runs", [{}])[0].get("text") if channel_obj.get("runs") else ""

                        if not raw_title or is_blacklisted_media(raw_title, channel):
                            continue

                        length_obj = compact.get("lengthText", {})
                        length_str = length_obj.get("simpleText") or (length_obj.get("runs", [{}])[0].get("text") if length_obj.get("runs") else "")

                        thumbs = compact.get("thumbnail", {}).get("thumbnails", [])
                        thumb = thumbs[-1].get("url") if thumbs else f"https://img.youtube.com/vi/{v_id}/hqdefault.jpg"

                        dur_sec = parse_time_string_to_seconds(length_str)
                        seen_ids.add(v_id)
                        items.append(build_uniform_item(
                            vid_id=v_id,
                            raw_title=raw_title,
                            channel=channel or "YouTube Artist",
                            thumbnail=thumb,
                            duration=dur_sec or 210,
                            base_url=base_url
                        ))

        except Exception as e:
            logging.error(f"[Related Queue] Innertube error for {vid_id}: {e}")

        # 3. Fallback to yt-dlp search if Innertube didn't yield enough results
        if len(items) < 5:
            try:
                logging.info(f"[Related Queue] Falling back to search for related items to {vid_id}")
                ytdlp_res, _ = search_ytdlp_fallback(f"related:{vid_id}", limit=20, base_url=base_url)
                for it in ytdlp_res:
                    if it.get("id") and it["id"] not in seen_ids and not is_blacklisted_media(it.get("title", ""), it.get("artist", "")):
                        seen_ids.add(it["id"])
                        items.append(it)
            except Exception as e:
                logging.error(f"[Related Queue] Fallback error for {vid_id}: {e}")

        res = {
            "videoId": vid_id,
            "items": items,
            "count": len(items),
            "source": "youtube_related"
        }
        if len(items) > 0:
            search_cache.set(cache_key, res, ttl=7200)
        return res

    result = single_flight.execute(f"flight:{cache_key}", _do_related)
    resp = jsonify(result)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

# ---------------------------------------------------------------------------
# Multi-Tier Lyrics & Audio-Guided Alignment API
# ---------------------------------------------------------------------------
def _parse_lrc_py(lrc_str: str) -> list[dict]:
    lines = []
    time_re = re.compile(r"\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]")
    for raw in (lrc_str or "").splitlines():
        trimmed = raw.strip()
        if not trimmed or re.match(r"^\[(ti|ar|al|by|offset|length):", trimmed, re.IGNORECASE):
            continue
        matches = list(time_re.finditer(trimmed))
        if not matches:
            continue
        text_only = time_re.sub("", trimmed).strip()
        if not text_only:
            continue
        for m in matches:
            mins = int(m.group(1))
            secs = int(m.group(2))
            frac_str = m.group(3) or "0"
            frac = int(frac_str) / (1000.0 if len(frac_str) == 3 else 100.0)
            total = round(mins * 60 + secs + frac, 2)
            lines.append({"time": total, "text": text_only})
    lines.sort(key=lambda x: x["time"])
    for i in range(len(lines)):
        if i + 1 < len(lines):
            lines[i]["duration"] = max(1.2, min(8.0, round(lines[i+1]["time"] - lines[i]["time"], 2)))
        else:
            lines[i]["duration"] = 4.5
    return lines

def _align_plain_lyrics_py(plain_text: str, total_duration: float = 210) -> list[dict]:
    raw_lines = [l.strip() for l in (plain_text or "").splitlines()]
    valid = []
    pending_break = False
    for l in raw_lines:
        if not l:
            pending_break = True
            continue
        if re.match(r"^\[.*\]$", l) or re.match(r"^\(.*\)$", l):
            pending_break = True
            continue
        valid.append({"text": l, "has_break": pending_break})
        pending_break = False

    if not valid:
        return []

    dur = max(60.0, float(total_duration or 210))
    intro = min(24.0, max(9.0, dur * 0.075))
    outro = min(20.0, max(7.0, dur * 0.05))
    singing_window = max(30.0, dur - intro - outro)

    weights = [max(1.5, len(v["text"].split())) for v in valid]
    total_w = sum(weights) or 1.0

    breaks_count = sum(1 for i, v in enumerate(valid) if i > 0 and v["has_break"])
    break_dur = min(5.5, max(3.5, (singing_window * 0.15) / max(1, breaks_count)))
    available_vocal = max(20.0, singing_window - breaks_count * break_dur)

    results = []
    curr = intro
    for i, item in enumerate(valid):
        if i > 0 and item["has_break"]:
            curr += break_dur
        ratio = weights[i] / total_w
        line_dur = max(1.8, min(7.5, ratio * available_vocal))
        results.append({
            "time": round(curr, 2),
            "duration": round(line_dur, 2),
            "text": item["text"]
        })
        curr += line_dur + 0.35
    return results

@app.route("/api/lyrics", methods=["GET"])
@app.route("/api/lyrics/youtube", methods=["GET"])
def api_lyrics():
    video_id = (request.args.get("videoId") or request.args.get("id") or "").replace("yt-", "").strip()
    title = request.args.get("title") or ""
    artist = request.args.get("artist") or ""
    duration = float(request.args.get("duration") or 0)

    if not video_id and not title:
        return jsonify({"error": "Missing videoId or title"}), 400

    cache_key = f"lyrics:{video_id or title}"
    cached = search_cache.get(cache_key)
    if cached:
        resp = jsonify(cached)
        resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp

    clean_title = clean_search_query(title) if title else ""
    clean_artist = re.sub(r"\s*-\s*topic$", "", artist, flags=re.IGNORECASE).strip() if artist else ""

    # 1. Tier 1: Multi-Step LRCLIB Search
    queries = [
        f"{clean_title} {clean_artist}".strip() if clean_artist and clean_artist != "Unknown Artist" else clean_title,
        f"{clean_title} {clean_artist.split(',')[0].strip()}" if "," in clean_artist else "",
        clean_title
    ]
    queries = [q for q in queries if q]

    synced_lines = []
    plain_lyrics_text = ""

    for q in queries:
        try:
            res = requests.get("https://lrclib.net/api/search", params={"q": q}, headers={"User-Agent": "MevoMusic/1.0"}, timeout=3)
            if res.ok:
                data = res.json()
                if isinstance(data, list) and len(data) > 0:
                    for item in data:
                        if item.get("syncedLyrics"):
                            synced_lines = _parse_lrc_py(item["syncedLyrics"])
                            if synced_lines:
                                break
                        if not plain_lyrics_text and item.get("plainLyrics"):
                            plain_lyrics_text = item["plainLyrics"]
                    if synced_lines:
                        break
        except Exception:
            pass

    if synced_lines:
        res_data = {
            "source": "lrclib",
            "lines": synced_lines
        }
        search_cache.set(cache_key, res_data, ttl=86400)
        resp = jsonify(res_data)
        resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp

    # 2. Tier 2: Video Description Lyrics
    if not plain_lyrics_text and video_id:
        try:
            d_url = "https://www.googleapis.com/youtube/v3/videos"
            key = discovery_key_pool.get_active_key() or search_key_pool.get_active_key()
            if key:
                d_res = requests.get(d_url, params={"part": "snippet", "id": video_id, "key": key}, timeout=4)
                if d_res.ok:
                    items = d_res.json().get("items", [])
                    if items:
                        desc = items[0].get("snippet", {}).get("description", "")
                        match = re.search(r"(?:lyrics|song lyrics|lyrics\s*:\s*|গান\s*:\s*|কথা\s*:\s*|बोल\s*:\s*)([\s\S]*?)(?=(?:music\s*label|audio\s*label|label\s*:|singer\s*:|composer\s*:|director|producer|stream|listen|available|itunes|spotify|http|#|\n{3,}|$))", desc, re.IGNORECASE)
                        if match and len(match.group(1).splitlines()) >= 4:
                            plain_lyrics_text = match.group(1).strip()
        except Exception:
            pass

    # 3. Tier 3: Audio-Guided Alignment
    if plain_lyrics_text:
        aligned = _align_plain_lyrics_py(plain_lyrics_text, duration or 210)
        if aligned:
            res_data = {
                "source": "aligned",
                "lines": aligned
            }
            search_cache.set(cache_key, res_data, ttl=86400)
            resp = jsonify(res_data)
            resp.headers["Access-Control-Allow-Origin"] = "*"
            return resp

    resp = jsonify({"source": "none", "lines": []})
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

YOUTUBE_TRANSCRIPT_AVAILABLE = True

# ---------------------------------------------------------------------------
# Health & Status Endpoint
# ---------------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health_check():
    ffmpeg_exe = shutil.which("ffmpeg")
    return jsonify({
        "status": "online",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "Mevo Audio Extractor & Search Engine Microservice",
        "ffmpeg_available": bool(ffmpeg_exe),
        "ffmpeg_path": ffmpeg_exe or "not found",
        "discovery_pool": discovery_key_pool.get_status(),
        "search_pool": search_key_pool.get_status(),
        "key_pool": search_key_pool.get_status(),
        "cache": search_cache.stats(),
        "budget": request_budget.stats(),
        "lyrics_service": YOUTUBE_TRANSCRIPT_AVAILABLE,
        "cookies_loaded": bool(YOUTUBE_COOKIE_PATH and YOUTUBE_COOKIE_PATH.is_file()),
    })

# ---------------------------------------------------------------------------
# Main Runner
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    ffmpeg_status = shutil.which("ffmpeg") or "NOT FOUND"
    port = int(os.getenv("PORT", "5001"))
    print("=" * 70)
    print(f"Mevo Audio Extractor & Multi-Key Search Service running on http://127.0.0.1:{port}")
    print(f"FFmpeg executable: {ffmpeg_status}")
    print(f"Discovery Key Pool: {discovery_key_pool.get_status()}")
    print(f"Search Key Pool: {search_key_pool.get_status()}")
    print("=" * 70)
    app.run(host="0.0.0.0", port=port, debug=True)