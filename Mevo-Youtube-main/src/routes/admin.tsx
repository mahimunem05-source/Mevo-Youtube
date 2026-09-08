import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  return (
    <div className="min-h-screen">
      {loggedIn ? (
        <AdminDashboard
          onLogout={() => {
            setLoggedIn(false);
          }}
        />
      ) : (
        <AdminLogin
          onLoginSuccess={() => {
            setLoggedIn(true);
          }}
        />
      )}
    </div>
  );
}
