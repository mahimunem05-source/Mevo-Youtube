import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#182227] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`grid size-10 place-items-center rounded-2xl ${
                    variant === "danger"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-[#4FD1C5]/20 text-teal-400"
                  }`}
                >
                  <AlertTriangle className="size-5" />
                </div>
                <h3 className="text-base font-bold text-white">{title}</h3>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="grid size-8 place-items-center rounded-full text-white/50 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-3 text-xs text-white/70 leading-relaxed">{description}</p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded-full px-5 py-2 text-xs font-bold transition-all shadow-md ${
                  variant === "danger"
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-[#4FD1C5] text-[#071012] hover:bg-[#4FD1C5]/90"
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
