"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface FabricItem {
  id: string;
  name: string;
  construction: string | null;
  gsm: number | null;
  width_cm: number | null;
  is_active: boolean;
}

const defaultForm = {
  id: "",
  name: "",
  construction: "",
  gsm: "",
  width_cm: "",
  is_active: true,
};

export default function BaseFabricItemsPage() {
  const [items, setItems] = useState<FabricItem[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("base_fabric_items")
        .select("id, name, construction, gsm, width_cm, is_active")
        .order("name", { ascending: true });
      if (error) throw error;
      setItems(data as FabricItem[]);
    } catch (err: any) {
      setError(err.message || "Failed to load items.");
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value, type } = e.target;
    const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : undefined;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function startEdit(item: FabricItem) {
    setIsEditing(true);
    setForm({
      id: item.id,
      name: item.name,
      construction: item.construction || "",
      gsm: item.gsm !== null && item.gsm !== undefined ? String(item.gsm) : "",
      width_cm: item.width_cm !== null && item.width_cm !== undefined ? String(item.width_cm) : "",
      is_active: item.is_active,
    });
    setError(null);
    setSuccess(null);
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
          .from("base_fabric_items")
          .update({
            name: form.name.trim(),
            construction: form.construction || null,
            gsm: form.gsm ? Number(form.gsm) : null,
            width_cm: form.width_cm ? Number(form.width_cm) : null,
            is_active: form.is_active,
          })
          .eq("id", form.id);
        if (updateError) throw updateError;
        setSuccess("Item updated.");
      } else {
        const { error: insertError } = await supabaseBrowserClient.from("base_fabric_items").insert({
          name: form.name.trim(),
          construction: form.construction || null,
          gsm: form.gsm ? Number(form.gsm) : null,
          width_cm: form.width_cm ? Number(form.width_cm) : null,
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
          <h1 className="text-3xl font-semibold text-slate-900">Base Fabric Items</h1>
          <p className="mt-1 text-slate-600">Manage base fabric specifications used in weaving.</p>
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

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Name <span className="text-red-600">*</span>
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. 210 GSM Greige Twill"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-sm font-semibold text-slate-900 mb-2">Construction</label>
            <input
              name="construction"
              value={form.construction}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. 2/1 Twill"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">GSM</label>
            <input
              name="gsm"
              type="number"
              min="0"
              step="0.01"
              value={form.gsm}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. 210.00"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Width (cm)</label>
            <input
              name="width_cm"
              type="number"
              min="0"
              step="0.01"
              value={form.width_cm}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. 190.00"
            />
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

          <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-3">
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
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Construction</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">GSM</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Width (cm)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Active</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.construction || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.gsm !== null && item.gsm !== undefined ? item.gsm.toFixed(2) : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.width_cm !== null && item.width_cm !== undefined
                        ? item.width_cm.toFixed(2)
                        : "-"}
                    </td>
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

