"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";

interface Supplier {
  id: string;
  name: string;
}

interface DyeItem {
  id: string;
  name: string;
  type: string | null;
  code: string | null;
  supplier_id: string | null;
  uom: string;
  is_active: boolean;
  suppliers?: { name: string } | null;
}

const defaultForm = {
  id: "",
  name: "",
  type: "Dye",
  code: "",
  supplier_id: "",
  uom: "kg",
  is_active: true,
};

export default function DyeItemsPage() {
  const [items, setItems] = useState<DyeItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchSuppliers();
    fetchItems();
  }, []);

  async function fetchSuppliers() {
    const { data, error } = await supabaseBrowserClient
      .from("suppliers")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (!error && data) setSuppliers(data as Supplier[]);
  }

  async function fetchItems() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("dye_items")
        .select(
          `
          id,
          name,
          type,
          code,
          supplier_id,
          uom,
          is_active,
          suppliers:supplier_id ( name )
        `
        )
        .order("name", { ascending: true });
      if (error) throw error;
      const processed = (data as any[]).map((row) => ({
        ...row,
        suppliers: Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers,
      })) as DyeItem[];
      setItems(processed);
    } catch (err: any) {
      setError(err.message || "Failed to load items.");
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function startEdit(item: DyeItem) {
    setIsEditing(true);
    setForm({
      id: item.id,
      name: item.name,
      type: item.type || "Dye",
      code: item.code || "",
      supplier_id: item.supplier_id || "",
      uom: item.uom || "kg",
      is_active: item.is_active,
    });
    setSuccess(null);
    setError(null);
  }

  function resetForm() {
    setForm(defaultForm);
    setIsEditing(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && form.id) {
        const { error: updateError } = await supabaseBrowserClient
          .from("dye_items")
          .update({
            name: form.name.trim(),
            type: form.type || null,
            code: form.code || null,
            supplier_id: form.supplier_id || null,
            uom: form.uom || "kg",
            is_active: form.is_active,
          })
          .eq("id", form.id);
        if (updateError) throw updateError;
        setSuccess("Item updated.");
      } else {
        const { error: insertError } = await supabaseBrowserClient.from("dye_items").insert({
          name: form.name.trim(),
          type: form.type || null,
          code: form.code || null,
          supplier_id: form.supplier_id || null,
          uom: form.uom || "kg",
          is_active: form.is_active,
        });
        if (insertError) throw insertError;
        setSuccess("Item added.");
      }

      resetForm();
      fetchItems();
    } catch (err: any) {
      setError(err.message || "Save failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Dyes &amp; Chemicals Items</h1>
          <p className="mt-1 text-slate-600">Manage dyes and chemicals used in production.</p>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            {isEditing ? "Edit Item" : "Add New Item"}
          </h2>
          {isEditing && (
            <button
              onClick={resetForm}
              className="text-sm font-semibold text-slate-600 hover:text-slate-800"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {success && <p className="mb-3 text-sm text-green-700">{success}</p>}

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Name</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. Reactive Blue 160"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Type</label>
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
            >
              <option value="Dye">Dye</option>
              <option value="Chemical">Chemical</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Code</label>
            <input
              name="code"
              value={form.code}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. RB160"
            />
          </div>

          <div>
            <SupplierSelect
              label="Default Supplier"
              value={form.supplier_id || ""}
              onChange={(value) => setForm((prev) => ({ ...prev, supplier_id: value }))}
              suppliers={suppliers}
              includeEmpty
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

          <div className="flex items-center gap-2">
            <input
              id="is_active"
              type="checkbox"
              name="is_active"
              checked={form.is_active}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
            />
            <label htmlFor="is_active" className="text-sm font-semibold text-slate-900">
              Active
            </label>
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEditing ? "Update Item" : "Add Item"}
            </Button>
          </div>
        </form>
      </motion.section>

      {/* Table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Items</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-600">No items found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Supplier</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">UoM</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Active</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.type || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{item.code || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{item.suppliers?.name || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{item.uom}</td>
                    <td className="px-4 py-3 text-slate-600">{item.is_active ? "Yes" : "No"}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => startEdit(item)}
                        className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                      >
                        Edit
                      </button>
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

