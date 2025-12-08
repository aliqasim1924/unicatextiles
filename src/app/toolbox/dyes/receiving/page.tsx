"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";

interface DyeItem {
  id: string;
  name: string;
  type: string | null;
  code: string | null;
  uom: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface ReceiptRow {
  id: string;
  txn_time: string;
  quantity: number;
  uom: string;
  batch_no: string | null;
  destination: string | null;
  dye_items: {
    name: string;
  };
  suppliers: {
    name: string;
  } | null;
}

const defaultForm = {
  dye_item_id: "",
  supplier_id: "",
  batch_no: "",
  quantity: "",
  uom: "kg",
  source: "SUPPLIER",
  destination: "STORE",
  notes: "",
};

export default function DyesReceivingPage() {
  const [dyeItems, setDyeItems] = useState<DyeItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchOptions();
    fetchRecentReceipts();
  }, []);

  async function fetchOptions() {
    try {
      const [{ data: dyeData, error: dyeError }, { data: supplierData, error: supplierError }] =
        await Promise.all([
          supabaseBrowserClient
            .from("dye_items")
            .select("id, name, type, code, uom")
            .order("name", { ascending: true }),
          supabaseBrowserClient
            .from("suppliers")
            .select("id, name")
            .eq("is_active", true)
            .order("name", { ascending: true }),
        ]);

      if (dyeError) throw dyeError;
      if (supplierError) throw supplierError;

      setDyeItems(dyeData as DyeItem[]);
      setSuppliers(supplierData as Supplier[]);
    } catch (err: any) {
      setError(err.message || "Failed to load options.");
    }
  }

  async function fetchRecentReceipts() {
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
          dye_items:dye_item_id ( name ),
          suppliers:supplier_id ( name )
        `
        )
        .eq("transaction_type", "RECEIPT")
        .order("txn_time", { ascending: false })
        .limit(10);

      if (error) throw error;

      const processed = (data as any[]).map((row) => ({
        ...row,
        dye_items: Array.isArray(row.dye_items) ? row.dye_items[0] : row.dye_items,
        suppliers: Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers,
      })) as ReceiptRow[];

      setRecentReceipts(processed);
    } catch (err: any) {
      setError(err.message || "Failed to load recent receipts.");
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
      const { error: insertError } = await supabaseBrowserClient.from("dye_transactions").insert({
        dye_item_id: form.dye_item_id,
        supplier_id: form.supplier_id || null,
        transaction_type: "RECEIPT",
        quantity: Number(form.quantity),
        uom: form.uom,
        source: form.source || null,
        destination: form.destination || null,
        batch_no: form.batch_no || null,
        notes: form.notes || null,
      });

      if (insertError) throw insertError;

      setSuccess("Receipt recorded successfully.");
      setForm(defaultForm);
      fetchRecentReceipts();
    } catch (err: any) {
      setError(err.message || "Failed to record receipt.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Dyes &amp; Chemicals Receiving</h1>
          <p className="mt-1 text-slate-600">Record incoming dyes and chemicals.</p>
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
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Record Receiving</h2>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {success && <p className="mb-3 text-sm text-green-700">{success}</p>}

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

          <div className="sm:col-span-1">
            <SupplierSelect
              label="Supplier"
              value={form.supplier_id}
              onChange={(value) => setForm((prev) => ({ ...prev, supplier_id: value }))}
              suppliers={suppliers}
              includeEmpty
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Batch No</label>
            <input
              name="batch_no"
              value={form.batch_no}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="Batch / Lot number"
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
              placeholder="e.g. 25.000"
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
            <input
              name="destination"
              value={form.destination}
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

          <div className="sm:col-span-2 flex justify-end">
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record Receiving"}
            </Button>
          </div>
        </form>
      </motion.section>

      {/* Recent receipts */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Recent Receipts</h2>
        {recentReceipts.length === 0 ? (
          <p className="text-sm text-slate-600">No receipts recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Date/Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Dye Item</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Supplier</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Quantity</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Batch</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Destination</th>
                </tr>
              </thead>
              <tbody>
                {recentReceipts.map((row) => (
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
                    <td className="px-4 py-3 text-slate-600">{row.suppliers?.name || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {row.quantity.toFixed(3)} {row.uom}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.batch_no || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.destination || "-"}</td>
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

