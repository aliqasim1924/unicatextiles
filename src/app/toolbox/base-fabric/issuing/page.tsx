"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

const LOCATION_WEAVING = "WEAVING";
const LOCATION_COATING = "COATING";
const STATUS_AVAILABLE = "AVAILABLE";
const STATUS_IN_TRANSIT = "IN_TRANSIT";

interface AvailableRoll {
  id: string;
  qr_code: string | null;
  roll_no: string | null;
  length_m: number;
  cut_at: string;
  order_no: string | null;
  loom_no: string | null;
  fabric_name: string | null;
}

export default function BaseFabricIssuingPage() {
  const router = useRouter();
  const [availableRolls, setAvailableRolls] = useState<AvailableRoll[]>([]);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set());
  const [issueDate, setIssueDate] = useState<string>(() => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdSlipNo, setCreatedSlipNo] = useState<string | null>(null);
  const [recentSlips, setRecentSlips] = useState<
    { id: string; slip_no: string | null; issue_date: string; from_location: string; to_location: string }[]
  >([]);

  useEffect(() => {
    fetchAvailableRolls();
    fetchRecentSlips();
  }, []);

  async function fetchAvailableRolls() {
    try {
      setIsLoading(true);
      setError(null);
      console.log("Fetching available rolls with filters:", {
        current_location: LOCATION_WEAVING,
        status: STATUS_AVAILABLE,
      });
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .select(
          `
          id,
          qr_code,
          roll_no,
          length_m,
          cut_at,
          current_location,
          status,
          base_fabric_orders:base_fabric_order_id (
            order_no,
            loom_no,
            base_fabric_items:base_fabric_item_id (
              name
            )
          )
        `
        )
        .eq("current_location", LOCATION_WEAVING)
        .eq("status", STATUS_AVAILABLE)
        .order("cut_at", { ascending: false });

      console.log("Available rolls result:", data, "error:", fetchError);
      if (fetchError) throw fetchError;

      const mapped =
        (data || []).map((row: any) => {
          const order = Array.isArray(row.base_fabric_orders)
            ? row.base_fabric_orders[0]
            : row.base_fabric_orders;
          const item = order?.base_fabric_items
            ? Array.isArray(order.base_fabric_items)
              ? order.base_fabric_items[0]
              : order.base_fabric_items
            : null;
          return {
            id: row.id as string,
            qr_code: row.qr_code ?? null,
            roll_no: row.roll_no ?? null,
            length_m: row.length_m,
            cut_at: row.cut_at,
            order_no: order?.order_no ?? null,
            loom_no: order?.loom_no ?? null,
            fabric_name: item?.name ?? null,
          } as AvailableRoll;
        }) || [];

      setAvailableRolls(mapped);
      setSelectedRollIds(new Set());
    } catch (err: any) {
      setError(err.message || "Failed to load rolls.");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchRecentSlips() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("base_fabric_issue_slips")
        .select("id, slip_no, issue_date, from_location, to_location")
        .order("issue_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      setRecentSlips((data as any[]) || []);
    } catch (err) {
      console.error("Error fetching recent slips:", err);
    }
  }

  function toggleSelect(id: string) {
    setSelectedRollIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedRolls = useMemo(
    () => availableRolls.filter((r) => selectedRollIds.has(r.id)),
    [availableRolls, selectedRollIds]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreatedSlipNo(null);

    if (selectedRollIds.size === 0) {
      setError("Select at least one roll to issue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabaseBrowserClient.auth.getUser();
      const issueDateIso = issueDate ? new Date(issueDate).toISOString() : new Date().toISOString();

      const { data: slip, error: slipError } = await supabaseBrowserClient
        .from("base_fabric_issue_slips")
        .insert({
          issue_date: issueDateIso,
          notes: notes || null,
          from_location: "WEAVING",
          to_location: "COATING",
          created_by: userData?.user?.id || null,
        })
        .select("id, slip_no")
        .single();

      if (slipError) throw slipError;

      const lines = selectedRolls.map((roll) => ({
        slip_id: slip.id,
        base_fabric_roll_id: roll.id,
        length_m: roll.length_m,
        notes: null,
      }));

      const { error: lineError } = await supabaseBrowserClient
        .from("base_fabric_issue_lines")
        .insert(lines);
      if (lineError) throw lineError;

      console.log("Updating rolls to COATING/IN_TRANSIT", Array.from(selectedRollIds));
      const { error: updateError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .update({
          current_location: LOCATION_COATING,
          status: STATUS_IN_TRANSIT,
        })
        .in("id", Array.from(selectedRollIds));
      console.log("Update error:", updateError);
      if (updateError) throw updateError;

      setSuccess("Issue slip created successfully.");
      setCreatedSlipNo(slip.slip_no || "N/A");
      await Promise.all([fetchAvailableRolls(), fetchRecentSlips()]);
      setNotes("");
      setSelectedRollIds(new Set());
      router.push(`/toolbox/base-fabric/issuing/${slip.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create issue slip.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Issue Base Fabric to Coating</h1>
          <p className="mt-1 text-slate-600">
            Select rolls from weaving to issue to the Coating department.
          </p>
        </div>
        <BackButton href="/toolbox/base-fabric/orders" label="Back to Orders" />
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
              <div className="font-semibold">Issue recorded.</div>
              {createdSlipNo && <div>Slip No: {createdSlipNo}</div>}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Issue Date</label>
              <input
                type="datetime-local"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
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
            <h2 className="text-lg font-semibold text-slate-900">Available Rolls</h2>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={isSubmitting || availableRolls.length === 0}
            >
              Create Issue Slip
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-600">Loading rolls...</p>
          ) : availableRolls.length === 0 ? (
            <p className="text-sm text-slate-600">No available rolls in Weaving.</p>
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
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">QR</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Order</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Fabric</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Loom</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-900">Length (m)</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Cut Time</th>
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
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        {roll.qr_code || roll.roll_no || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{roll.order_no || "N/A"}</td>
                      <td className="px-4 py-3 text-slate-700">{roll.fabric_name || "N/A"}</td>
                      <td className="px-4 py-3 text-slate-700">{roll.loom_no || "-"}</td>
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

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Recent Issue Slips</h2>
          <p className="text-sm text-slate-500">Latest 5 slips</p>
        </div>
        {recentSlips.length === 0 ? (
          <p className="text-sm text-slate-600">No slips yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Slip No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">From → To</th>
                </tr>
              </thead>
              <tbody>
                {recentSlips.map((slip) => (
                  <tr
                    key={slip.id}
                    onClick={() => router.push(`/toolbox/base-fabric/issuing/${slip.id}`)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-900 font-semibold">
                      {slip.slip_no || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(slip.issue_date).toLocaleString("en-ZA")}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {slip.from_location || "-"} → {slip.to_location || "-"}
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

