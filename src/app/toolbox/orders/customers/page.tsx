"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { BackButton } from "@/components/navigation/BackButton";
import { Button } from "@/components/ui/Button";

type Customer = {
  id: string;
  pastel_code: string | null;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
};

type FormState = {
  pastel_code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  pastel_code: "",
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  is_active: true,
};

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("customers")
        .select("id, pastel_code, name, contact_person, phone, email, address, is_active, created_at")
        .order("name", { ascending: true });

      if (fetchError) throw fetchError;
      setCustomers((data as Customer[]) || []);
    } catch (err: any) {
      console.error("Failed to load customers", err);
      setError(err?.message || "Failed to load customers.");
    } finally {
      setIsLoading(false);
    }
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setSuccess(null);
  }

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setForm({
      pastel_code: c.pastel_code || "",
      name: c.name,
      contact_person: c.contact_person || "",
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      is_active: c.is_active,
    });
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        pastel_code: form.pastel_code.trim() || null,
        name: form.name.trim(),
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        is_active: form.is_active,
      };

      if (editingId) {
        const { error: updateError } = await supabaseBrowserClient
          .from("customers")
          .update(payload)
          .eq("id", editingId);
        if (updateError) {
          if ((updateError as any).code === "23505") {
            setError("Customer name or Pastel code already exists.");
          } else {
            setError(updateError.message || "Failed to update customer.");
          }
          return;
        }
        setSuccess("Customer updated.");
      } else {
        const { error: insertError } = await supabaseBrowserClient.from("customers").insert(payload);
        if (insertError) {
          if ((insertError as any).code === "23505") {
            setError("Customer name or Pastel code already exists.");
          } else {
            setError(insertError.message || "Failed to create customer.");
          }
          return;
        }
        setSuccess("Customer created.");
      }

      await fetchCustomers();
      if (!editingId) {
        setForm(emptyForm);
      }
    } catch (err: any) {
      console.error("Failed to save customer", err);
      setError(err?.message || "Failed to save customer.");
    } finally {
      setIsSaving(false);
    }
  }

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (!showInactive && !c.is_active) return false;
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        (c.pastel_code || "").toLowerCase().includes(term)
      );
    });
  }, [customers, search, showInactive]);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Customers</h1>
          <p className="mt-1 text-slate-600">
            Maintain the customer master used for orders and dispatch.
          </p>
        </div>
        <BackButton href="/toolbox/orders" label="Back to Orders" />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {editingId ? "Edit Customer" : "Add Customer"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={startNew}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Clear form
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Pastel Code
              </label>
              <input
                type="text"
                value={form.pastel_code}
                onChange={(e) => setForm((f) => ({ ...f, pastel_code: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Optional financial code"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Name<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Customer name"
                required
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-slate-900">
                Active
              </label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Contact Person
              </label>
              <input
                type="text"
                value={form.contact_person}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contact_person: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Contact name"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Email address"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Address
            </label>
            <textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="Postal / physical address"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" isLoading={isSaving} disabled={isSaving}>
              {editingId ? "Save Changes" : "Add Customer"}
            </Button>
            <button
              type="button"
              onClick={startNew}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Reset
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Search
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Name or Pastel code..."
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="show_inactive"
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
            />
            <label htmlFor="show_inactive" className="text-sm text-slate-800">
              Show inactive customers
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading customers...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-600">No customers found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Pastel Code
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Phone / Email
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => router.push(`/toolbox/orders/customers/${c.id}/activity`)}
                  >
                    <td className="px-4 py-3 text-slate-900 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {c.pastel_code || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {c.contact_person || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {c.phone || c.email ? (
                        <>
                          {c.phone}
                          {c.phone && c.email && " · "}
                          {c.email}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          c.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="text-sm text-slate-600 hover:text-slate-900"
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
      </section>
    </div>
  );
}