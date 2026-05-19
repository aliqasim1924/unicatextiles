"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { generateQRCode } from "@/lib/qr/generateQRCode";

const LOCATION_STORE = "FINISHED_STORE";
const STATUS_IN_STORE = "IN_STORE";

interface FabricTypeOption {
  id: string;
  code: string;
  name: string;
}

interface ColorOption {
  id: string;
  fabric_type_id: string;
  color_name: string;
}

interface GsmOption {
  id: string;
  fabric_type_id: string;
  gsm: number;
}

interface WidthOption {
  id: string;
  fabric_type_id: string;
  width_mm: number;
}

interface RollRow {
  id: string;
  roll_no: string;
  length_m: string;
  grade: string;
}

interface LineItem {
  id: string;
  fabric_type_id: string;
  color_option_id: string;
  gsm_option_id: string;
  width_option_id: string;
  cost_per_m_zar: string;
  rolls: RollRow[];
}

function emptyLineItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    fabric_type_id: "",
    color_option_id: "",
    gsm_option_id: "",
    width_option_id: "",
    cost_per_m_zar: "",
    rolls: [{ id: crypto.randomUUID(), roll_no: "", length_m: "", grade: "A" }],
  };
}

export default function NewPurchasedFinishedFabricPage() {
  const router = useRouter();
  const [fabricTypes, setFabricTypes] = useState<FabricTypeOption[]>([]);
  const [colorOptions, setColorOptions] = useState<Record<string, ColorOption[]>>({});
  const [gsmOptions, setGsmOptions] = useState<Record<string, GsmOption[]>>({});
  const [widthOptions, setWidthOptions] = useState<Record<string, WidthOption[]>>({});
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [purchasedFrom, setPurchasedFrom] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCatalog();
  }, []);

  async function fetchCatalog() {
    try {
      setIsLoading(true);
      const [
        { data: typesData, error: typesError },
        { data: colorData, error: colorError },
        { data: gsmData, error: gsmError },
        { data: widthData, error: widthError },
      ] = await Promise.all([
        supabaseBrowserClient
          .from("fabric_types")
          .select("id, code, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabaseBrowserClient
          .from("fabric_type_color_options")
          .select("id, fabric_type_id, color_name")
          .eq("is_active", true)
          .order("color_name", { ascending: true }),
        supabaseBrowserClient
          .from("fabric_type_gsm_options")
          .select("id, fabric_type_id, gsm")
          .eq("is_active", true)
          .order("gsm", { ascending: true }),
        supabaseBrowserClient
          .from("fabric_type_width_options")
          .select("id, fabric_type_id, width_mm")
          .eq("is_active", true)
          .order("width_mm", { ascending: true }),
      ]);

      if (typesError) throw typesError;
      if (colorError) throw colorError;
      if (gsmError) throw gsmError;
      if (widthError) throw widthError;

      setFabricTypes((typesData as FabricTypeOption[]) || []);

      const colorMap: Record<string, ColorOption[]> = {};
      (colorData || []).forEach((opt: ColorOption) => {
        if (!colorMap[opt.fabric_type_id]) colorMap[opt.fabric_type_id] = [];
        colorMap[opt.fabric_type_id].push(opt);
      });
      setColorOptions(colorMap);

      const gsmMap: Record<string, GsmOption[]> = {};
      (gsmData || []).forEach((opt: GsmOption) => {
        if (!gsmMap[opt.fabric_type_id]) gsmMap[opt.fabric_type_id] = [];
        gsmMap[opt.fabric_type_id].push(opt);
      });
      setGsmOptions(gsmMap);

      const widthMap: Record<string, WidthOption[]> = {};
      (widthData || []).forEach((opt: WidthOption) => {
        if (!widthMap[opt.fabric_type_id]) widthMap[opt.fabric_type_id] = [];
        widthMap[opt.fabric_type_id].push(opt);
      });
      setWidthOptions(widthMap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load fabric catalog.");
    } finally {
      setIsLoading(false);
    }
  }

  const fabricTypeName = useMemo(() => {
    const map: Record<string, string> = {};
    fabricTypes.forEach((t) => {
      map[t.id] = t.name;
    });
    return map;
  }, [fabricTypes]);

  function addLineItem() {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  }

  function removeLineItem(lineId: string) {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((li) => li.id !== lineId));
  }

  function updateLineItem(lineId: string, field: keyof Omit<LineItem, "id" | "rolls">, value: string) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.id !== lineId) return li;
        const next = { ...li, [field]: value };
        if (field === "fabric_type_id") {
          next.color_option_id = "";
          next.gsm_option_id = "";
          next.width_option_id = "";
        }
        return next;
      }),
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
                { id: crypto.randomUUID(), roll_no: "", length_m: "", grade: "A" },
              ],
            }
          : li,
      ),
    );
  }

  function removeRoll(lineId: string, rollId: string) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.id !== lineId) return li;
        if (li.rolls.length <= 1) return li;
        return { ...li, rolls: li.rolls.filter((r) => r.id !== rollId) };
      }),
    );
  }

  function updateRoll(
    lineId: string,
    rollId: string,
    field: keyof RollRow,
    value: string,
  ) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.id !== lineId) return li;
        return {
          ...li,
          rolls: li.rolls.map((r) => (r.id === rollId ? { ...r, [field]: value } : r)),
        };
      }),
    );
  }

  function resolveLineSpec(li: LineItem) {
    const type = fabricTypes.find((t) => t.id === li.fabric_type_id);
    const color = (colorOptions[li.fabric_type_id] || []).find((c) => c.id === li.color_option_id);
    const gsm = (gsmOptions[li.fabric_type_id] || []).find((g) => g.id === li.gsm_option_id);
    const width = (widthOptions[li.fabric_type_id] || []).find((w) => w.id === li.width_option_id);
    return { type, color, gsm, width };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!purchasedFrom.trim()) {
      setError("Supplier / purchased from is required.");
      return;
    }

    const validLines: Array<{
      li: LineItem;
      costPerM: number | null;
      validRolls: RollRow[];
      spec: ReturnType<typeof resolveLineSpec>;
    }> = [];

    for (const li of lineItems) {
      if (!li.fabric_type_id) continue;

      const spec = resolveLineSpec(li);
      if (!spec.type || !spec.color || !spec.gsm || !spec.width) {
        setError(
          `Line "${fabricTypeName[li.fabric_type_id] ?? "item"}": select colour, GSM, and width.`,
        );
        return;
      }

      const costPerM = li.cost_per_m_zar.trim() ? parseFloat(li.cost_per_m_zar) : null;
      if (costPerM != null && (isNaN(costPerM) || costPerM < 0)) {
        setError(`Cost per metre must be a non-negative number for "${spec.type.name}".`);
        return;
      }

      const validRolls = li.rolls.filter(
        (r) =>
          r.length_m.trim() !== "" &&
          !isNaN(parseFloat(r.length_m)) &&
          parseFloat(r.length_m) > 0,
      );
      if (validRolls.length === 0) continue;

      validLines.push({ li, costPerM, validRolls, spec });
    }

    if (validLines.length === 0) {
      setError(
        "Add at least one line item with fabric, colour, GSM, width, and at least one roll with length.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabaseBrowserClient.auth.getUser();
      const nowIso = new Date().toISOString();

      const { data: purchase, error: purchaseError } = await supabaseBrowserClient
        .from("finished_fabric_outsource_purchases")
        .insert({
          invoice_no: invoiceNo.trim() || null,
          invoice_date: invoiceDate || null,
          purchased_from: purchasedFrom.trim(),
          notes: notes.trim() || null,
          created_by: userData?.user?.id || null,
        })
        .select("id")
        .single();

      if (purchaseError) throw purchaseError;

      let sortOrder = 0;
      for (const { li, costPerM, validRolls, spec } of validLines) {
        const { data: lineData, error: lineError } = await supabaseBrowserClient
          .from("finished_fabric_outsource_purchase_lines")
          .insert({
            purchase_id: purchase.id,
            fabric_type_id: li.fabric_type_id,
            color_option_id: li.color_option_id,
            gsm_option_id: li.gsm_option_id,
            width_option_id: li.width_option_id,
            cost_per_m_zar: costPerM,
            sort_order: sortOrder++,
          })
          .select("id")
          .single();

        if (lineError) throw lineError;

        const rollNotes = [
          "Purchased (outsourced) finished fabric.",
          purchasedFrom.trim() ? `Supplier: ${purchasedFrom.trim()}` : null,
          invoiceNo.trim() ? `Invoice: ${invoiceNo.trim()}` : null,
        ]
          .filter(Boolean)
          .join(" ");

        for (const r of validRolls) {
          const { error: rollError } = await supabaseBrowserClient
            .from("finished_fabric_rolls")
            .insert({
              batch_id: null,
              roll_no: r.roll_no.trim() || null,
              length_m: parseFloat(r.length_m),
              grade: r.grade.trim() || "A",
              gsm: spec.gsm!.gsm,
              color: spec.color!.color_name,
              fabric_type_id: spec.type!.id,
              gsm_option_id: spec.gsm!.id,
              color_option_id: spec.color!.id,
              width_option_id: spec.width!.id,
              coating_type: spec.type!.code || spec.type!.name,
              notes: rollNotes,
              qr_code: generateQRCode("finished_fabric"),
              is_outsourced: true,
              outsource_purchase_line_id: lineData.id,
              purchased_cost_per_m_zar: costPerM,
              current_location: LOCATION_STORE,
              status: STATUS_IN_STORE,
              received_store_at: nowIso,
              received_store_by: userData?.user?.id || null,
            });

          if (rollError) throw rollError;
        }
      }

      router.push(`/toolbox/finished-fabric/purchased/${purchase.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record purchased finished fabric.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600">Loading fabric catalog...</p>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="grid gap-8"
    >
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <h1 className="text-3xl font-semibold text-slate-900">
              Record Purchased (Outsourced) Finished Fabric
            </h1>
            <p className="mt-1 text-slate-600">
              Enter invoice details and line items (fabric spec, cost per metre, rolls). Rolls go
              directly into the finished store.
            </p>
          </motion.div>
          <Link
            href="/toolbox/finished-fabric"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            ← Back to Finished Fabric
          </Link>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <form onSubmit={handleSubmit} className="grid gap-8">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Invoice (shared)</h3>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Invoice Number
                </label>
                <input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  placeholder="e.g. INV-2026-001"
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.25 }}
              >
                <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                className="sm:col-span-2"
              >
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Supplier / Purchased From *
                </label>
                <input
                  value={purchasedFrom}
                  onChange={(e) => setPurchasedFrom(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  placeholder="e.g. Cape Coaters"
                />
              </motion.div>
            </motion.div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                placeholder="Optional notes for this purchase"
              />
            </div>
          </div>

          <div>
            <motion.div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Line items (fabric + cost + rolls)
              </h3>
              <Button type="button" variant="secondary" onClick={addLineItem}>
                Add line item
              </Button>
            </motion.div>

            {lineItems.map((li, idx) => {
              const colors = colorOptions[li.fabric_type_id] || [];
              const gsms = gsmOptions[li.fabric_type_id] || [];
              const widths = widthOptions[li.fabric_type_id] || [];

              return (
                <div
                  key={li.id}
                  className="mb-6 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 * idx }}
                    className="flex items-center justify-between mb-3"
                  >
                    <span className="text-sm font-medium text-slate-700">Line item {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeLineItem(li.id)}
                      disabled={lineItems.length <= 1}
                      className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Remove line
                    </button>
                  </motion.div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Fabric Type *
                      </label>
                      <select
                        value={li.fabric_type_id}
                        onChange={(e) =>
                          updateLineItem(li.id, "fabric_type_id", e.target.value)
                        }
                        className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                      >
                        <option value="">Select fabric</option>
                        {fabricTypes.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Colour *
                      </label>
                      <select
                        value={li.color_option_id}
                        onChange={(e) =>
                          updateLineItem(li.id, "color_option_id", e.target.value)
                        }
                        disabled={!li.fabric_type_id}
                        className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 disabled:bg-slate-100"
                      >
                        <option value="">Select colour</option>
                        {colors.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.color_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">GSM *</label>
                      <select
                        value={li.gsm_option_id}
                        onChange={(e) => updateLineItem(li.id, "gsm_option_id", e.target.value)}
                        disabled={!li.fabric_type_id}
                        className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 disabled:bg-slate-100"
                      >
                        <option value="">Select GSM</option>
                        {gsms.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.gsm}
                          </option>
                        ))}
                      </select>
                    </div>
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.35 }}
                    >
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Width *
                      </label>
                      <select
                        value={li.width_option_id}
                        onChange={(e) =>
                          updateLineItem(li.id, "width_option_id", e.target.value)
                        }
                        disabled={!li.fabric_type_id}
                        className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 disabled:bg-slate-100"
                      >
                        <option value="">Select width</option>
                        {widths.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.width_mm} mm
                          </option>
                        ))}
                      </select>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.4 }}
                    >
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Cost per Metre (ZAR)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={li.cost_per_m_zar}
                        onChange={(e) =>
                          updateLineItem(li.id, "cost_per_m_zar", e.target.value)
                        }
                        className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                        placeholder="e.g. 12.50"
                      />
                    </motion.div>
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
                    <p className="text-xs text-slate-500 mb-2">
                      Leave roll number blank to auto-assign (FFR-…). Supplier roll numbers can be
                      entered if known.
                    </p>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200">
                            <th className="px-3 py-2 text-left font-semibold text-slate-900">
                              Roll No (optional)
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-900">
                              Length (m)
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-900">
                              Grade
                            </th>
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
                                  placeholder="Supplier ref or blank"
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
                                  placeholder="e.g. 50"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={r.grade}
                                  onChange={(e) =>
                                    updateRoll(li.id, r.id, "grade", e.target.value)
                                  }
                                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                                >
                                  {["A", "B", "C", "D"].map((g) => (
                                    <option key={g} value={g}>
                                      {g}
                                    </option>
                                  ))}
                                </select>
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
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record Purchased Finished Fabric"}
            </Button>
          </div>
        </form>
      </motion.section>
    </motion.div>
  );
}
