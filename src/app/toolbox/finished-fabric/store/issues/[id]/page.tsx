"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface IssueItem {
  id: string;
  roll_id: string | null;
  roll_no: string | null;
  length_m: number | null;
  grade: string | null;
  serial_no: number | null;
  sequence_no: number;
  is_returned?: boolean;
  return_no?: number | null;
}

interface IssueHeader {
  id: string;
  issue_no: number | null;
  issue_time: string;
  destination: string | null;
  reference: string | null;
  notes: string | null;
  status: "ACTIVE" | "PARTIALLY_RETURNED" | "RETURNED";
  order_id?: string | null;
  invoice_no?: string | null;
  gate_pass_no?: string | null;
  order?: any | null;
}

export default function FinishedFabricStoreIssueDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const issueId = params.id as string;
  const backOrderId = searchParams.get("back_order");

  const [header, setHeader] = useState<IssueHeader | null>(null);
  const [items, setItems] = useState<IssueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (issueId) {
      fetchIssue();
    }
  }, [issueId]);

  async function fetchIssue() {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch issue header and items
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
          status,
          order_id,
          invoice_no,
          gate_pass_no,
          customer_orders:order_id (*, customers:customer_id (name)),
          finished_fabric_store_issue_items (
            id,
            roll_id,
            roll_no,
            length_m,
            grade,
            finished_fabric_rolls:roll_id (
              serial_no
            )
          )
        `
        )
        .eq("id", issueId)
        .single();

      if (fetchError) throw fetchError;

      // Fetch non-reversed returns for this issue to identify returned rolls
      const { data: returnsData } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_returns")
        .select(
          `
          return_no,
          status,
          finished_fabric_store_issue_return_items (
            roll_id
          )
        `
        )
        .eq("issue_id", issueId)
        .neq("status", "REVERSED");

      const returnedRollMap = new Map<string, number | null>();
      (returnsData || []).forEach((ret: any) => {
        (ret.finished_fabric_store_issue_return_items || []).forEach((ri: any) => {
          if (ri.roll_id) {
            returnedRollMap.set(ri.roll_id, ret.return_no ?? null);
          }
        });
      });

      let order = Array.isArray(data.customer_orders) ? data.customer_orders[0] : data.customer_orders;
      if (order && Array.isArray(order.customers)) {
        order = { ...order, customers: order.customers[0] ?? null };
      }

      // Dynamic fallback to customer order invoice/gate pass numbers if null/empty on the issue slip
      const invoiceNo =
        data.invoice_no && data.invoice_no.trim() !== ""
          ? data.invoice_no
          : (order?.invoice_no ?? null);

      const gatePassNo =
        data.gate_pass_no && data.gate_pass_no.trim() !== ""
          ? data.gate_pass_no
          : (order?.gate_pass_no ?? null);

      setHeader({
        id: data.id,
        issue_no: data.issue_no ?? null,
        issue_time: data.issue_time,
        destination: data.destination ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        status: data.status || "ACTIVE",
        order_id: data.order_id ?? null,
        invoice_no: invoiceNo,
        gate_pass_no: gatePassNo,
        order: order ?? null,
      });

      // Calculate sequence offset from all prior active dispatches for this order
      let priorActiveRollsCount = 0;
      if (data.order_id && data.issue_no) {
        const { data: priorIssues } = await supabaseBrowserClient
          .from("finished_fabric_store_issues")
          .select(
            `
            id,
            finished_fabric_store_issue_items ( id, roll_id )
          `
          )
          .eq("order_id", data.order_id)
          .lt("issue_no", data.issue_no);

        const priorIssueIds = (priorIssues || []).map((i: any) => i.id);

        if (priorIssueIds.length > 0) {
          const { data: priorReturns } = await supabaseBrowserClient
            .from("finished_fabric_store_issue_returns")
            .select(
              `
              finished_fabric_store_issue_return_items ( roll_id )
            `
            )
            .in("issue_id", priorIssueIds)
            .neq("status", "REVERSED");

          const priorReturnedRollIds = new Set<string>();
          (priorReturns || []).forEach((ret: any) => {
            (ret.finished_fabric_store_issue_return_items || []).forEach((ri: any) => {
              if (ri.roll_id) priorReturnedRollIds.add(ri.roll_id);
            });
          });

          (priorIssues || []).forEach((pi: any) => {
            (pi.finished_fabric_store_issue_items || []).forEach((item: any) => {
              if (!item.roll_id || !priorReturnedRollIds.has(item.roll_id)) {
                priorActiveRollsCount += 1;
              }
            });
          });
        }
      }

      const rawItems = data.finished_fabric_store_issue_items || [];

      // Sort items strictly by roll serial_no ASC
      rawItems.sort((a: any, b: any) => {
        const rollA = Array.isArray(a.finished_fabric_rolls) ? a.finished_fabric_rolls[0] : a.finished_fabric_rolls;
        const rollB = Array.isArray(b.finished_fabric_rolls) ? b.finished_fabric_rolls[0] : b.finished_fabric_rolls;
        return (rollA?.serial_no ?? 0) - (rollB?.serial_no ?? 0);
      });

      let activeCounter = 0;
      const mapped: IssueItem[] = rawItems.map((row: any) => {
        const roll = Array.isArray(row.finished_fabric_rolls)
          ? row.finished_fabric_rolls[0]
          : row.finished_fabric_rolls;
        const rollId = row.roll_id ?? null;
        const isReturned = rollId ? returnedRollMap.has(rollId) : false;
        const returnNo = rollId ? returnedRollMap.get(rollId) ?? null : null;

        if (!isReturned) {
          activeCounter += 1;
        }

        return {
          id: row.id as string,
          roll_id: rollId,
          roll_no: row.roll_no ?? null,
          length_m: row.length_m !== null ? Number(row.length_m) : null,
          grade: row.grade ?? null,
          serial_no: roll?.serial_no ?? null,
          sequence_no: priorActiveRollsCount + activeCounter,
          is_returned: isReturned,
          return_no: returnNo,
        };
      });

      setItems(mapped);
    } catch (err: any) {
      setError(err.message || "Failed to load issue.");
    } finally {
      setIsLoading(false);
    }
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

  function handlePrintLabels() {
    const rollIds = items.filter((i) => !i.is_returned).map((i) => i.roll_id).filter(Boolean);
    if (rollIds.length === 0) {
      alert("No active rolls available for label printing on this issue.");
      return;
    }

    const issueNo = header?.issue_no ? String(header.issue_no) : "";
    window.open(
      `/toolbox/qr/print?type=finished_fabric&rollIds=${rollIds.join(",")}&issueNo=${issueNo}&issueId=${issueId}`,
      "_blank"
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 print:bg-white">
        <div className="mx-auto max-w-[900px] px-4 py-6">
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            Loading issue...
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
            {error || "Issue not found."}
          </div>
        </div>
      </div>
    );
  }

  const activeMeters = items
    .filter((i) => !i.is_returned)
    .reduce((sum, i) => sum + (i.length_m || 0), 0);
  const totalMeters = items.reduce((sum, i) => sum + (i.length_m || 0), 0);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:p-0">
      <div className="print:hidden mx-auto max-w-[900px] px-4 py-6 space-y-3">
        {backOrderId && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
            A back order was created for the remaining quantity.{" "}
            <Link
              href={`/toolbox/orders/${backOrderId}`}
              className="font-semibold text-teal-700 underline hover:text-teal-900"
            >
              Open back order →
            </Link>
          </div>
        )}
        <div className="flex items-center justify-between">
          <BackButton href="/toolbox/finished-fabric/store" label="Back to Store" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrintLabels}>
              Print Roll Labels
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (issueId) {
                  window.location.href = `/toolbox/finished-fabric/store/issues/${issueId}/packing-list`;
                }
              }}
            >
              Print Packing List
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              Print Issue Slip
            </Button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            margin: 0;
            padding: 0;
          }
          .print-slip-card {
            display: flex !important;
            flex-direction: column !important;
            box-sizing: border-box;
            max-height: 100vh;
            overflow: hidden;
            page-break-before: avoid;
            page-break-after: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
            border: none !important;
            transform-origin: top left;
            transform: scale(0.96);
          }
          footer {
            margin-top: auto !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[900px] px-4 pb-8 print:p-0">
        <div className="print-slip-card flex flex-col min-h-[100vh] rounded-xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 print:p-4">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-teal-700">UNICA TEXTILE MILLS</p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    header.status === "RETURNED"
                      ? "bg-purple-100 text-purple-800 border border-purple-200"
                      : header.status === "PARTIALLY_RETURNED"
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  }`}
                >
                  {header.status}
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-slate-900 mt-1">
                Finished Fabric Store Issue
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Issue No: {formatIssueNo(header.issue_no)}
              </p>
              <p className="text-sm text-slate-600">Date/Time: {formatDate(header.issue_time)}</p>
              <p className="text-sm text-slate-600">
                Destination: {header.destination || "—"}
              </p>
              <p className="text-sm text-slate-600">
                Reference: {header.reference && header.reference.trim() !== "" ? header.reference : "—"}
              </p>
              <p className="text-sm text-slate-600">
                Invoice: {header.invoice_no || "—"}
              </p>
              <p className="text-sm text-slate-600">
                Gate Pass: {header.gate_pass_no || "—"}
              </p>
              {header.order && (
                <p className="text-sm text-slate-600">
                  Order: {header.order.customers?.name ?? header.order.customer_name ?? "—"}
                </p>
              )}
            </div>
            <div className="w-28 h-14 rounded-lg flex items-center justify-center overflow-hidden">
              <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between text-sm text-slate-700">
            <div>{header.notes ? `Notes: ${header.notes}` : "Notes: —"}</div>
            {header.status !== "ACTIVE" && (
              <div className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Active Meters: {activeMeters.toFixed(3)}m / Total Issued: {totalMeters.toFixed(3)}m
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Serial #</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Length (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-700" colSpan={5}>
                      No items recorded.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const serialStr = String(item.sequence_no).padStart(2, "0");
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-100 ${
                          item.is_returned ? "bg-slate-50 text-slate-400 line-through" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-bold">
                          {serialStr}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {item.roll_no || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {item.length_m !== null ? item.length_m.toFixed(3) : "—"}
                        </td>
                        <td className="px-4 py-3">{item.grade || "—"}</td>
                        <td className="px-4 py-3 no-underline">
                          {item.is_returned ? (
                            <span className="inline-flex items-center text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              Returned {item.return_no ? `(FFIR-${String(item.return_no).padStart(6, "0")})` : ""}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-emerald-700">Issued</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <footer className="mt-auto pt-4 text-xs text-slate-600">
            Document Number: UTM-FF-STORE-ISS-FT-001
            <span className="float-right">Page 1 of 1</span>
          </footer>
        </div>
      </div>
    </div>
  );
}