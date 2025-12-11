"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface DyeItem {
  id: string;
  name: string;
  type: string | null;
  code: string | null;
  uom: string;
}

interface IssueRow {
  id: string;
  txn_time: string;
  quantity: number;
  uom: string;
  batch_no: string | null;
  destination: string | null;
  slip_no: string | null;
  dye_items: {
    name: string;
  };
}

const DESTINATION_OPTIONS = [
  { value: "COATING", label: "Coating Department" },
  { value: "GENERAL", label: "General" },
];

const defaultForm = {
  dye_item_id: "",
  batch_no: "",
  quantity: "",
  uom: "kg",
  source: "CHEMICAL STORE",
  destination: "GENERAL",
  notes: "",
};

export default function DyesIssuingPage() {
  const [dyeItems, setDyeItems] = useState<DyeItem[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; id?: string; slip_no?: string } | null>(null);
  const [recentIssues, setRecentIssues] = useState<IssueRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchItems();
    fetchRecentIssues();
  }, []);

  async function fetchItems() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("dye_items")
        .select("id, name, type, code, uom")
        .order("name", { ascending: true });

      if (error) throw error;
      setDyeItems(data as DyeItem[]);
    } catch (err: any) {
      setError(err.message || "Failed to load dye items.");
    }
  }

  async function fetchRecentIssues() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("dye_transactions")
        .select(
          `
          id,
          txn_time,
          quantity,
          uom,
          batch_no,
          destination,
          slip_no,
          dye_items:dye_item_id ( name )
        `
        )
        .eq("transaction_type", "ISSUE")
        .order("txn_time", { ascending: false })
        .limit(10);

      if (error) throw error;

      const processed = (data as any[]).map((row) => ({
        ...row,
        dye_items: Array.isArray(row.dye_items) ? row.dye_items[0] : row.dye_items,
      })) as IssueRow[];

      setRecentIssues(processed);
    } catch (err: any) {
      setError(err.message || "Failed to load recent issues.");
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.dye_item_id) {
      setError("Please select a dye item.");
      return;
    }

    if (!form.quantity || Number(form.quantity) <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: insertError } = await supabaseBrowserClient
        .from("dye_transactions")
        .insert({
          dye_item_id: form.dye_item_id,
          transaction_type: "ISSUE",
          quantity: Number(form.quantity),
          uom: form.uom,
          source: form.source || null,
          destination: form.destination || "GENERAL",
          batch_no: form.batch_no || null,
          notes: form.notes || null,
        })
        .select("id, slip_no")
        .single();

      if (insertError) throw insertError;

      setSuccess({
        message: "Dyes/Chemicals issue recorded.",
        id: data?.id,
        slip_no: data?.slip_no || undefined,
      });
      setForm(defaultForm);
      fetchRecentIssues();
    } catch (err: any) {
      setError(err.message || "Failed to record issue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Dyes &amp; Chemicals Issuing</h1>
          <p className="mt-1 text-slate-600">Record issues of dyes and chemicals.</p>
        </div>
        <Link
          href="/toolbox/dyes"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Dyes &amp; Chemicals
        </Link>
      </div>

      {/* Form */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Record Issuing</h2>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {success && (
          <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <p>
              {success.message}
              {success.slip_no ? ` Slip No: ${success.slip_no}` : ""}
            </p>
            {success.id && (
              <div className="mt-2">
                <Link href={`/toolbox/dyes/issuing/slip/${success.id}`}>
                  <Button variant="primary">View &amp; Print Issue Slip</Button>
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <label className="block text-sm font-semibold text-slate-900 mb-2">Dye Item</label>
            <select
              name="dye_item_id"
              value={form.dye_item_id}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
            >
              <option value="">Select dye item</option>
              {dyeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.type ? `(${item.type})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Batch No</label>
            <input
              name="batch_no"
              value={form.batch_no}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="Batch / Lot number (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Quantity</label>
            <input
              name="quantity"
              type="number"
              min="0"
              step="0.001"
              value={form.quantity}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. 10.000"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">UoM</label>
            <select
              name="uom"
              value={form.uom}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
            >
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="l">l</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Source</label>
            <input
              name="source"
              value={form.source}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Destination</label>
            <select
              name="destination"
              value={form.destination}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
            >
              {DESTINATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="Optional notes"
            />
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record Issuing"}
            </Button>
          </div>
        </form>
      </motion.section>

      {/* Recent issues */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Recent Issues</h2>
        {recentIssues.length === 0 ? (
          <p className="text-sm text-slate-600">No issues recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Date/Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Dye Item</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Destination</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Quantity</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Batch</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Slip No</th>
                </tr>
              </thead>
              <tbody>
                {recentIssues.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(row.txn_time).toLocaleString("en-ZA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.dye_items?.name || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.destination === "COATING"
                        ? "Coating Department"
                        : row.destination === "WEAVING"
                        ? "Weaving Department"
                        : row.destination === "GENERAL"
                        ? "General"
                        : row.destination || "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {row.quantity.toFixed(3)} {row.uom}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.batch_no || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.slip_no || "-"}</td>
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

