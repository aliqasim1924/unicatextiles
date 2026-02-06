"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface FinishedFabricStocktakeSession {
  id: string;
  name: string;
  stocktake_date: string;
  performed_by: string;
  status: string;
  created_at: string;
  notes: string | null;
}

const defaultForm = {
  name: "",
  stocktake_date: "",
  performed_by: "",
  notes: "",
};

export default function FinishedFabricStocktakeListPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<FinishedFabricStocktakeSession[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    setIsLoading(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("finished_fabric_stocktake_sessions")
        .select("id, name, stocktake_date, performed_by, status, created_at, notes")
        .order("stocktake_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSessions((data as FinishedFabricStocktakeSession[]) || []);
    } catch (err: any) {
      console.error("Failed to load stocktake sessions", err);
      setError(err.message || "Failed to load stocktake sessions.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!form.stocktake_date) {
      setError("Stocktake date is required.");
      return;
    }
    if (!form.performed_by.trim()) {
      setError("Performed by is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("finished_fabric_stocktake_sessions")
        .insert({
          name: form.name.trim(),
          stocktake_date: form.stocktake_date,
          performed_by: form.performed_by.trim(),
          notes: form.notes.trim() || null,
        })
        .select("id")
        .single();

      if (error) throw error;

      setForm(defaultForm);
      setShowForm(false);
      await fetchSessions();

      if (data?.id) {
        router.push(`/toolbox/finished-fabric/stocktake/${data.id}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create stocktake session.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(session: FinishedFabricStocktakeSession) {
    if (
      !window.confirm(
        `Delete stocktake "${session.name}"? This will remove the session and all its count lines. This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    setDeletingId(session.id);
    try {
      const { error: linesError } = await supabaseBrowserClient
        .from("finished_fabric_stocktake_lines")
        .delete()
        .eq("session_id", session.id);
      if (linesError) throw linesError;

      const { error: sessionError } = await supabaseBrowserClient
        .from("finished_fabric_stocktake_sessions")
        .delete()
        .eq("id", session.id);
      if (sessionError) throw sessionError;

      await fetchSessions();
    } catch (err: any) {
      console.error("Failed to delete stocktake session", err);
      setError(err.message || "Failed to delete stocktake session.");
    } finally {
      setDeletingId(null);
    }
  }

  function statusBadge(status: string) {
    const base =
      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium border";
    switch (status) {
      case "posted":
        return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
      case "in_progress":
        return `${base} bg-amber-50 text-amber-700 border-amber-200`;
      case "draft":
      default:
        return `${base} bg-slate-50 text-slate-700 border-slate-200`;
    }
  }

  return (
    <div className="grid gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">
            Finished Fabric Stocktakes
          </h1>
          <p className="mt-1 text-slate-600">
            Manage formal stocktake sessions for finished fabric rolls
            (store + rolls awaiting receipt).
          </p>
        </div>
        <Link
          href="/toolbox/finished-fabric"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Finished Fabric
        </Link>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            New Stocktake Session
          </h2>
          {!showForm && (
            <Button
              variant="primary"
              onClick={() => {
                setForm(defaultForm);
                setShowForm(true);
                setError(null);
              }}
            >
              Create Session
            </Button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {error && (
              <div className="sm:col-span-3 text-sm text-red-600">{error}</div>
            )}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Name <span className="text-red-600">*</span>
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="e.g. Jan 2026 Finished Fabric Stocktake"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Stocktake Date <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                name="stocktake_date"
                value={form.stocktake_date}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Performed By <span className="text-red-600">*</span>
              </label>
              <input
                name="performed_by"
                value={form.performed_by}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Name of person performing stocktake"
                required
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Notes
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Optional notes for this stocktake session"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-3 justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create & Open"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setForm(defaultForm);
                  setError(null);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Existing Sessions
          </h2>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading stocktake sessions...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-600">
            No finished fabric stocktake sessions recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2 text-left font-semibold text-slate-900">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-900">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-900">
                    Performed By
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-900">
                    Status
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        className="text-teal-700 hover:underline font-semibold"
                        onClick={() =>
                          router.push(`/toolbox/finished-fabric/stocktake/${s.id}`)
                        }
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {new Date(s.stocktake_date).toLocaleDateString("en-ZA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {s.performed_by}
                    </td>
                    <td className="px-4 py-2">
                      <span className={statusBadge(s.status)}>{s.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            router.push(
                              `/toolbox/finished-fabric/stocktake/${s.id}`,
                            )
                          }
                        >
                          Open
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(s)}
                          disabled={deletingId === s.id}
                        >
                          {deletingId === s.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </div>
  );
}

