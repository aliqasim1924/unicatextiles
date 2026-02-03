"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { BackButton } from "@/components/navigation/BackButton";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";

const STATUS_ISSUED = "ISSUED";
const LOCATION_DISPATCHED = "DISPATCHED";
const STATUS_RETURNED = "RETURNED";
const LOCATION_RETURNED = "RETURNED";

const RETURN_REASONS = [
  { value: "", label: "— Select —" },
  { value: "Fault", label: "Fault" },
  { value: "Wrong colour", label: "Wrong colour" },
  { value: "Not required", label: "Not required" },
  { value: "Other", label: "Other" },
];

interface Customer {
  id: string;
  name: string;
}

interface IssuedRoll {
  id: string;
  roll_no: string | null;
  length_m: number;
  grade: string | null;
  color: string | null;
  coating_type: string | null;
  issue_ref: string;
}

export default function NewCustomerReturnPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [disposition, setDisposition] = useState<"CREDIT" | "REFUND" | "EXCHANGE">("CREDIT");
  const [pastelCreditNoteNo, setPastelCreditNoteNo] = useState("");
  const [reason, setReason] = useState("");
  const [reasonOther, setReasonOther] = useState("");
  const [notes, setNotes] = useState("");
  const [issuedRolls, setIssuedRolls] = useState<IssuedRoll[]>([]);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set());
  const [lengthOverrides, setLengthOverrides] = useState<Record<string, string>>({});
  const [gradeOverrides, setGradeOverrides] = useState<Record<string, string>>({});
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isLoadingRolls, setIsLoadingRolls] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (customerId) {
      fetchIssuedRollsForCustomer(customerId);
    } else {
      setIssuedRolls([]);
      setSelectedRollIds(new Set());
      setLengthOverrides({});
      setGradeOverrides({});
    }
  }, [customerId]);

  async function fetchCustomers() {
    try {
      setIsLoadingCustomers(true);
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("customers")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (fetchError) throw fetchError;
      setCustomers((data as Customer[]) || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load customers.");
    } finally {
      setIsLoadingCustomers(false);
    }
  }

  async function fetchIssuedRollsForCustomer(custId: string) {
    setIsLoadingRolls(true);
    setError(null);
    try {
      const { data: ordersData, error: ordersError } = await supabaseBrowserClient
        .from("customer_orders")
        .select("id")
        .eq("customer_id", custId);

      if (ordersError) throw ordersError;
      const orderIds = (ordersData as any[])?.map((o) => o.id) ?? [];
      if (orderIds.length === 0) {
        setIssuedRolls([]);
        return;
      }

      const { data: issuesData, error: issuesError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .select("id, issue_no, order_id")
        .eq("destination", "CUSTOMER")
        .in("order_id", orderIds);

      if (issuesError) throw issuesError;
      const issues = (issuesData as any[]) ?? [];
      if (issues.length === 0) {
        setIssuedRolls([]);
        return;
      }

      const issueIds = issues.map((i) => i.id);
      const issueNoById: Record<string, number> = {};
      issues.forEach((i: any) => {
        issueNoById[i.id] = i.issue_no ?? 0;
      });

      const { data: itemsData, error: itemsError } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_items")
        .select("issue_id, roll_id, length_m, grade")
        .in("issue_id", issueIds);

      if (itemsError) throw itemsError;
      const items = (itemsData as any[]) ?? [];
      const rollIds = [...new Set(items.map((i: any) => i.roll_id))];
      if (rollIds.length === 0) {
        setIssuedRolls([]);
        return;
      }

      const { data: rollsData, error: rollsError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select("id, roll_no, length_m, grade, color, coating_type, status, current_location")
        .in("id", rollIds)
        .eq("status", STATUS_ISSUED)
        .eq("current_location", LOCATION_DISPATCHED);

      if (rollsError) throw rollsError;
      const rolls = (rollsData as any[]) ?? [];
      const itemByRollId: Record<string, { length_m: number; grade: string | null; issue_id: string }> = {};
      items.forEach((item: any) => {
        if (!itemByRollId[item.roll_id]) {
          const issue = issues.find((i: any) => i.id === item.issue_id);
          itemByRollId[item.roll_id] = {
            length_m: Number(item.length_m ?? 0),
            grade: item.grade ?? null,
            issue_id: item.issue_id,
          };
        }
      });

      const rollList: IssuedRoll[] = rolls.map((r: any) => {
        const ref = itemByRollId[r.id];
        const issueNo = ref ? issueNoById[ref.issue_id] : null;
        return {
          id: r.id,
          roll_no: r.roll_no ?? null,
          length_m: ref?.length_m ?? Number(r.length_m ?? 0),
          grade: ref?.grade ?? r.grade ?? null,
          color: r.color ?? null,
          coating_type: r.coating_type ?? null,
          issue_ref: issueNo != null ? `FFSI-${String(issueNo).padStart(6, "0")}` : "—",
        };
      });
      setIssuedRolls(rollList);
      setSelectedRollIds(new Set());
      setLengthOverrides({});
      setGradeOverrides({});
    } catch (err: any) {
      console.error("Failed to load issued rolls", err);
      setError(err?.message || "Failed to load issued rolls for customer.");
    } finally {
      setIsLoadingRolls(false);
    }
  }

  function toggleRoll(id: string) {
    setSelectedRollIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setLength(rollId: string, value: string) {
    setLengthOverrides((prev) => ({ ...prev, [rollId]: value }));
  }
  function setGrade(rollId: string, value: string) {
    setGradeOverrides((prev) => ({ ...prev, [rollId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!customerId) {
      setError("Select a customer.");
      return;
    }
    const reasonText = reason === "Other" ? reasonOther.trim() : reason;
    if (!reasonText) {
      setError("Select or enter a return reason.");
      return;
    }
    if (selectedRollIds.size === 0) {
      setError("Select at least one roll being returned.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabaseBrowserClient.auth.getUser();

      let exchangeSlipNo: string | null = null;
      if (disposition === "EXCHANGE") {
        const { count, error: countErr } = await supabaseBrowserClient
          .from("customer_returns")
          .select("id", { count: "exact", head: true })
          .eq("disposition", "EXCHANGE");
        if (!countErr) {
          const nextNum = ((count ?? 0) + 1);
          exchangeSlipNo = `FEX-${String(nextNum).padStart(6, "0")}`;
        } else {
          exchangeSlipNo = "FEX-000001";
        }
      }

      const { data: returnRow, error: insertError } = await supabaseBrowserClient
        .from("customer_returns")
        .insert({
          returned_by: userData?.user?.id ?? null,
          customer_id: customerId,
          disposition,
          pastel_credit_note_no: disposition !== "EXCHANGE" ? (pastelCreditNoteNo.trim() || null) : null,
          reason: reasonText,
          notes: notes.trim() || null,
          exchange_slip_no: exchangeSlipNo,
        })
        .select("id, exchange_slip_no")
        .single();

      if (insertError) throw insertError;

      const lines = Array.from(selectedRollIds).map((rollId) => {
        const roll = issuedRolls.find((r) => r.id === rollId);
        const lenStr = lengthOverrides[rollId];
        const gradeStr = gradeOverrides[rollId];
        const length_m =
          lenStr !== undefined && lenStr !== "" && !Number.isNaN(Number(lenStr))
            ? Number(lenStr)
            : roll?.length_m ?? null;
        const grade = gradeStr !== undefined && gradeStr !== "" ? gradeStr : roll?.grade ?? null;
        return {
          return_id: returnRow!.id,
          roll_id: rollId,
          length_m,
          grade: grade || null,
          notes: null,
        };
      });

      const { error: linesError } = await supabaseBrowserClient
        .from("customer_return_lines")
        .insert(lines);
      if (linesError) throw linesError;

      const { error: updateError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .update({
          status: STATUS_RETURNED,
          current_location: LOCATION_RETURNED,
        })
        .in("id", Array.from(selectedRollIds));
      if (updateError) throw updateError;

      if (disposition === "EXCHANGE") {
        setSuccess(
          `Exchange return recorded. Exchange slip: ${(returnRow as any)?.exchange_slip_no ?? "FEX"}. Issue replacement rolls via Issue from Store using this reference.`
        );
        router.push(`/toolbox/orders/returns/${returnRow!.id}`);
      } else {
        setSuccess("Return recorded. Rolls marked as returned.");
        router.push(`/toolbox/orders/returns?created=${returnRow!.id}`);
      }
    } catch (err: any) {
      console.error("Failed to create return", err);
      setError(err?.message || "Failed to create return.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Record Customer Return</h1>
          <p className="mt-1 text-slate-600">
            Record finished fabric returned by a customer (credit, refund, or exchange). For exchange, issue replacement rolls via Issue from Store using the exchange slip reference.
          </p>
        </div>
        <BackButton href="/toolbox/orders/returns" label="Back to Returns" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Customer <span className="text-red-600">*</span>
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                required
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Disposition <span className="text-red-600">*</span>
              </label>
              <select
                value={disposition}
                onChange={(e) => setDisposition(e.target.value as "CREDIT" | "REFUND" | "EXCHANGE")}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              >
                <option value="CREDIT">Credit</option>
                <option value="REFUND">Refund</option>
                <option value="EXCHANGE">Exchange</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Pastel credit note no
              </label>
              <input
                type="text"
                value={pastelCreditNoteNo}
                onChange={(e) => setPastelCreditNoteNo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                placeholder="e.g. CN-2026-001"
                disabled={disposition === "EXCHANGE"}
              />
              {disposition === "EXCHANGE" && (
                <p className="mt-1 text-xs text-slate-500">Not used for exchange; use exchange slip reference when issuing replacement.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Return reason <span className="text-red-600">*</span>
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                required
              >
                {RETURN_REASONS.map((r) => (
                  <option key={r.value || "empty"} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            {reason === "Other" && (
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Reason (free text) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={reasonOther}
                  onChange={(e) => setReasonOther(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  placeholder="Describe reason"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              placeholder="Optional notes"
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Select rolls being returned <span className="text-red-600">*</span>
            </h3>
            {!customerId ? (
              <p className="text-sm text-slate-500">Select a customer to load issued rolls.</p>
            ) : isLoadingRolls ? (
              <p className="text-sm text-slate-600">Loading issued rolls...</p>
            ) : issuedRolls.length === 0 ? (
              <p className="text-sm text-slate-600">
                No issued rolls found for this customer (or all have already been returned).
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-900 w-8"></th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">Roll No</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">Issue</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">Colour / Coating</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-900">Length (m)</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issuedRolls.map((roll) => (
                      <tr
                        key={roll.id}
                        className={`border-b border-slate-100 ${selectedRollIds.has(roll.id) ? "bg-teal-50" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedRollIds.has(roll.id)}
                            onChange={() => toggleRoll(roll.id)}
                            className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">{roll.roll_no ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{roll.issue_ref}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {roll.color ?? "—"} / {roll.coating_type ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={lengthOverrides[roll.id] ?? roll.length_m}
                            onChange={(e) => setLength(roll.id, e.target.value)}
                            className="w-20 rounded border border-slate-200 px-2 py-1 text-right text-sm"
                            disabled={!selectedRollIds.has(roll.id)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={gradeOverrides[roll.id] ?? roll.grade ?? ""}
                            onChange={(e) => setGrade(roll.id, e.target.value)}
                            className="w-16 rounded border border-slate-200 px-2 py-1 text-sm"
                            placeholder="A/B/C"
                            disabled={!selectedRollIds.has(roll.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button type="submit" variant="primary" disabled={isSubmitting || selectedRollIds.size === 0}>
              {isSubmitting ? "Saving..." : "Save Return"}
            </Button>
            <Link href="/toolbox/orders/returns">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
          </div>
        </form>
      </motion.section>
    </div>
  );
}
