"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error: signUpError } = await supabaseBrowserClient.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message || "Failed to create account. Please try again.");
        setIsLoading(false);
        return;
      }

      if (data.session) {
        // Small delay to ensure cookies are set
        await new Promise((resolve) => setTimeout(resolve, 100));
        router.push("/toolbox");
        router.refresh();
      } else {
        // Email confirmation might be required
        setError("Please check your email to confirm your account.");
        setIsLoading(false);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <Card>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <h1 className="text-2xl font-semibold text-slate-900">Create account</h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign up to get started
          </p>
        </motion.div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600"
            >
              {error}
            </motion.div>
          )}

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            disabled={isLoading}
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
            disabled={isLoading}
          />

          <Input
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
            disabled={isLoading}
            error={password && confirmPassword && password !== confirmPassword ? "Passwords do not match" : undefined}
          />

          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            className="w-full"
            disabled={isLoading}
          >
            Create account
          </Button>
        </form>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-center text-sm text-slate-600"
        >
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            Log in
          </Link>
        </motion.div>
      </Card>
    </div>
  );
}

