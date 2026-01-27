"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { motion } from "framer-motion";

interface YarnItem {
  id: string;
  name: string;
  denier: number | null;
  material: string | null;
  color: string | null;
  supplier_id: string | null;
  uom: string;
  is_active: boolean;
  suppliers: {
    name: string;
  } | null;
}

export default function YarnItemsPage() {
  const [yarnItems, setYarnItems] = useState<YarnItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<YarnItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [denier, setDenier] = useState("");
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [uom, setUom] = useState("kg");
  const [isActive, setIsActive] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchYarnItems();
  }, []);

  async function fetchYarnItems() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("yarn_items")
        .select(`
          *,
          suppliers:supplier_id (
            name
          )
        `)
        .order("name");

      if (error) throw error;
      setYarnItems(
        (data as any[]).map((item) => ({
          ...item,
          suppliers: Array.isArray(item.suppliers) ? item.suppliers[0] : item.suppliers,
        })) as YarnItem[]
      );
    } catch (err) {
      console.error("Error fetching yarn items:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!id) return;
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setDeletingId(id);

    try {
      const { error } = await supabaseBrowserClient.from("yarn_items").delete().eq("id", id);
      if (error) throw error;
      setSuccessMessage("Yarn item deleted successfully!");
      await fetchYarnItems();
      if (editingItem && editingItem.id === id) {
        resetForm();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete yarn item. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  function resetForm() {
    setName("");
    setDenier("");
    setMaterial("");
    setColor("");
    setSupplierId("");
    setUom("kg");
    setIsActive(true);
    setEditingItem(null);
    setShowForm(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function startEdit(item: YarnItem) {
    setEditingItem(item);
    setName(item.name);
    setDenier(item.denier?.toString() || "");
    setMaterial(item.material || "");
    setColor(item.color || "");
    setSupplierId(item.supplier_id || "");
    setUom(item.uom);
    setIsActive(item.is_active);
    setShowForm(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!name.trim()) {
      setErrorMessage("Name is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const itemData = {
        name: name.trim(),
        denier: denier ? parseInt(denier) : null,
        material: material.trim() || null,
        color: color.trim() || null,
        supplier_id: supplierId || null,
        uom: uom,
        is_active: isActive,
      };

      if (editingItem) {
        const { error } = await supabaseBrowserClient
          .from("yarn_items")
          .update(itemData)
          .eq("id", editingItem.id);

        if (error) throw error;
        setSuccessMessage("Yarn item updated successfully!");
      } else {
        const { error } = await supabaseBrowserClient
          .from("yarn_items")
          .insert(itemData);

        if (error) throw error;
        setSuccessMessage("Yarn item created successfully!");
      }

      await fetchYarnItems();
      resetForm();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save yarn item. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Yarn Items</h1>
          <p className="mt-1 text-slate-600">
            Manage the yarn items used in production.
          </p>
        </div>
        <Link
          href="/toolbox/yarn"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Yarn Control
        </Link>
      </div>

      {/* Form */}
      {showForm && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-6 text-xl font-semibold text-slate-900">
            {editingItem ? "Edit Yarn Item" : "Add New Yarn Item"}
          </h2>

          {successMessage && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Yarn item name"
                required
                disabled={isSubmitting}
              />
            </div>

            <Input
              label="Denier"
              type="number"
              value={denier}
              onChange={(e) => setDenier(e.target.value)}
              placeholder="e.g., 300"
              disabled={isSubmitting}
            />

            <div className="w-full">
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">
                Material
              </label>
              <select
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                disabled={isSubmitting}
              >
                <option value="">Select material (optional)</option>
                <option value="Polyester">Polyester</option>
                <option value="Nylon">Nylon</option>
                <option value="Cotton">Cotton</option>
                <option value="Wool">Wool</option>
                <option value="Acrylic">Acrylic</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <Input
              label="Color"
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Color (optional)"
              disabled={isSubmitting}
            />

            <div className="sm:col-span-2">
              <SupplierSelect
                value={supplierId}
                onChange={setSupplierId}
                disabled={isSubmitting}
                allowNone={true}
              />
            </div>

            <div className="w-full">
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">
                UoM
              </label>
              <select
                value={uom}
                onChange={(e) => setUom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                disabled={isSubmitting}
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="lb">lb</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="is-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                disabled={isSubmitting}
              />
              <label htmlFor="is-active" className="text-sm font-semibold text-slate-900">
                Active
              </label>
            </div>

            <div className="sm:col-span-2 flex gap-3">
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                disabled={isSubmitting}
              >
                {editingItem ? "Update Item" : "Create Item"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </motion.section>
      )}

      {/* Yarn Items Table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">All Yarn Items</h2>
          {!showForm && (
            <Button
              variant="primary"
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              Add Yarn Item
            </Button>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : yarnItems.length === 0 ? (
          <p className="text-sm text-slate-600">No yarn items found. Add your first item above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Denier</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Material</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Color</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Default Supplier</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">UoM</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {yarnItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.denier ? `${item.denier}D` : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.material || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.color || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.suppliers?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.uom}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          item.is_active
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {item.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => startEdit(item)}
                          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="text-sm font-semibold text-red-600 hover:text-red-700 transition disabled:opacity-60"
                          disabled={deletingId === item.id || isSubmitting}
                        >
                          {deletingId === item.id ? "Deleting..." : "Delete"}
                        </button>
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

