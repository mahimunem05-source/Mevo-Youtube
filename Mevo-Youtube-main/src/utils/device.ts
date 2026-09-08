/**
 * Device Fingerprinting & Info Utility for MEVO Global Whitelist
 */

const DEVICE_STORAGE_KEY = "mevo_device_id";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedDeviceId: string | null = null;

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"));
  return match ? decodeURIComponent(match[3]) : null;
}

function setCookie(name: string, val: string, days = 3650): void {
  if (typeof document === "undefined") return;
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(val)};expires=${date.toUTCString()};path=/;SameSite=Lax`;
}

/**
 * Retrieves or creates the persistent unique Device ID.
 * Priority:
 * 1. In-memory cache (module singleton)
 * 2. localStorage ('mevo_device_id')
 * 3. Fallback cookie ('mevo_device_id')
 * 4. Generate once, persist across all stores, and return.
 */
export function getOrCreateDeviceId(): string {
  // 1. Return in-memory cached ID if available in this runtime session
  if (cachedDeviceId && cachedDeviceId.trim()) {
    return cachedDeviceId;
  }

  if (typeof window === "undefined") {
    return "mevo_server_environment";
  }

  // 2. Check localStorage
  try {
    const stored = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (stored && stored.trim()) {
      cachedDeviceId = stored.trim();
      // Ensure cookie is also synced for persistence
      setCookie(DEVICE_STORAGE_KEY, cachedDeviceId);
      return cachedDeviceId;
    }
  } catch (err) {
    console.warn("Could not read localStorage for device ID:", err);
  }

  // 3. Check fallback cookie if localStorage was empty or restricted
  try {
    const fromCookie = getCookie(DEVICE_STORAGE_KEY);
    if (fromCookie && fromCookie.trim()) {
      cachedDeviceId = fromCookie.trim();
      try {
        window.localStorage.setItem(DEVICE_STORAGE_KEY, cachedDeviceId);
      } catch {}
      return cachedDeviceId;
    }
  } catch {}

  // 4. Generate a unique ID once and save it persistently
  const newDeviceId = `mevo_${generateUUID()}`;
  cachedDeviceId = newDeviceId;

  try {
    window.localStorage.setItem(DEVICE_STORAGE_KEY, newDeviceId);
  } catch (err) {
    console.warn("Could not save device ID to localStorage:", err);
  }

  try {
    setCookie(DEVICE_STORAGE_KEY, newDeviceId);
  } catch {}

  return newDeviceId;
}

/**
 * Retrieves the persistent unique Device ID (alias to getOrCreateDeviceId)
 */
export function getDeviceId(): string {
  return getOrCreateDeviceId();
}

/**
 * Generates a readable summary of the current client environment (Browser/OS/Device)
 * for easy admin identification in the whitelist dashboard.
 */
export function getDeviceName(): string {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "Server / Unknown Environment";
  }

  const ua = navigator.userAgent;
  let browser = "Browser";
  let os = "OS";

  // Detect OS
  if (/windows nt 10\.0/i.test(ua)) os = "Windows 10/11";
  else if (/windows nt/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";

  // Detect Browser
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome|crios/i.test(ua) && !/opr|opera/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Safari";
  else if (/opr|opera/i.test(ua)) browser = "Opera";

  const isMobile = /mobile|android|iphone|ipad/i.test(ua);
  const formFactor = isMobile ? "Mobile" : "Desktop";

  return `${browser} on ${os} (${formFactor})`;
}
