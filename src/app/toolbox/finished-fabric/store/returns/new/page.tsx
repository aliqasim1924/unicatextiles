"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

const LOCATION_STORE = "FINISHED_STORE";
const STATUS_IN_STORE = "IN_STORE";
const LOCATION_DISPATCHED = "DISPATCHED";
const STATUS_ISSUED = "ISSUED";

interface IssueOption {
  id: string;
  issue_no: number | null;
  issue_time: string;
  destination: string | null;
  reference: string | null;
  notes: string | null;
  order_ref: string | null;
  customer_name: string | null;
}

interface IssueItemRow {
  id: string;
  roll_id: string;
  roll_no: string | null;
  length_m: number | null;
  grade: string | null;
  color: string | null;
}

interface IssueDetail {
  id: string;
  issue_no: number | null;
  issue_time: string;
  destination: string | null;
  reference: string | null;
  notes: string | null;
  items: IssueItemRow[];
}

export default function NewFinishedFabricIssueReturnPage() {
  const router = useRouter();

  const [issueSlipSearch, setIssueSlipSearch] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [issueDetail, setIssueDetail] = useState<IssueDetail | null>(null);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const [isLoadingIssueSearch, setIsLoadingIssueSearch] = useState(false);
  const [isLoadingIssueDetail, setIsLoadingIssueDetail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedIssueId) {
      setIssueDetail(null);
      setSelectedRollIds(new Set());
      return;
    }
    fetchIssueDetail(selectedIssueId);
  }, [selectedIssueId]);

  function formatIssueNo(issueNo: number | null) {
    if (issueNo === null || issueNo === undefined) return "N/A";
    return `FFSI-${String(issueNo).padStart(6, "0")}`;
  }

  function formatDate(dateString?: string | null) {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  }

  function parseIssueNo(input: string): number | null {
    const trimmed = (input || "").trim().toUpperCase();
    if (!trimmed) return null;
    const match = trimmed.match(/(\d+)/);
    if (!match) return null;
    const num = Number(match[1]);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.floor(num);
  }

  async function handleSearchIssueSlip(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    const issueNo = parseIssueNo(issueSlipSearch);
    if (!issueNo) {
      setError("Enter a valid issue slip number (e.g. FFSI-000123 or 123).");
      return;
    }

    // Reset current selection while searching
    setSelectedIssueId("");
    setIssueDetail(null);
    setSelectedRollIds(new Set());

    setIsLoadingIssueSearch(true);
    try {
      // Find issue by number (take most recent if duplicates exist)
      const { data: rows, error: findError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .select("id, issue_no, issue_time, destination, reference, notes")
        .eq("issue_no", issueNo)
        .order("issue_time", { ascending: false })
        .limit(1);

      if (findError) throw findError;
      const found = (rows || [])[0];
      if (!found?.id) {
        setError(`Issue slip not found for number ${formatIssueNo(issueNo)}.`);
        return;
      }

      setSelectedIssueId(found.id);
    } catch (err: any) {
      console.error("Failed to search issue slip", err);
      setError(err?.message || "Failed to search issue slip.");
    } finally {
      setIsLoadingIssueSearch(false);
    }
  }

  async function fetchIssueDetail(issueId: string) {
    setIsLoadingIssueDetail(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .select(
          `
          id,
          issue_no,
          issue_time,
          destination,
          reference,
          notes,
          finished_fabric_store_issue_items (
            id,
            roll_id,
            roll_no,
            length_m,
            grade,
            finished_fabric_rolls:roll_id (
              color
            )
          )
        `,
        )
        .eq("id", issueId)
        .single();

      if (fetchError) throw fetchError;

      const items: IssueItemRow[] =
        (data.finished_fabric_store_issue_items || []).map((item: any) => ({
          id: item.id,
          roll_id: item.roll_id,
          roll_no: item.roll_no ?? null,
          length_m: item.length_m !== null ? Number(item.length_m) : null,
          grade: item.grade ?? null,
          color:
            (Array.isArray(item.finished_fabric_rolls)
              ? item.finished_fabric_rolls[0]
              : item.finished_fabric_rolls)?.color ?? null,
        })) || [];

      const detail: IssueDetail = {
        id: data.id,
        issue_no: data.issue_no ?? null,
        issue_time: data.issue_time,
        destination: data.destination ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        items,
      };

      setIssueDetail(detail);
      setSelectedRollIds(new Set(items.map((i) => i.roll_id)));
    } catch (err: any) {
      console.error("Failed to load issue detail", err);
      setError(err?.message || "Failed to load selected issue slip.");
      setIssueDetail(null);
      setSelectedRollIds(new Set());
    } finally {
      setIsLoadingIssueDetail(false);
    }
  }

  const selectedItems = useMemo(() => {
    const items = issueDetail?.items || [];
    return items.filter((i) => selectedRollIds.has(i.roll_id));
  }, [issueDetail, selectedRollIds]);

  const selectedMetersTotal = useMemo(() => {
    return selectedItems.reduce((sum, i) => sum + Number(i.length_m || 0), 0);
  }, [selectedItems]);

  function toggleRoll(rollId: string) {
    setSelectedRollIds((prev) => {
      const next = new Set(prev);
      if (next.has(rollId)) next.delete(rollId);
      else next.add(rollId);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedIssueId) {
      setError("Please select an issue slip.");
      return;
    }
    if (!issueDetail) {
      setError("Issue slip details are not loaded yet.");
      return;
    }
    if (selectedRollIds.size === 0) {
      setError("Select at least one roll to return.");
      return;
    }
    if (!reason.trim()) {
      setError("Please enter a reason for this return.");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const { data: userData } = await supabaseBrowserClient.auth.getUser();
      const rollIds = Array.from(selectedRollIds);

      // Safety check: rolls must still be in issued/dispatched state.
      const { data: rollCheck, error: rollCheckError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select("id, roll_no, status, current_location")
        .in("id", rollIds);

      if (rollCheckError) throw rollCheckError;

      const notIssued = (rollCheck || []).filter(
        (r: any) => r.status !== STATUS_ISSUED || r.current_location !== LOCATION_DISPATCHED,
      );
      if (notIssued.length > 0) {
        const list = notIssued
          .map((r: any) => r.roll_no || String(r.id).slice(0, 8))
          .join(", ");
        throw new Error(
          `Cannot return: some selected rolls are not currently marked as issued/dispatched: ${list}.`,
        );
      }

      // Create return header
      const { data: ret, error: retError } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_returns")
        .insert({
          issue_id: selectedIssueId,
          returned_by: userData?.user?.id ?? null,
          reason: reason.trim(),
          notes: notes.trim() || null,
        })
        .select("id, return_no")
        .single();

      if (retError) throw retError;

      // Create return items from the issue items snapshot
      const itemsToInsert = issueDetail.items
        .filter((i) => selectedRollIds.has(i.roll_id))
        .map((i) => ({
          return_id: ret.id,
          roll_id: i.roll_id,
          roll_no: i.roll_no,
          length_m: i.length_m,
          grade: i.grade,
        }));

      const { error: itemsError } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_return_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Move rolls back to store so they can be re-issued correctly
      const { error: updateError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .update({
          status: STATUS_IN_STORE,
          current_location: LOCATION_STORE,
        })
        .in("id", rollIds)
        .eq("status", STATUS_ISSUED)
        .eq("current_location", LOCATION_DISPATCHED);

      if (updateError) throw updateError;

      setSuccess("Return recorded. Rolls moved back to Finished Store.");
      router.push(`/toolbox/finished-fabric/store/returns/${ret.id}`);
    } catch (err: any) {
      console.error("Failed to create issue return", err);
      setError(err?.message || "Failed to record return.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">
            Return Finished Store Issue
          </h1>
          <p className="mt-1 text-slate-600">
            Use this to reverse an issue slip when extra/unwanted rolls were issued
            by mistake. Returned rolls will be moved back to Finished Store stock.
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
        <form onSubmit={handleSubmit} className="space-y-5">
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

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">
                Issue slip number <span className="text-red-600">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={issueSlipSearch}
                  onChange={(e) => setIssueSlipSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  placeholder="e.g. FFSI-000123 or 123"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleSearchIssueSlip()}
                  disabled={isLoadingIssueSearch}
                >
                  {isLoadingIssueSearch ? "Loading..." : "Load"}
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Enter the issue slip number, then load it to confirm the issued rolls.
              </p>
              {selectedIssueId && issueDetail && (
                <p className="mt-2 text-xs text-slate-600">
                  Loaded:{" "}
                  <span className="font-semibold text-slate-900">
                    {formatIssueNo(issueDetail.issue_no)}
                  </span>{" "}
                  • {formatDate(issueDetail.issue_time)}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">
                Reason <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                placeholder="e.g. Extra rolls selected by mistake"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-900">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              placeholder="Optional"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Issued rolls (confirmation)
                </p>
                <p className="text-xs text-slate-600">
                  {issueDetail
                    ? `${issueDetail.items.length} roll(s) on this slip`
                    : "Select an issue slip to load rolls"}
                </p>
              </div>
              <div className="text-sm text-slate-700">
                Selected:{" "}
                <span className="font-semibold text-slate-900">
                  {selectedRollIds.size}
                </span>{" "}
                roll(s) •{" "}
                <span className="font-semibold text-slate-900">
                  {selectedMetersTotal.toFixed(3)}
                </span>{" "}
                m
              </div>
            </div>

            {isLoadingIssueDetail ? (
              <p className="mt-3 text-sm text-slate-600">Loading slip items...</p>
            ) : !issueDetail ? (
              <p className="mt-3 text-sm text-slate-600">
                No issue selected.
              </p>
            ) : issueDetail.items.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No items found on this issue slip.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="w-10 px-3 py-2 text-left font-semibold text-slate-900"></th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">
                        Roll No
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">
                        Colour
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-900">
                        Length (m)
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900">
                        Grade
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {issueDetail.items.map((item) => (
                      <tr
                        key={item.roll_id}
                        className={`border-b border-slate-100 ${
                          selectedRollIds.has(item.roll_id) ? "bg-teal-50" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedRollIds.has(item.roll_id)}
                            onChange={() => toggleRoll(item.roll_id)}
                            className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {item.roll_no || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {item.color || "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {item.length_m !== null ? item.length_m.toFixed(3) : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {item.grade || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !issueDetail || selectedRollIds.size === 0}
            >
              {isSubmitting ? "Saving..." : "Save Return & Restore Stock"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/toolbox/finished-fabric/store")}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </motion.section>
    </div>
  );
}

