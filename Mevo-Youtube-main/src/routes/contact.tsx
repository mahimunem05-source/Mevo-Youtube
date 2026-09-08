import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowLeft, Mail, MapPin, Phone, Send, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import emailjs from "@emailjs/browser";
import { PageHeader } from "@/components/music/page-header";

const CONTACT_EMAIL = "m.mevomusic@gmail.com";

// EmailJS Credentials
const SERVICE_ID = "service_hr6tuso";
const TEMPLATE_ID = "template_qd5cvwj";
const PUBLIC_KEY = "DkV7yJwvcuJdcZZ_5";

interface ContactSearch {
  song?: string;
}

export const Route = createFileRoute("/contact")({
  validateSearch: (search: Record<string, unknown>): ContactSearch => ({
    song: typeof search.song === "string" ? search.song : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Contact — MEVO" },
      {
        name: "description",
        content: "Questions, partnerships or artist submissions? Reach the MEVO team.",
      },
      { property: "og:title", content: "Contact — MEVO" },
      { property: "og:description", content: "Reach the MEVO team for support or submissions." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { song: requestedSong } = Route.useSearch();
  const [isSending, setIsSending] = useState(false);
  const [subject, setSubject] = useState(requestedSong ? `Song Request: ${requestedSong}` : "");
  const [message, setMessage] = useState(
    requestedSong
      ? `Hi MEVO team, I would like to request adding the song "${requestedSong}" to the MEVO library.`
      : "",
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setIsSending(true);

    try {
      await emailjs.sendForm(SERVICE_ID, TEMPLATE_ID, form, {
        publicKey: PUBLIC_KEY,
      });

      toast.success("Feedback successfully sent! We will get back to you soon.");
      form.reset();
      setSubject("");
      setMessage("");
    } catch (error) {
      console.error("EmailJS Error:", error);
      toast.error("Failed to send message. Please try again later.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Say Hello Vai..."
        title="Contact"
        subtitle="Artist submissions, partnerships or a bug in the player — we read everything."
      />
      <div className="mx-auto grid max-w-6xl gap-8 px-6 md:px-12 lg:grid-cols-[1fr_20rem]">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="space-y-5 rounded-3xl glass p-6 md:p-8"
        >
          {requestedSong && (
            <div className="flex items-center gap-2 rounded-2xl border border-teal-400/30 bg-teal-400/10 px-4 py-2.5 text-xs text-teal-300">
              <span className="font-semibold text-teal-400">Song Request:</span>
              <span>
                Pre-filled for <strong className="text-white">“{requestedSong}”</strong>
              </span>
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <Field id="name" label="Name" placeholder="Your name" />
            <Field id="email" label="Email" type="email" placeholder="you@email.com" />
          </div>
          <Field
            id="subject"
            label="Subject"
            placeholder="What is this about?"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <div className="space-y-2">
            <label htmlFor="message" className="text-sm font-medium">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind..."
              className="w-full resize-none rounded-2xl glass-row px-4 py-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:glow-ring"
            />
          </div>
          <motion.button
            type="submit"
            disabled={isSending}
            whileHover={{ scale: isSending ? 1 : 1.03, y: isSending ? 0 : -2 }}
            whileTap={{ scale: isSending ? 1 : 0.97 }}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground glow-ring disabled:opacity-60 cursor-pointer"
          >
            {isSending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Sending...
              </>
            ) : (
              <>
                <Send className="size-4" /> Compose message
              </>
            )}
          </motion.button>
        </motion.form>

        <aside className="space-y-4">
          <InfoCard icon={<Mail className="size-4" />} title="Email" value={CONTACT_EMAIL} />
          <InfoCard icon={<Phone className="size-4" />} title="Phone" value="01817372950" />
          <InfoCard
            icon={<MapPin className="size-4" />}
            title="Studio"
            value="Dhaka · Bangladesh"
          />
        </aside>
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-10 md:px-12">
        <div className="h-px w-full bg-border/60" />
        <div className="flex flex-col items-start justify-between gap-3 py-8 sm:flex-row sm:items-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-light text-muted-foreground transition-colors duration-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <ArrowLeft className="size-4" /> Back to Home
          </Link>
          <Link
            to="/support"
            className="text-sm font-light text-muted-foreground transition-colors duration-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            Browse support topics
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full rounded-2xl glass-row px-4 py-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:glow-ring"
      />
    </div>
  );
}

function InfoCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="rounded-3xl glass p-6">
      <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary">
        {icon}
      </span>
      <h2 className="mt-4 text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{value}</p>
    </div>
  );
}
