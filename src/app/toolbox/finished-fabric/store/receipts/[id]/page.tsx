"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface ReceiptItem {
  id: string;
  roll_no: string | null;
  length_m: number | null;
  grade: string | null;
}

interface ReceiptHeader {
  id: string;
  receipt_no: number | null;
  receipt_time: string;
  notes: string | null;
}

export default function FinishedFabricStoreReceiptDetailPage() {
  const params = useParams();
  const receiptId = params.id as string;

  const [header, setHeader] = useState<ReceiptHeader | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (receiptId) {
      fetchReceipt();
    }
  }, [receiptId]);

  async function fetchReceipt() {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("finished_fabric_store_receipts")
        .select(
          `
          id,
          receipt_no,
          receipt_time,
          notes,
          finished_fabric_store_receipt_items (
            id,
            roll_no,
            length_m,
            grade
          )
        `
        )
        .eq("id", receiptId)
        .single();

      if (fetchError) throw fetchError;

      setHeader({
        id: data.id,
        receipt_no: data.receipt_no ?? null,
        receipt_time: data.receipt_time,
        notes: data.notes ?? null,
      });

      const mapped: ReceiptItem[] =
        (data.finished_fabric_store_receipt_items || []).map((row: any) => ({
          id: row.id as string,
          roll_no: row.roll_no ?? null,
          length_m: row.length_m !== null ? Number(row.length_m) : null,
          grade: row.grade ?? null,
        })) || [];
      setItems(mapped);
    } catch (err: any) {
      setError(err.message || "Failed to load receipt.");
    } finally {
      setIsLoading(false);
    }
  }

  function formatReceiptNo(receiptNo: number | null) {
    if (receiptNo === null || receiptNo === undefined) return "N/A";
    return `FFSR-${String(receiptNo).padStart(6, "0")}`;
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
            Loading receipt...
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
            {error || "Receipt not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:p-0">
      {/* Screen-only actions */}
      <div className="print:hidden mx-auto max-w-[900px] px-4 py-6 flex items-center justify-between">
        <BackButton href="/toolbox/finished-fabric/store" label="Back to Store" />
        <Button variant="primary" onClick={() => window.print()}>
          Print Receipt Slip
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
              <h1 className="text-2xl font-semibold text-slate-900">
                Finished Fabric Store Receipt
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Receipt No: {formatReceiptNo(header.receipt_no)}
              </p>
              <p className="text-sm text-slate-600">Date/Time: {formatDate(header.receipt_time)}</p>
            </div>
            <div className="w-28 h-14 border border-dashed border-slate-300 rounded-lg flex items-center justify-center text-xs text-slate-400">
              LOGO
            </div>
          </div>

          <div className="mb-4 text-sm text-slate-700">
            {header.notes ? `Notes: ${header.notes}` : "Notes: —"}
          </div>

          {/* Items */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Length (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-700" colSpan={3}>
                      No items recorded.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        {item.roll_no || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-900">
                        {item.length_m !== null ? item.length_m.toFixed(3) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{item.grade || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <footer className="mt-auto pt-4 text-xs text-slate-600">
            Document Number: UTM-FF-STORE-REC-FT-001
            <span className="float-right">Page 1 of 1</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

