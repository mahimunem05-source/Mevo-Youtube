import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { getRouter, queryClient } from "./router";
import { RootErrorBoundary } from "@/components/music/root-error-boundary";
import { SettingsProvider } from "@/context/SettingsContext";
import { DeviceAccessProvider } from "@/context/DeviceContext";
import { PlayerProvider } from "@/lib/player-context";
import "./styles.css";

const router = getRouter();

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = (rootElement as any)._reactRoot || ReactDOM.createRoot(rootElement);
  (rootElement as any)._reactRoot = root;
  root.render(
    <React.StrictMode>
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SettingsProvider>
            <DeviceAccessProvider>
              <PlayerProvider>
                <RouterProvider router={router} />
              </PlayerProvider>
            </DeviceAccessProvider>
          </SettingsProvider>
        </QueryClientProvider>
      </RootErrorBoundary>
    </React.StrictMode>,
  );
}

// Service Worker Management: Strict Separation between Dev & Production
if (typeof window !== "undefined") {
  if (import.meta.env.DEV) {
    // 1. Dev-mode cleanup: actively unregister all service workers on localhost
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            registration.unregister().then((unregistered) => {
              if (unregistered) {
                console.log("[MEVO Dev] Active Service Worker unregistered for localhost.");
              }
            });
          }
        })
        .catch((err) => {
          console.warn("[MEVO Dev] Failed checking service worker registrations:", err);
        });
    }

    // 2. Dev-mode cleanup: purge all CacheStorage entries to prevent stale dev assets
    if ("caches" in window) {
      caches
        .keys()
        .then((cacheNames) => {
          for (const cacheName of cacheNames) {
            caches.delete(cacheName).then(() => {
              console.log(`[MEVO Dev] Purged stale CacheStorage: ${cacheName}`);
            });
          }
        })
        .catch((err) => {
          console.warn("[MEVO Dev] Error purging CacheStorage:", err);
        });
    }
  } else if (import.meta.env.PROD && "serviceWorker" in navigator) {
    // 3. Production-only PWA Service Worker Registration
    const registerSW = () => {
      try {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((reg) => {
            if (reg && typeof reg.update === "function") {
              reg.update().catch(() => {});
            }
          })
          .catch((error) => {
            console.warn("[MEVO] Service Worker registration bypassed:", error);
          });
      } catch (err) {
        console.warn("[MEVO] Service Worker registration failed silently:", err);
      }
    };

    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW, { once: true });
    }
  }
}
