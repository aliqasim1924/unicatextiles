"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface BaseFabricItem {
  id: string;
  name: string;
  construction: string | null;
  gsm: number | null;
}

export default function NewBaseFabricOrderPage() {
  const router = useRouter();
  const [fabricItems, setFabricItems] = useState<BaseFabricItem[]>([]);
  const [form, setForm] = useState({
    base_fabric_item_id: "",
    loom_no: "",
    planned_qty_m: "",
    weaved_width_mm: "",
    estimated_completion_at: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchFabricItems();
  }, []);

  async function fetchFabricItems() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("base_fabric_items")
        .select("id, name, construction, gsm")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      setFabricItems(data as BaseFabricItem[]);
    } catch (err: any) {
      setError(err.message || "Failed to load fabric items.");
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

    if (!form.base_fabric_item_id) {
      setError("Please select a base fabric item.");
      return;
    }

    if (!form.planned_qty_m || Number(form.planned_qty_m) <= 0) {
      setError("Planned quantity must be greater than zero.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: insertError } = await supabaseBrowserClient
        .from("base_fabric_orders")
        .insert({
          base_fabric_item_id: form.base_fabric_item_id,
          loom_no: form.loom_no || null,
          planned_qty_m: Number(form.planned_qty_m),
          weaved_width_mm: form.weaved_width_mm ? Number(form.weaved_width_mm) : null,
          estimated_completion_at: form.estimated_completion_at
            ? new Date(form.estimated_completion_at).toISOString()
            : null,
          notes: form.notes || null,
          status: "PLANNED",
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      router.push(`/toolbox/base-fabric/orders/${data.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">New Production Order</h1>
          <p className="mt-1 text-slate-600">Create a new base fabric production order.</p>
        </div>
        <Link
          href="/toolbox/base-fabric"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Base Fabric
        </Link>
      </div>

      {/* Form */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Order Details</h2>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Base Fabric Item <span className="text-red-600">*</span>
            </label>
            <select
              name="base_fabric_item_id"
              value={form.base_fabric_item_id}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              required
            >
              <option value="">Select fabric item</option>
              {fabricItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.construction && ` - ${item.construction}`}
                  {item.gsm && ` (${item.gsm} GSM)`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Loom No</label>
            <input
              name="loom_no"
              value={form.loom_no}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. LOOM-7"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Planned Quantity (meters) <span className="text-red-600">*</span>
            </label>
            <input
              name="planned_qty_m"
              type="number"
              min="0"
              step="0.01"
              value={form.planned_qty_m}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. 1000.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Weaved Width (mm)</label>
            <input
              name="weaved_width_mm"
              type="number"
              min="0"
              step="0.01"
              value={form.weaved_width_mm}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. 2500.00"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Estimated Completion
            </label>
            <input
              name="estimated_completion_at"
              type="datetime-local"
              value={form.estimated_completion_at}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
            />
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

          <div className="sm:col-span-2 flex justify-end gap-3">
            <Link href="/toolbox/base-fabric">
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </Link>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Order"}
            </Button>
          </div>
        </form>
      </motion.section>
    </div>
  );
}

