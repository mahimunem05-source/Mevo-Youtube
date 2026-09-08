import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[MEVO] Uncaught runtime error caught by RootErrorBoundary:", error, errorInfo);
  }

  private handleReload = () => {
    try {
      window.location.reload();
    } catch {
      window.location.href = "/";
    }
  };

  private handleReset = () => {
    try {
      sessionStorage.clear();
    } catch {
      // Ignore storage errors in private browsing
    }
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#071114] px-4 text-center text-white">
          <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#0B1519]/90 p-6 shadow-2xl backdrop-blur-xl">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#4FD1C5]/20 text-[#4FD1C5]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h1 className="text-lg font-bold tracking-tight text-white">
              Something went wrong
            </h1>
            <p className="text-xs text-white/70">
              The application encountered an unexpected issue. Tap below to reload.
            </p>

            {this.state.error?.message && (
              <p className="rounded-lg bg-black/40 p-2.5 font-mono text-[11px] text-rose-300 break-all text-left">
                {this.state.error.message}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full rounded-full bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] px-4 py-2 text-xs font-bold text-[#071012] shadow-md transition-all active:scale-95 sm:w-auto cursor-pointer"
              >
                Reload App
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-white/10 active:scale-95 sm:w-auto cursor-pointer"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
