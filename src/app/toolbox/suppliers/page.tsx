"use client";

import { useState, useEffect, FormEvent } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { motion } from "framer-motion";

interface Supplier {
  id: string;
  name: string;
  code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  default_currency: string;
  is_active: boolean;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  async function fetchSuppliers() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("suppliers")
        .select("*")
        .order("name");

      if (error) throw error;
      setSuppliers(data || []);
    } catch (err) {
      console.error("Error fetching suppliers:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setName("");
    setCode("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setDefaultCurrency("USD");
    setIsActive(true);
    setEditingSupplier(null);
    setShowForm(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function startEdit(supplier: Supplier) {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setCode(supplier.code || "");
    setContactPerson(supplier.contact_person || "");
    setPhone(supplier.phone || "");
    setEmail(supplier.email || "");
    setDefaultCurrency(supplier.default_currency);
    setIsActive(supplier.is_active);
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
      const supplierData = {
        name: name.trim(),
        code: code.trim() || null,
        contact_person: contactPerson.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        default_currency: defaultCurrency,
        is_active: isActive,
      };

      if (editingSupplier) {
        const { error } = await supabaseBrowserClient
          .from("suppliers")
          .update(supplierData)
          .eq("id", editingSupplier.id);

        if (error) throw error;
        setSuccessMessage("Supplier updated successfully!");
      } else {
        const { error } = await supabaseBrowserClient
          .from("suppliers")
          .insert(supplierData);

        if (error) throw error;
        setSuccessMessage("Supplier created successfully!");
      }

      await fetchSuppliers();
      resetForm();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save supplier. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Suppliers</h1>
            <p className="mt-2 text-slate-600">
              Manage yarn and chemical suppliers.
            </p>
          </div>
          {!showForm && (
            <Button
              variant="primary"
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              Add Supplier
            </Button>
          )}
        </div>
      </section>

      {/* Form */}
      {showForm && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-6 text-xl font-semibold text-slate-900">
            {editingSupplier ? "Edit Supplier" : "Add New Supplier"}
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
                placeholder="Supplier name"
                required
                disabled={isSubmitting}
              />
            </div>

            <Input
              label="Code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Supplier code (optional)"
              disabled={isSubmitting}
            />

            <div className="w-full">
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">
                Default Currency
              </label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                disabled={isSubmitting}
              >
                <option value="USD">USD</option>
                <option value="ZAR">ZAR</option>
              </select>
            </div>

            <Input
              label="Contact Person"
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="Contact name (optional)"
              disabled={isSubmitting}
            />

            <Input
              label="Phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number (optional)"
              disabled={isSubmitting}
            />

            <div className="sm:col-span-2">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com (optional)"
                disabled={isSubmitting}
              />
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
                {editingSupplier ? "Update Supplier" : "Create Supplier"}
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

      {/* Suppliers Table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          All Suppliers
        </h2>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : suppliers.length === 0 ? (
          <p className="text-sm text-slate-600">No suppliers found. Add your first supplier above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Default Currency</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {supplier.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {supplier.code || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {supplier.default_currency}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          supplier.is_active
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {supplier.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => startEdit(supplier)}
                        className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
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

