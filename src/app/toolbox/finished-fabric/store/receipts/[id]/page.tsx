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
          html, body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: auto !important;
          }
          #__next {
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-slip-container {
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-slip-card {
            display: flex !important;
            flex-direction: column !important;
            box-sizing: border-box !important;
            min-height: auto !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            page-break-before: avoid !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-slip-card > * {
            page-break-inside: avoid;
          }
          footer {
            margin-top: auto !important;
            page-break-inside: avoid;
          }
          .print\\:hidden {
            display: none !important;
          }
          .toolbox-header {
            display: none !important;
          }
        }
      `}</style>

      <div className="print-slip-container mx-auto max-w-[900px] px-4 pb-8 print:p-0 print:max-w-none">
        <div className="print-slip-card flex flex-col min-h-[100vh] rounded-xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 print:min-h-0 print:rounded-none print:border-0 print:shadow-none print:p-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-4 print:mb-3 print:pb-2 print:border-b print:border-slate-300">
            <div>
              <p className="text-sm font-semibold text-teal-700 print:text-xs print:text-slate-900">
                UNICA TEXTILE MILLS
              </p>
              <h1 className="text-2xl font-semibold text-slate-900 print:text-lg print:mb-1">
                Finished Fabric Store Receipt
              </h1>
              <p className="text-sm text-slate-600 mt-1 print:text-xs print:mt-0">
                Receipt No: <span className="font-semibold">{formatReceiptNo(header.receipt_no)}</span>
              </p>
              <p className="text-sm text-slate-600 print:text-xs">
                Date/Time: {formatDate(header.receipt_time)}
              </p>
            </div>
            <div className="w-28 h-14 border border-dashed border-slate-300 rounded-lg flex items-center justify-center text-xs text-slate-400 print:w-16 print:h-16 print:border-slate-400 print:text-slate-500">
              LOGO
            </div>
          </div>

          {header.notes && (
            <div className="mb-3 text-sm text-slate-700 print:text-xs print:mb-2 print:pb-2 print:border-b print:border-slate-200">
              Notes: {header.notes}
            </div>
          )}

          {/* Items */}
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
                    <td className="px-4 py-3 text-slate-700 print:px-2 print:py-1.5" colSpan={3}>
                      No items recorded.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 print:border-slate-200">
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

          {/* Signatures */}
          <div className="hidden print:grid grid-cols-2 gap-6 mt-4 mb-3 border-t border-slate-200 pt-3">
            <div>
              <p className="mb-1 text-sm font-semibold text-slate-900 print:text-xs">Store Manager:</p>
              <div className="mt-6 border-b border-slate-300"></div>
              <p className="mt-1 text-xs text-slate-500 print:text-[10px]">Name &amp; Signature</p>
              <p className="mt-3 text-xs text-slate-500 print:text-[10px]">Date: _______________</p>
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold text-slate-900 print:text-xs">Receiver:</p>
              <div className="mt-6 border-b border-slate-300"></div>
              <p className="mt-1 text-xs text-slate-500 print:text-[10px]">Name &amp; Signature</p>
              <p className="mt-3 text-xs text-slate-500 print:text-[10px]">Date: _______________</p>
            </div>
          </div>

          {/* Footer */}
          <footer className="mt-auto pt-4 text-xs text-slate-600 print:text-[10px] print:pt-2 print:border-t print:border-slate-200 print:mt-2">
            <div className="flex justify-between">
              <span>Document Number: UTM-FF-STORE-REC-FT-001</span>
              <span>Page 1 of 1</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

