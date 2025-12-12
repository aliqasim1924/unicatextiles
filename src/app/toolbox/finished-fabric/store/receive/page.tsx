"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

const LOCATION_STORE = "FINISHED_STORE";
const STATUS_IN_STORE = "IN_STORE";
const STATUS_AWAITING_RECEIPT = "AWAITING_RECEIPT";
const LOCATION_COATING = "COATING";

interface AvailableRoll {
  id: string;
  roll_no: string | null;
  length_m: number;
  grade: string | null;
  batch_no: string | null;
  color: string | null;
  gsm: number | null;
  coating_type: string | null;
}

export default function FinishedFabricStoreReceivePage() {
  const router = useRouter();
  const [availableRolls, setAvailableRolls] = useState<AvailableRoll[]>([]);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchAvailableRolls();
  }, []);

  async function fetchAvailableRolls() {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select(
          `
          id,
          roll_no,
          length_m,
          grade,
          color,
          gsm,
          coating_type,
          batch_id,
          status,
          current_location,
          coating_batches (
            batch_no
          )
        `
        )
        .eq("status", STATUS_AWAITING_RECEIPT)
        .eq("current_location", LOCATION_COATING)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const mapped: AvailableRoll[] =
        (data || []).map((row: any) => {
          const batch = Array.isArray(row.coating_batches)
            ? row.coating_batches[0]
            : row.coating_batches;
          return {
            id: row.id as string,
            roll_no: row.roll_no ?? null,
            length_m: Number(row.length_m || 0),
            grade: row.grade ?? null,
            batch_no: batch?.batch_no ?? null,
            color: row.color ?? null,
            gsm: row.gsm ? Number(row.gsm) : null,
            coating_type: row.coating_type ?? null,
          };
        }) || [];

      setAvailableRolls(mapped);
      setSelectedRollIds(new Set());
    } catch (err: any) {
      console.error("Failed to load rolls", err);
      const message = err?.message || JSON.stringify(err) || "Failed to load rolls.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  const selectedRolls = useMemo(
    () => availableRolls.filter((r) => selectedRollIds.has(r.id)),
    [availableRolls, selectedRollIds]
  );

  function toggleSelect(id: string) {
    setSelectedRollIds((prev) => {
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

    if (selectedRollIds.size === 0) {
      setError("Select at least one roll to receive.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabaseBrowserClient.auth.getUser();

      const { data: receipt, error: receiptError } = await supabaseBrowserClient
        .from("finished_fabric_store_receipts")
        .insert({
          received_by: userData?.user?.id || null,
          notes: notes || null,
        })
        .select("id, receipt_no")
        .single();

      if (receiptError) throw receiptError;

      const lineRows = selectedRolls.map((roll) => ({
        receipt_id: receipt.id,
        roll_id: roll.id,
        roll_no: roll.roll_no,
        length_m: roll.length_m,
        grade: roll.grade,
        color: roll.color,
        gsm: roll.gsm,
        coating_type: roll.coating_type,
      }));

      const { error: linesError } = await supabaseBrowserClient
        .from("finished_fabric_store_receipt_items")
        .insert(lineRows);
      if (linesError) throw linesError;

      // Update rolls status and location
      const { error: updateError, data: updateData } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .update({
          status: STATUS_IN_STORE,
          current_location: LOCATION_STORE,
          received_store_at: new Date().toISOString(),
          received_store_by: userData?.user?.id || null,
        })
        .in("id", Array.from(selectedRollIds))
        .select("id, roll_no, status, current_location");

      if (updateError) {
        console.error("Failed to update rolls:", updateError);
        setError(`Failed to update rolls: ${updateError.message || JSON.stringify(updateError)}`);
        return;
      }

      // Debug: Verify the update worked
      console.log("Post-receive roll check:", updateData);
      if (updateData && updateData.length > 0) {
        console.log("Updated rolls:", updateData.map((r: any) => ({
          id: r.id,
          roll_no: r.roll_no,
          status: r.status,
          current_location: r.current_location,
        })));
      }

      setSuccess("Store receipt created successfully. Redirecting...");
      
      // Redirect to receipt page, which will then allow user to go back to store
      router.push(`/toolbox/finished-fabric/store/receipts/${receipt.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create store receipt.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Receive into Finished Store</h1>
          <p className="mt-1 text-slate-600">
            Select completed rolls to receive into the Finished Goods Store.
          </p>
        </div>
        <BackButton href="/toolbox/finished-fabric/store" label="Back to Store" />
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

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="Optional notes for this receipt"
            />
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Eligible Rolls</h2>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={isSubmitting || availableRolls.length === 0}
            >
              Confirm Receipt (Receive Into Store)
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-600">Loading rolls...</p>
          ) : availableRolls.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
              <p className="text-slate-600">No rolls awaiting receipt.</p>
              <p className="mt-2 text-sm text-slate-500">
                Rolls will appear here after they are created during rolling/inspection.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedRollIds.size === availableRolls.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRollIds(new Set(availableRolls.map((r) => r.id)));
                          } else {
                            setSelectedRollIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Length (m)</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Batch</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Colour</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">GSM</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Coating</th>
                  </tr>
                </thead>
                <tbody>
                  {availableRolls.map((roll) => (
                    <tr key={roll.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedRollIds.has(roll.id)}
                          onChange={() => toggleSelect(roll.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {roll.roll_no || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{roll.length_m.toFixed(3)}</td>
                      <td className="px-4 py-3 text-slate-900">{roll.grade || "—"}</td>
                      <td className="px-4 py-3 text-slate-900">{roll.batch_no || "—"}</td>
                      <td className="px-4 py-3 text-slate-900">{roll.color || "—"}</td>
                      <td className="px-4 py-3 text-slate-900">{roll.gsm ? `${roll.gsm}` : "—"}</td>
                      <td className="px-4 py-3 text-slate-900">
                        {roll.coating_type || "—"}
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

