import { createFileRoute, Link } from "@tanstack/react-router";
import { Music4, Shield, Heart, Zap, Globe, Github } from "lucide-react";
import { PageHeader } from "@/components/music/page-header";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [{ title: "About — MEVO" }, { name: "description", content: "Learn about MEVO Music." }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="pb-36 pt-2 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto space-y-6">
      <PageHeader
        eyebrow="ABOUT MEVO"
        title="Pure Stream Experience"
        subtitle="Crafted for music lovers who appreciate audio fidelity and responsive design."
      />

      <div className="rounded-3xl border border-white/[0.08] bg-[#12191D]/90 p-6 shadow-xl space-y-6">
        <div className="flex items-center gap-3">
          <Music4 className="size-8 text-teal-400" />
          <div>
            <h2 className="text-xl font-extrabold text-white">MEVO Music</h2>
            <p className="text-xs font-mono text-teal-400">Version 2.4.0 (Pure Stream Edition)</p>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
          MEVO is a premium music streaming web application built with modern web technologies
          including React, TanStack Start, Framer Motion, and Tailwind CSS. Designed to deliver an
          immersive audio experience with luxury soft slate teal aesthetics and real-time catalogue
          updates.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-1">
            <Zap className="size-5 text-teal-400 mb-2" />
            <h3 className="text-sm font-bold text-white">Instant Offline Downloads</h3>
            <p className="text-xs text-white/60">
              Store tracks locally on your device with IndexedDB for offline listening anywhere.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-1">
            <Shield className="size-5 text-teal-400 mb-2" />
            <h3 className="text-sm font-bold text-white">Privacy First</h3>
            <p className="text-xs text-white/60">
              Private sessions and local storage options keep your music habits strictly yours.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4 text-teal-400 font-semibold">
            <Link to="/privacy" className="hover:underline">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:underline">
              Terms of Use
            </Link>
            <Link to="/support" className="hover:underline">
              Support
            </Link>
          </div>
          <span className="text-white/40">© 2026 MEVO. All rights reserved.</span>
        </div>
      </div>
    </div>
  );
}
