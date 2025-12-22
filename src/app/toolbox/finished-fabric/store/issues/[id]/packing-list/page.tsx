"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface IssueItem {
  id: string;
  roll_no: string | null;
  length_m: number | null;
  grade: string | null;
  roll?: {
    roll_no?: string | null;
    length_m?: number | null;
    grade?: string | null;
    gsm?: number | null;
    color?: string | null;
    coating_type?: string | null;
  } | null;
}

interface IssueHeader {
  id: string;
  issue_no: number | null;
  issue_time: string;
  destination: string | null;
  reference: string | null;
  notes: string | null;
  order_id?: string | null;
  invoice_no?: string | null;
  gate_pass_no?: string | null;
  order?: any | null;
}

export default function FinishedFabricPackingListPage() {
  const params = useParams();
  const issueId = params.id as string;

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
          order_id,
          invoice_no,
          gate_pass_no,
          customer_orders:order_id (*),
          finished_fabric_store_issue_items (
            id,
            roll_id,
            roll_no,
            length_m,
            grade,
            finished_fabric_rolls:roll_id (
              roll_no,
              length_m,
              grade,
              gsm,
              color,
              coating_type
            )
          )
        `
        )
        .eq("id", issueId)
        .single();

      if (fetchError) throw fetchError;

      setHeader({
        id: data.id,
        issue_no: data.issue_no ?? null,
        issue_time: data.issue_time,
        destination: data.destination ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        order_id: data.order_id ?? null,
        invoice_no: data.invoice_no ?? null,
        gate_pass_no: data.gate_pass_no ?? null,
        order: Array.isArray(data.customer_orders) ? data.customer_orders[0] : data.customer_orders,
      });

      const mapped: IssueItem[] =
        (data.finished_fabric_store_issue_items || []).map((row: any) => ({
          id: row.id as string,
          roll_no: row.roll_no ?? null,
          length_m: row.length_m !== null ? Number(row.length_m) : null,
          grade: row.grade ?? null,
          roll: Array.isArray(row.finished_fabric_rolls)
            ? row.finished_fabric_rolls[0]
            : row.finished_fabric_rolls,
        })) || [];
      setItems(mapped);
    } catch (err: any) {
      console.error("Failed to load packing list", err);
      setError(err.message || "Failed to load packing list.");
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 print:bg-white">
        <div className="mx-auto max-w-[900px] px-4 py-6">
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            Loading packing list...
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

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:p-0">
      {/* Screen-only actions */}
      <div className="print:hidden mx-auto max-w-[900px] px-4 py-6 flex items-center justify-between">
        <BackButton href={`/toolbox/finished-fabric/store/issues/${issueId}`} label="Back to Issue" />
        <Button variant="primary" onClick={() => window.print()}>
          Print Packing List
        </Button>
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
          .print-slip-container {
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
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-sm font-semibold text-teal-700">UNICA TEXTILE MILLS</p>
              <h1 className="text-2xl font-semibold text-slate-900">Packing List</h1>
              <p className="text-sm text-slate-600 mt-1">
                Issue No: {formatIssueNo(header.issue_no)}
              </p>
              <p className="text-sm text-slate-600">Date/Time: {formatDate(header.issue_time)}</p>
              <p className="text-sm text-slate-600">
                Destination: {header.destination || "—"}
              </p>
              <p className="text-sm text-slate-600">
                Order:{" "}
                {header.order?.order_no ||
                  header.order?.proforma_no ||
                  header.order?.quote_no ||
                  header.order?.id ||
                  "—"}
              </p>
              <p className="text-sm text-slate-600">
                Customer: {header.order?.customer_name || "—"}
              </p>
              <p className="text-sm text-slate-600">
                Invoice No: {header.invoice_no || "____________"}
              </p>
              <p className="text-sm text-slate-600">
                Gate Pass No: {header.gate_pass_no || "____________"}
              </p>
            </div>
            <div className="w-28 h-14 border border-dashed border-slate-300 rounded-lg flex items-center justify-center text-xs text-slate-400">
              LOGO
            </div>
          </div>

          {/* Items */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-4">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Length (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">GSM</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Colour</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Coating Type</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-700" colSpan={6}>
                      No items recorded.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const roll = item.roll || {};
                    return (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-slate-900 font-medium">
                          {item.roll_no || roll.roll_no || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-900">
                          {item.length_m !== null
                            ? item.length_m.toFixed(3)
                            : roll.length_m !== undefined && roll.length_m !== null
                              ? Number(roll.length_m).toFixed(3)
                              : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{item.grade || roll.grade || "—"}</td>
                        <td className="px-4 py-3 text-slate-900">
                          {roll.gsm !== null && roll.gsm !== undefined ? roll.gsm : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-900">
                          {roll.color || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-900">
                          {roll.coating_type || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <footer className="mt-auto pt-4 text-xs text-slate-600">
            Document Number: UTM-PACK-LIST-FT-001
            <span className="float-right">Page 1 of 1</span>
          </footer>
        </div>
      </div>
    </div>
  );
}


