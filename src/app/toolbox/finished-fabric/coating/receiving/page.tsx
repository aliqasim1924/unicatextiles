"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

const LOCATION_COATING = "COATING";
const STATUS_IN_TRANSIT = "IN_TRANSIT";
const STATUS_READY_FOR_COATING = "READY_FOR_COATING";

interface CoatingRoll {
  id: string;
  qr_code: string | null;
  roll_no: string | null;
  length_m: number;
  cut_at: string;
  base_fabric_orders: {
    order_no: string | null;
    loom_no: string | null;
    base_fabric_items: {
      name: string | null;
    } | null;
  } | null;
}

export default function FinishedFabricCoatingReceivingPage() {
  const router = useRouter();
  const [rolls, setRolls] = useState<CoatingRoll[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [receiptDate, setReceiptDate] = useState<string>(() => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchRolls();
  }, []);

  async function fetchRolls() {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .select(
          `
          id,
          qr_code,
          roll_no,
          length_m,
          cut_at,
          base_fabric_orders:base_fabric_order_id (
            order_no,
            loom_no,
            base_fabric_items:base_fabric_item_id (
              name
            )
          )
        `
        )
        .eq("current_location", LOCATION_COATING)
        .eq("status", STATUS_IN_TRANSIT)
        .order("cut_at", { ascending: true });

      if (fetchError) throw fetchError;

      setRolls(
        (data || []).map((row: any) => ({
          ...row,
          base_fabric_orders: Array.isArray(row.base_fabric_orders)
            ? row.base_fabric_orders[0]
            : row.base_fabric_orders,
        })) as CoatingRoll[]
      );
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message || "Failed to load rolls.");
    } finally {
      setIsLoading(false);
    }
  }

  const selectedRolls = useMemo(
    () => rolls.filter((r) => selectedIds.has(r.id)),
    [rolls, selectedIds]
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (selectedIds.size === 0) {
      setError("Select at least one roll to receive.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabaseBrowserClient.auth.getUser();
      const receiptDateIso = receiptDate
        ? new Date(receiptDate).toISOString()
        : new Date().toISOString();

      const { data: receipt, error: receiptError } = await supabaseBrowserClient
        .from("base_fabric_coating_receipts")
        .insert({
          receipt_date: receiptDateIso,
          notes: notes || null,
          from_location: "WEAVING",
          to_location: "COATING",
          created_by: userData?.user?.id || null,
        })
        .select("id, slip_no")
        .single();

      if (receiptError) throw receiptError;

      const lines = selectedRolls.map((roll) => ({
        receipt_id: receipt.id,
        base_fabric_roll_id: roll.id,
        length_m: roll.length_m,
        notes: null,
      }));

      const { error: lineError } = await supabaseBrowserClient
        .from("base_fabric_coating_receipt_lines")
        .insert(lines);
      if (lineError) throw lineError;

      const { error: updateError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .update({
          current_location: LOCATION_COATING,
          status: STATUS_READY_FOR_COATING,
        })
        .in("id", Array.from(selectedIds));
      if (updateError) throw updateError;

      setSuccess("Coating receipt created successfully.");
      await fetchRolls();
      setNotes("");
      setSelectedIds(new Set());
      router.push(`/toolbox/finished-fabric/coating/receiving/${receipt.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create coating receipt.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Receive Base Fabric into Coating</h1>
          <p className="mt-1 text-slate-600">
            Confirm rolls that have arrived in the Coating department.
          </p>
        </div>
        <BackButton href="/toolbox/finished-fabric" label="Back to Finished Fabric" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {success}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Receipt Date</label>
              <input
                type="datetime-local"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Optional notes"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Rolls in Transit</h2>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={isSubmitting || rolls.length === 0}
            >
              Confirm Receipt
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-600">Loading rolls...</p>
          ) : rolls.length === 0 ? (
            <p className="text-sm text-slate-600">No rolls in transit to receive.</p>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === rolls.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(rolls.map((r) => r.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">QR</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Order</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Fabric</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Loom</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-900">Length (m)</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Cut Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rolls.map((roll) => (
                    <tr key={roll.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(roll.id)}
                          onChange={() => toggleSelect(roll.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        {roll.qr_code || roll.roll_no || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {roll.base_fabric_orders?.order_no || "N/A"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {roll.base_fabric_orders?.base_fabric_items?.name || "N/A"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {roll.base_fabric_orders?.loom_no || "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900 font-semibold">
                        {roll.length_m.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(roll.cut_at).toLocaleString("en-ZA", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </form>
      </motion.section>
    </div>
  );
}

