import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      className="toaster group"
      duration={2500}
      visibleToasts={3}
      toastOptions={{
        className:
          "!bg-[#0d151c]/90 !backdrop-blur-xl !border !border-emerald-500/20 !text-white !rounded-2xl !shadow-2xl !shadow-black/60 !py-3 !px-4 !font-sans !text-xs sm:!text-sm",
        style: {
          background: "rgba(13, 21, 28, 0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(45, 212, 191, 0.22)",
          color: "#ffffff",
          boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 20px rgba(45, 212, 191, 0.08)",
        },
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[#0d151c]/90 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-zinc-100 group-[.toaster]:border-emerald-500/20 group-[.toaster]:shadow-2xl group-[.toaster]:shadow-black/60 group-[.toaster]:rounded-2xl",
          description: "group-[.toast]:text-zinc-400 group-[.toast]:text-xs",
          actionButton:
            "group-[.toast]:bg-emerald-500 group-[.toast]:text-[#071012] group-[.toast]:font-semibold group-[.toast]:rounded-xl hover:group-[.toast]:bg-emerald-400",
          cancelButton:
            "group-[.toast]:bg-white/10 group-[.toast]:text-zinc-300 group-[.toast]:rounded-xl hover:group-[.toast]:bg-white/15",
          success:
            "!border-emerald-500/30 !text-emerald-300 [&_[data-icon]]:!text-[#2dd4bf]",
          error:
            "!border-rose-500/30 !text-rose-300 [&_[data-icon]]:!text-rose-400",
          info:
            "!border-cyan-500/30 !text-cyan-300 [&_[data-icon]]:!text-cyan-400",
          warning:
            "!border-amber-500/30 !text-amber-300 [&_[data-icon]]:!text-amber-400",
          loading:
            "!border-teal-500/30 !text-zinc-200 [&_[data-icon]]:!text-teal-400",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

