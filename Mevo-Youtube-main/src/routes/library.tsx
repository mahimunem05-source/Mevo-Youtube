import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
});

function LibraryPage() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/albums", replace: true });
  }, [navigate]);

  return null;
}
