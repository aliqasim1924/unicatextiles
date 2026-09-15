"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface ReturnItem {
  id: string;
  roll_id: string | null;
  roll_no: string | null;
  length_m: number | null;
  grade: string | null;
}

interface ReturnHeader {
  id: string;
  return_no: number | null;
  return_time: string;
  reason: string | null;
  notes: string | null;
  status: "ACTIVE" | "REVERSED";
  issue_id: string;
  issue_no: number | null;
  issue_time: string | null;
  destination: string | null;
  reference: string | null;
  order_id: string | null;
}

export default function FinishedFabricIssueReturnDetailPage() {
  const params = useParams();
  const router = useRouter();
  const returnId = params.id as string;

  const [header, setHeader] = useState<ReturnHeader | null>(null);
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReversing, setIsReversing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (returnId) fetchReturn();
  }, [returnId]);

  async function fetchReturn() {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_returns")
        .select(
          `
          id,
          return_no,
          return_time,
          reason,
          notes,
          status,
          issue_id,
          finished_fabric_store_issue_return_items (
            id,
            roll_id,
            roll_no,
            length_m,
            grade
          )
        `
        )
        .eq("id", returnId)
        .single();

      if (fetchError) throw fetchError;

      let issue: any | null = null;
      if (data.issue_id) {
        const { data: issueRow, error: issueError } = await supabaseBrowserClient
          .from("finished_fabric_store_issues")
          .select("id, issue_no, issue_time, destination, reference, order_id")
          .eq("id", data.issue_id)
          .maybeSingle();
        if (issueError) throw issueError;
        issue = issueRow ?? null;
      }

      setHeader({
        id: data.id,
        return_no: data.return_no ?? null,
        return_time: data.return_time,
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        status: data.status || "ACTIVE",
        issue_id: data.issue_id,
        issue_no: issue?.issue_no ?? null,
        issue_time: issue?.issue_time ?? null,
        destination: issue?.destination ?? null,
        reference: issue?.reference ?? null,
        order_id: issue?.order_id ?? null,
      });

      const mapped: ReturnItem[] =
        (data.finished_fabric_store_issue_return_items || []).map((row: any) => ({
          id: row.id,
          roll_id: row.roll_id ?? null,
          roll_no: row.roll_no ?? null,
          length_m: row.length_m !== null ? Number(row.length_m) : null,
          grade: row.grade ?? null,
        })) || [];
      setItems(mapped);
    } catch (err: any) {
      console.error("Failed to load return", err);
      setError(err?.message || "Failed to load return slip.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReverseReturn() {
    if (!header || header.status === "REVERSED") return;

    const confirmed = window.confirm(
      "Are you sure you want to reverse this return? Returned rolls will be moved back to ISSUED state and re-linked to the order."
    );
    if (!confirmed) return;

    setIsReversing(true);
    setError(null);
    setSuccess(null);

    try {
      const rollIds = items.map((i) => i.roll_id).filter(Boolean) as string[];

      // 1. Update return header to REVERSED
      const { error: headerUpdateError } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_returns")
        .update({ status: "REVERSED" })
        .eq("id", header.id);

      if (headerUpdateError) throw headerUpdateError;

      // 2. Move rolls back to ISSUED / DISPATCHED and restore customer_order_id link
      if (rollIds.length > 0) {
        const { error: rollUpdateError } = await supabaseBrowserClient
          .from("finished_fabric_rolls")
          .update({
            status: "ISSUED",
            current_location: "DISPATCHED",
            customer_order_id: header.order_id,
          })
          .in("id", rollIds);

        if (rollUpdateError) throw rollUpdateError;
      }

      // 3. Recalculate issue slip status
      const { data: issueItems } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_items")
        .select("roll_id")
        .eq("issue_id", header.issue_id);

      const totalIssueRollCount = issueItems?.length || 0;

      // Count rolls that remain in active (non-reversed) returns
      const { data: activeReturns } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_returns")
        .select(
          `
          finished_fabric_store_issue_return_items (
            roll_id
          )
        `
        )
        .eq("issue_id", header.issue_id)
        .neq("status", "REVERSED");

      let remainingReturnedRollCount = 0;
      (activeReturns || []).forEach((ar: any) => {
        remainingReturnedRollCount += (ar.finished_fabric_store_issue_return_items || []).length;
      });

      let nextIssueStatus: "ACTIVE" | "PARTIALLY_RETURNED" | "RETURNED" = "ACTIVE";
      if (remainingReturnedRollCount >= totalIssueRollCount && totalIssueRollCount > 0) {
        nextIssueStatus = "RETURNED";
      } else if (remainingReturnedRollCount > 0) {
        nextIssueStatus = "PARTIALLY_RETURNED";
      }

      await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .update({ status: nextIssueStatus })
        .eq("id", header.issue_id);

      setSuccess("Return reversed successfully. Stock has been re-issued.");
      fetchReturn();
    } catch (err: any) {
      console.error("Failed to reverse return", err);
      setError(err?.message || "Failed to reverse return.");
    } finally {
      setIsReversing(false);
    }
  }

  function formatReturnNo(no: number | null) {
    if (no === null || no === undefined) return "N/A";
    return `FFIR-${String(no).padStart(6, "0")}`;
  }

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 print:bg-white">
        <div className="mx-auto max-w-[900px] px-4 py-6">
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            Loading return...
          </div>
        </div>
      </div>
    );
  }

  if (error || !header) {
    return (
      <div className="min-h-screen bg-slate-100 print:bg-white">
        <div className="mx-auto max-w-[900px] px-4 py-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
            {error || "Return not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:p-0">
      <div className="print:hidden mx-auto max-w-[900px] px-4 py-6 flex items-center justify-between">
        <BackButton href="/toolbox/finished-fabric/store" label="Back to Store" />
        <div className="flex items-center gap-2">
          {header.status !== "REVERSED" && (
            <Button
              variant="outline"
              onClick={handleReverseReturn}
              isLoading={isReversing}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              Reverse Return
            </Button>
          )}
          <Link href={`/toolbox/finished-fabric/store/issues/${header.issue_id}`}>
            <Button variant="secondary">Open Original Issue</Button>
          </Link>
          <Button variant="primary" onClick={() => window.print()}>
            Print Return Slip
          </Button>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          html, body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .toolbox-header {
            display: none !important;
          }
          .print-slip-card {
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[900px] px-4 pb-8 print:p-0 print:max-w-none">
        <div className="print-slip-card flex flex-col min-h-[100vh] rounded-xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 print:min-h-0 print:p-0">
          {success && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 print:hidden">
              {success}
            </div>
          )}

          {header.status === "REVERSED" && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Notice: Return Reversed</p>
              <p className="mt-1 text-xs text-red-700">
                This return slip was marked as REVERSED. All returned rolls have been moved back to ISSUED state and re-linked to customer allocation.
              </p>
            </div>
          )}

          <div className="flex items-start justify-between gap-4 mb-4 print:mb-3 print:pb-2 print:border-b print:border-slate-300">
            <div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-teal-700 print:text-xs print:text-slate-900">
                  UNICA TEXTILE MILLS
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    header.status === "REVERSED"
                      ? "bg-red-100 text-red-800 border border-red-200"
                      : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  }`}
                >
                  {header.status}
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-slate-900 print:text-lg">
                Finished Fabric Issue Return
              </h1>
              <p className="text-sm text-slate-600 mt-1 print:text-xs print:mt-0">
                Return No:{" "}
                <span className="font-semibold">
                  {formatReturnNo(header.return_no)}
                </span>
              </p>
              <p className="text-sm text-slate-600 print:text-xs">
                Date/Time: {formatDate(header.return_time)}
              </p>
              <p className="text-sm text-slate-600 print:text-xs">
                Original Issue:{" "}
                <span className="font-semibold">
                  {formatIssueNo(header.issue_no)}
                </span>{" "}
                ({formatDate(header.issue_time)})
              </p>
              <p className="text-sm text-slate-600 print:text-xs">
                Destination: {header.destination || "—"} • Reference:{" "}
                {header.reference || "—"}
              </p>
            </div>
            <div className="w-28 h-14 rounded-lg flex items-center justify-center print:w-16 print:h-16 overflow-hidden">
              <img
                src="/Logo.png"
                alt="Company Logo"
                className="h-full w-full object-contain"
              />
            </div>
          </div>

          <div className="mb-3 text-sm text-slate-700 print:text-xs print:mb-2">
            <p>
              Reason:{" "}
              <span className="font-semibold text-slate-900">
                {header.reason || "—"}
              </span>
            </p>
            <p>{header.notes ? `Notes: ${header.notes}` : "Notes: —"}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden print:rounded-none print:border-0 print:shadow-none print:mb-3">
            <table className="min-w-full text-sm print:text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 print:bg-transparent">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">
                    Roll No
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">
                    Length (m)
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">
                    Grade
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-3 text-slate-700 print:px-2 print:py-1.5"
                      colSpan={3}
                    >
                      No items recorded.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 print:border-slate-200"
                    >
                      <td className="px-4 py-3 text-slate-900 font-medium print:px-2 print:py-1.5">
                        {item.roll_no || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-900 print:px-2 print:py-1.5">
                        {item.length_m !== null ? item.length_m.toFixed(3) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-900 print:px-2 print:py-1.5">
                        {item.grade || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <footer className="mt-auto pt-4 text-xs text-slate-600 print:text-[10px] print:pt-2 print:border-t print:border-slate-200 print:mt-2">
            <div className="flex justify-between">
              <span>Document Number: UTM-FF-STORE-ISS-RET-FT-001</span>
              <span>Page 1 of 1</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}