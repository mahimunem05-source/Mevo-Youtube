import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

export function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      // Step 1: Login through Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      const user = authData.user;
      const session = authData.session;

      if (!user || !session) {
        throw new Error("Login হয়েছে, কিন্তু session তৈরি হয়নি");
      }

      console.log("Logged-in user ID:", user.id);

      // Step 2: Check whether this user is an admin
      const {
        data: admin,
        error: adminError,
        status,
      } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();

      console.log("Admin verification result:", {
        loggedInUserId: user.id,
        admin,
        adminError,
        status,
      });

      // Show the real database/RLS error
      if (adminError) {
        await supabase.auth.signOut();

        throw new Error(`Admin check failed: ${adminError.message}`);
      }

      // User authenticated but is not in admins table
      if (!admin) {
        await supabase.auth.signOut();

        throw new Error("You are not authorized as admin");
      }

      // Admin verification successful
      onLoginSuccess();
    } catch (err) {
      console.error("Admin login error:", err);

      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto mt-20 w-full max-w-md">
      <CardHeader>
        <CardTitle>MEVO Admin Login</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            type="email"
            placeholder="Admin Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Checking..." : "Login"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
