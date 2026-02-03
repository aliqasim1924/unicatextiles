"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

type Customer = {
  id: string;
  name: string;
  pastel_code: string | null;
  is_active: boolean;
};

type OrderLine = {
  id: string;
  fabric_type_id: string;
  gsm_option_id: string;
  color_option_id: string;
  width_option_id: string;
  quantity_m: string;
  notes: string;
};

interface FabricType {
  id: string;
  code: string;
  name: string;
}

interface GsmOption {
  id: string;
  gsm: number;
}

interface ColorOption {
  id: string;
  color_name: string;
}

interface WidthOption {
  id: string;
  width_mm: number;
}

export default function NewOrderPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [fabricTypes, setFabricTypes] = useState<FabricType[]>([]);
  const [gsmOptions, setGsmOptions] = useState<Record<string, GsmOption[]>>({});
  const [colorOptions, setColorOptions] = useState<Record<string, ColorOption[]>>({});
  const [widthOptions, setWidthOptions] = useState<Record<string, WidthOption[]>>({});

  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<OrderLine[]>([
    {
      id: "line-1",
      fabric_type_id: "",
      gsm_option_id: "",
      color_option_id: "",
      width_option_id: "",
      quantity_m: "",
      notes: "",
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCustomers() {
      try {
        setIsLoadingCustomers(true);
        const { data, error: fetchError } = await supabaseBrowserClient
          .from("customers")
          .select("id, name, pastel_code, is_active")
          .eq("is_active", true)
          .order("name", { ascending: true });
        if (fetchError) throw fetchError;
        setCustomers((data as Customer[]) || []);
      } catch (err: any) {
        console.error("Failed to load customers", err);
        setError(err?.message || "Failed to load customers.");
      } finally {
        setIsLoadingCustomers(false);
      }
    }
    fetchCustomers();
    fetchCatalogData();
  }, []);

  async function fetchCatalogData() {
    try {
      // Fetch fabric types
      const { data: typesData, error: typesError } = await supabaseBrowserClient
        .from("fabric_types")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (typesError) throw typesError;
      setFabricTypes((typesData as FabricType[]) || []);

      // Fetch all GSM options grouped by fabric_type_id
      const { data: gsmData, error: gsmError } = await supabaseBrowserClient
        .from("fabric_type_gsm_options")
        .select("id, fabric_type_id, gsm")
        .eq("is_active", true)
        .order("gsm", { ascending: true });
      if (gsmError) throw gsmError;

      const gsmMap: Record<string, GsmOption[]> = {};
      (gsmData || []).forEach((opt: any) => {
        if (!gsmMap[opt.fabric_type_id]) gsmMap[opt.fabric_type_id] = [];
        gsmMap[opt.fabric_type_id].push({ id: opt.id, gsm: opt.gsm });
      });
      setGsmOptions(gsmMap);

      // Fetch all color options grouped by fabric_type_id
      const { data: colorData, error: colorError } = await supabaseBrowserClient
        .from("fabric_type_color_options")
        .select("id, fabric_type_id, color_name")
        .eq("is_active", true)
        .order("color_name", { ascending: true });
      if (colorError) throw colorError;

      const colorMap: Record<string, ColorOption[]> = {};
      (colorData || []).forEach((opt: any) => {
        if (!colorMap[opt.fabric_type_id]) colorMap[opt.fabric_type_id] = [];
        colorMap[opt.fabric_type_id].push({ id: opt.id, color_name: opt.color_name });
      });
      setColorOptions(colorMap);

      // Fetch all width options grouped by fabric_type_id
      const { data: widthData, error: widthError } = await supabaseBrowserClient
        .from("fabric_type_width_options")
        .select("id, fabric_type_id, width_mm")
        .eq("is_active", true)
        .order("width_mm", { ascending: true });
      if (widthError) throw widthError;

      const widthMap: Record<string, WidthOption[]> = {};
      (widthData || []).forEach((opt: any) => {
        if (!widthMap[opt.fabric_type_id]) widthMap[opt.fabric_type_id] = [];
        widthMap[opt.fabric_type_id].push({ id: opt.id, width_mm: opt.width_mm });
      });
      setWidthOptions(widthMap);
    } catch (err: any) {
      console.error("Failed to load catalog data", err);
      setError(err?.message || "Failed to load catalog data.");
    }
  }

  function updateLine(id: string, patch: Partial<OrderLine>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: `line-${prev.length + 1}-${Date.now()}`,
        fabric_type_id: "",
        gsm_option_id: "",
        color_option_id: "",
        width_option_id: "",
        quantity_m: "",
        notes: "",
      },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!orderRef.trim()) {
      setError("Order reference is required.");
      return;
    }
    if (!customerId) {
      setError("Customer is required.");
      return;
    }

    const validLines = lines.filter(
      (l) =>
        l.fabric_type_id &&
        l.color_option_id &&
        l.quantity_m.trim() &&
        !Number.isNaN(parseFloat(l.quantity_m))
    );

    if (validLines.length === 0) {
      setError("Add at least one valid order line with fabric type, colour and quantity.");
      return;
    }

    const invalid = lines.find(
      (l) =>
        (l.fabric_type_id && (!l.color_option_id || !l.quantity_m.trim())) ||
        (l.quantity_m && Number.isNaN(parseFloat(l.quantity_m)))
    );
    if (invalid) {
      setError("Each line must have fabric type, colour and a valid quantity in meters.");
      return;
    }
    if (!orderRef.trim()) {
      setError("Order reference is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Resolve customer name for backward-compatible customer_name column
      let resolvedCustomerName = customerName;
      if (!resolvedCustomerName) {
        const local = customers.find((c) => c.id === customerId);
        if (local) {
          resolvedCustomerName = local.name;
        } else {
          const { data: customerRow, error: customerError } = await supabaseBrowserClient
            .from("customers")
            .select("name")
            .eq("id", customerId)
            .single();
          if (customerError) throw customerError;
          resolvedCustomerName = customerRow?.name || "";
        }
      }

      if (!resolvedCustomerName) {
        setError("Could not resolve customer name. Please re-select the customer.");
        return;
      }

      const headerPayload: any = {
        order_ref: orderRef.trim(),
        customer_id: customerId,
        customer_name: resolvedCustomerName,
        notes: notes.trim() || null,
        status: "OPEN",
      };

      const { data: header, error: insertError } = await supabaseBrowserClient
        .from("customer_orders")
        .insert(headerPayload)
        .select("id")
        .single();

      if (insertError) {
        if ((insertError as any).code === "23505") {
          setError("Order reference already exists. Please use a unique reference.");
        } else {
          setError(insertError.message || "Failed to create order.");
        }
        return;
      }

      const orderId = header?.id as string | undefined;
      if (!orderId) {
        setError("Order created without ID. Please try again.");
        return;
      }

      // Resolve text values from catalog for backward compatibility
      const lineRows = await Promise.all(
        validLines.map(async (l) => {
          const fabricType = fabricTypes.find((ft) => ft.id === l.fabric_type_id);
          const colorOpt = colorOptions[l.fabric_type_id]?.find((c) => c.id === l.color_option_id);
          const gsmOpt = gsmOptions[l.fabric_type_id]?.find((g) => g.id === l.gsm_option_id);
          const widthOpt = widthOptions[l.fabric_type_id]?.find((w) => w.id === l.width_option_id);

          return {
            order_id: orderId,
            fabric_type_id: l.fabric_type_id || null,
            gsm_option_id: l.gsm_option_id || null,
            color_option_id: l.color_option_id || null,
            width_option_id: l.width_option_id || null,
            // Backward compatibility: still store text fields
            coating_type: fabricType?.code || null,
            color: colorOpt?.color_name || null,
            gsm: gsmOpt?.gsm?.toString() || null,
            quantity_m: parseFloat(l.quantity_m),
            notes: l.notes.trim() || null,
            price_rand: 0,
          };
        })
      );

      const { error: lineError } = await supabaseBrowserClient
        .from("customer_order_lines")
        .insert(lineRows);
      if (lineError) throw lineError;

      setSuccess("Order created.");
      router.push(`/toolbox/orders/${orderId}`);
    } catch (err: any) {
      console.error("Failed to create order", err);
      setError(err?.message || "Failed to create order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">New Order</h1>
          <p className="mt-1 text-slate-600">
            Capture a proforma/quotation reference to start planning.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BackButton href="/toolbox/orders" label="Back to Orders" />
          <Link href="/toolbox/orders/customers">
            <Button variant="outline">Manage Customers</Button>
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Order Ref (Proforma/Quotation)<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="e.g. PF-2025-001"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Customer<span className="text-red-500">*</span>
              </label>
              <select
                value={customerId}
                onChange={(e) => {
                  const value = e.target.value;
                  setCustomerId(value);
                  const found = customers.find((c) => c.id === value);
                  setCustomerName(found?.name || "");
                }}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                required
                disabled={isLoadingCustomers}
              >
                <option value="">
                  {isLoadingCustomers ? "Loading customers..." : "Select customer"}
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.pastel_code ? ` (${c.pastel_code})` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Manage customers in Orders → Customers.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="Optional notes for this order"
            />
          </div>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-inner">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Order Lines</h2>
                <p className="text-sm text-slate-600">
                  Add one or more fabric requests for this order.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={addLine}>
                Add Line
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100">
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">
                      Fabric Type
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Colour</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">GSM</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Width (mm)</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">
                      Quantity (m)
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Notes</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const availableGsm = line.fabric_type_id ? gsmOptions[line.fabric_type_id] || [] : [];
                    const availableColors = line.fabric_type_id ? colorOptions[line.fabric_type_id] || [] : [];
                    const availableWidths = line.fabric_type_id ? widthOptions[line.fabric_type_id] || [] : [];
                    return (
                      <tr key={line.id} className="border-b border-slate-100">
                        <td className="px-3 py-2 align-top">
                          <select
                            value={line.fabric_type_id}
                            onChange={(e) =>
                              updateLine(line.id, {
                                fabric_type_id: e.target.value,
                                gsm_option_id: "",
                                color_option_id: "",
                                width_option_id: "",
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                          >
                            <option value="">Select</option>
                            {fabricTypes.map((ft) => (
                              <option key={ft.id} value={ft.id}>
                                {ft.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select
                            value={line.color_option_id}
                            onChange={(e) => updateLine(line.id, { color_option_id: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                            disabled={!line.fabric_type_id}
                          >
                            <option value="">Select colour</option>
                            {availableColors.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.color_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select
                            value={line.gsm_option_id}
                            onChange={(e) => updateLine(line.id, { gsm_option_id: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                            disabled={!line.fabric_type_id}
                          >
                            <option value="">Select GSM</option>
                            {availableGsm.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.gsm}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select
                            value={line.width_option_id}
                            onChange={(e) => updateLine(line.id, { width_option_id: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                            disabled={!line.fabric_type_id}
                          >
                            <option value="">Select width</option>
                            {availableWidths.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.width_mm} mm
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={line.quantity_m}
                            onChange={(e) => updateLine(line.id, { quantity_m: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                            placeholder="Meters"
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="text"
                            value={line.notes}
                            onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                            placeholder="Optional"
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="text-xs md:text-sm text-red-600 hover:text-red-800 disabled:text-slate-300"
                            disabled={lines.length <= 1}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={isSubmitting}>
              Create Order
            </Button>
            <Link href="/toolbox/orders" className="text-sm text-slate-600 hover:text-slate-900">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}