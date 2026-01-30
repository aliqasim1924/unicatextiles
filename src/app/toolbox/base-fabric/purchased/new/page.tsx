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

interface LineItem {
  id: string;
  base_fabric_item_id: string;
  cost_per_m_zar: string;
  rolls: RollRow[];
}

export default function NewPurchasedBaseFabricPage() {
  const router = useRouter();
  const [fabricItems, setFabricItems] = useState<BaseFabricItem[]>([]);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [purchasedFrom, setPurchasedFrom] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: crypto.randomUUID(),
      base_fabric_item_id: "",
      cost_per_m_zar: "",
      rolls: [{ id: crypto.randomUUID(), roll_no: "", length_m: "" }],
    },
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

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        base_fabric_item_id: "",
        cost_per_m_zar: "",
        rolls: [{ id: crypto.randomUUID(), roll_no: "", length_m: "" }],
      },
    ]);
  }

  function removeLineItem(lineId: string) {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((li) => li.id !== lineId));
  }

  function updateLineItem(
    lineId: string,
    field: "base_fabric_item_id" | "cost_per_m_zar",
    value: string
  ) {
    setLineItems((prev) =>
      prev.map((li) =>
        li.id === lineId ? { ...li, [field]: value } : li
      )
    );
  }

  function addRoll(lineId: string) {
    setLineItems((prev) =>
      prev.map((li) =>
        li.id === lineId
          ? {
              ...li,
              rolls: [
                ...li.rolls,
                { id: crypto.randomUUID(), roll_no: "", length_m: "" },
              ],
            }
          : li
      )
    );
  }

  function removeRoll(lineId: string, rollId: string) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.id !== lineId) return li;
        if (li.rolls.length <= 1) return li;
        return {
          ...li,
          rolls: li.rolls.filter((r) => r.id !== rollId),
        };
      })
    );
  }

  function updateRoll(
    lineId: string,
    rollId: string,
    field: "roll_no" | "length_m",
    value: string
  ) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.id !== lineId) return li;
        return {
          ...li,
          rolls: li.rolls.map((r) =>
            r.id === rollId ? { ...r, [field]: value } : r
          ),
        };
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validLineItems: LineItem[] = [];
    for (const li of lineItems) {
      if (!li.base_fabric_item_id) continue;
      const costPerM = li.cost_per_m_zar.trim()
        ? parseFloat(li.cost_per_m_zar)
        : null;
      if (costPerM != null && (isNaN(costPerM) || costPerM < 0)) {
        setError(`Cost per metre must be a non-negative number for "${fabricItems.find((f) => f.id === li.base_fabric_item_id)?.name ?? "line item"}".`);
        return;
      }
      const validRolls = li.rolls.filter(
        (r) =>
          r.roll_no.trim() !== "" &&
          r.length_m.trim() !== "" &&
          !isNaN(parseFloat(r.length_m)) &&
          parseFloat(r.length_m) > 0
      );
      if (validRolls.length === 0) continue;
      validLineItems.push({
        ...li,
        cost_per_m_zar: li.cost_per_m_zar,
        rolls: validRolls,
      });
    }

    if (validLineItems.length === 0) {
      setError("Add at least one line item with a fabric, cost per metre, and at least one roll.");
      return;
    }

    setIsSubmitting(true);
    try {
      let firstOrderId: string | null = null;
      for (const li of validLineItems) {
        const totalMetres = li.rolls.reduce(
          (sum, r) => sum + parseFloat(r.length_m),
          0
        );
        const costPerM = li.cost_per_m_zar.trim()
          ? parseFloat(li.cost_per_m_zar)
          : null;

        const { data: orderData, error: orderError } = await supabaseBrowserClient
          .from("base_fabric_orders")
          .insert({
            base_fabric_item_id: li.base_fabric_item_id,
            planned_qty_m: totalMetres,
            status: "COMPLETED",
            is_outsourced: true,
            beam_weft_not_required: true,
            purchased_cost_per_m_zar: costPerM,
            invoice_no: invoiceNo.trim() || null,
            invoice_date: invoiceDate || null,
            purchased_from: purchasedFrom.trim() || null,
            notes: "Purchased (outsourced) base fabric",
            actual_completion_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (orderError) throw orderError;

        const orderId = orderData.id;
        if (!firstOrderId) firstOrderId = orderId;

        for (const r of li.rolls) {
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
      }

      router.push(firstOrderId ? `/toolbox/base-fabric/orders/${firstOrderId}` : "/toolbox/base-fabric");
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
            Enter invoice details and line items (fabric, cost per metre, rolls). Multiple fabrics can be on one invoice.
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

        <form onSubmit={handleSubmit} className="grid gap-8">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Invoice (shared)</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Number</label>
                <input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  placeholder="e.g. INV-2026-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Supplier / Purchased From</label>
                <input
                  value={purchasedFrom}
                  onChange={(e) => setPurchasedFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  placeholder="e.g. Cape Coaters"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Line items (fabric + cost + rolls)</h3>
              <Button type="button" variant="secondary" onClick={addLineItem}>
                Add line item
              </Button>
            </div>

            {lineItems.map((li, idx) => (
              <div
                key={li.id}
                className="mb-6 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-700">Line item {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeLineItem(li.id)}
                    disabled={lineItems.length <= 1}
                    className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove line
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Base Fabric *</label>
                    <select
                      value={li.base_fabric_item_id}
                      onChange={(e) =>
                        updateLineItem(li.id, "base_fabric_item_id", e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    >
                      <option value="">Select fabric</option>
                      {fabricItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cost per Metre (ZAR)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={li.cost_per_m_zar}
                      onChange={(e) =>
                        updateLineItem(li.id, "cost_per_m_zar", e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                      placeholder="e.g. 5.50"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700">Rolls *</label>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => addRoll(li.id)}
                      className="!py-1.5 !text-xs"
                    >
                      Add roll
                    </Button>
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <th className="px-3 py-2 text-left font-semibold text-slate-900">Roll No</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-900">Length (m)</th>
                          <th className="px-3 py-2 w-20"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {li.rolls.map((r) => (
                          <tr key={r.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={r.roll_no}
                                onChange={(e) =>
                                  updateRoll(li.id, r.id, "roll_no", e.target.value)
                                }
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                                placeholder="e.g. TF1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.001"
                                value={r.length_m}
                                onChange={(e) =>
                                  updateRoll(li.id, r.id, "length_m", e.target.value)
                                }
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                                placeholder="e.g. 1035"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => removeRoll(li.id, r.id)}
                                disabled={li.rolls.length <= 1}
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
              </div>
            ))}
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
