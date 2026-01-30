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
}

interface RollRow {
  id: string;
  roll_no: string;
  length_m: string;
}

export default function NewPurchasedBaseFabricPage() {
  const router = useRouter();
  const [fabricItems, setFabricItems] = useState<BaseFabricItem[]>([]);
  const [form, setForm] = useState({
    base_fabric_item_id: "",
    invoice_no: "",
    invoice_date: "",
    purchased_from: "",
    cost_per_m_zar: "",
  });
  const [rolls, setRolls] = useState<RollRow[]>([
    { id: "1", roll_no: "", length_m: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchFabricItems();
  }, []);

  async function fetchFabricItems() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("base_fabric_items")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      setFabricItems(data as BaseFabricItem[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load fabric items.");
    }
  }

  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function addRoll() {
    setRolls((prev) => [
      ...prev,
      { id: crypto.randomUUID(), roll_no: "", length_m: "" },
    ]);
  }

  function removeRoll(id: string) {
    if (rolls.length <= 1) return;
    setRolls((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRoll(id: string, field: "roll_no" | "length_m", value: string) {
    setRolls((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.base_fabric_item_id) {
      setError("Please select a base fabric item.");
      return;
    }

    const costPerM = form.cost_per_m_zar ? parseFloat(form.cost_per_m_zar) : null;
    if (costPerM != null && (isNaN(costPerM) || costPerM < 0)) {
      setError("Cost per metre must be a non-negative number.");
      return;
    }

    const validRolls = rolls.filter(
      (r) => r.roll_no.trim() !== "" && r.length_m.trim() !== "" && !isNaN(parseFloat(r.length_m)) && parseFloat(r.length_m) > 0
    );
    if (validRolls.length === 0) {
      setError("Add at least one roll with roll number and length (m).");
      return;
    }

    const totalMetres = validRolls.reduce(
      (sum, r) => sum + parseFloat(r.length_m),
      0
    );

    setIsSubmitting(true);
    try {
      const { data: orderData, error: orderError } = await supabaseBrowserClient
        .from("base_fabric_orders")
        .insert({
          base_fabric_item_id: form.base_fabric_item_id,
          planned_qty_m: totalMetres,
          status: "COMPLETED",
          is_outsourced: true,
          beam_weft_not_required: true,
          purchased_cost_per_m_zar: costPerM,
          invoice_no: form.invoice_no.trim() || null,
          invoice_date: form.invoice_date || null,
          purchased_from: form.purchased_from.trim() || null,
          notes: "Purchased (outsourced) base fabric",
          actual_completion_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      const orderId = orderData.id;
      for (const r of validRolls) {
        const { error: rollError } = await supabaseBrowserClient
          .from("base_fabric_rolls")
          .insert({
            base_fabric_order_id: orderId,
            roll_no: r.roll_no.trim(),
            length_m: parseFloat(r.length_m),
            cut_at: new Date().toISOString(),
          });
        if (rollError) throw rollError;
      }

      router.push(`/toolbox/base-fabric/orders/${orderId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record purchased base fabric.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Record Purchased (Outsourced) Base Fabric</h1>
          <p className="mt-1 text-slate-600">
            Enter invoice details and rolls for base fabric bought from an external supplier.
          </p>
        </div>
        <Link
          href="/toolbox/base-fabric"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Base Fabric
        </Link>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Purchase Details</h2>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <form onSubmit={handleSubmit} className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1">Base Fabric Item *</label>
              <select
                name="base_fabric_item_id"
                value={form.base_fabric_item_id}
                onChange={handleFormChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                required
              >
                <option value="">Select item</option>
                {fabricItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1">Invoice Number</label>
              <input
                name="invoice_no"
                value={form.invoice_no}
                onChange={handleFormChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                placeholder="e.g. INV-2026-001"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1">Invoice Date</label>
              <input
                name="invoice_date"
                type="date"
                value={form.invoice_date}
                onChange={handleFormChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1">Supplier / Purchased From</label>
              <input
                name="purchased_from"
                value={form.purchased_from}
                onChange={handleFormChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                placeholder="e.g. Cape Coaters"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1">Cost per Metre (ZAR)</label>
              <input
                name="cost_per_m_zar"
                type="number"
                min="0"
                step="0.01"
                value={form.cost_per_m_zar}
                onChange={handleFormChange}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                placeholder="e.g. 5.50"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-slate-900">Rolls *</label>
              <Button type="button" variant="secondary" onClick={addRoll}>
                Add roll
              </Button>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="px-4 py-2 text-left font-semibold text-slate-900">Roll No</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-900">Length (m)</th>
                    <th className="px-4 py-2 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {rolls.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={r.roll_no}
                          onChange={(e) => updateRoll(r.id, "roll_no", e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                          placeholder="e.g. TF1"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={r.length_m}
                          onChange={(e) => updateRoll(r.id, "length_m", e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                          placeholder="e.g. 1035"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => removeRoll(r.id)}
                          disabled={rolls.length <= 1}
                          className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record Purchased Base Fabric"}
            </Button>
          </div>
        </form>
      </motion.section>
    </div>
  );
}
