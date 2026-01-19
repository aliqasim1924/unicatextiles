"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface IssueSlipData {
  id: string;
  slip_no: string | null;
  txn_time: string;
  quantity: number;
  uom: string;
  source: string | null;
  destination: string | null;
  batch_no: string | null;
  notes: string | null;
  yarn_items: {
    name: string;
    denier: number | null;
    material: string | null;
  };
  suppliers: {
    name: string;
  } | null;
}

export default function YarnIssueSlipPage() {
  const params = useParams();
  const issueId = params.id as string;
  const [slipData, setSlipData] = useState<IssueSlipData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (issueId) {
      fetchSlipData();
    }
  }, [issueId]);

  async function fetchSlipData() {
    try {
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("yarn_transactions")
        .select(
          `
          id,
          slip_no,
          txn_time,
          quantity,
          uom,
          source,
          destination,
          batch_no,
          notes,
          yarn_items:yarn_item_id (
            name,
            denier,
            material
          ),
          suppliers:supplier_id (
            name
          )
        `
        )
        .eq("id", issueId)
        .eq("transaction_type", "ISSUE")
        .single();

      if (fetchError) throw fetchError;

      const processed = {
        ...data,
        yarn_items: Array.isArray(data.yarn_items) ? data.yarn_items[0] : data.yarn_items,
        suppliers: Array.isArray(data.suppliers) ? data.suppliers[0] : data.suppliers,
      } as IssueSlipData;

      setSlipData(processed);
    } catch (err: any) {
      setError(err.message || "Failed to load issue slip.");
    } finally {
      setIsLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading issue slip...</p>
      </div>
    );
  }

  if (error || !slipData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-red-600">{error || "Issue slip not found."}</p>
          <Link href="/toolbox/yarn/issuing">
            <Button variant="primary">Back to Yarn Issuing</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 12mm;
            }
            
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              margin: 0;
              padding: 0;
            }
            
            .print-slip-wrapper {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 !important;
              page-break-inside: avoid !important;
              page-break-after: avoid !important;
              page-break-before: avoid !important;
              transform-origin: top left;
              transform: scale(0.95);
            }
            
            .print-slip-content {
              width: 100%;
              max-width: none;
              padding: 0;
              margin: 0;
            }
          }
        `
      }} />
      
      <div className="print-page-shell min-h-screen bg-slate-100 print:bg-white print:min-h-0">
        {/* Print Button - Hidden in print */}
        <div className="mx-auto max-w-[800px] px-4 py-6 print:hidden">
          <div className="mb-4 flex items-center justify-between">
            <BackButton href="/toolbox/yarn/issuing" label="Back to Yarn Issuing" />
            <Button variant="primary" onClick={handlePrint}>
              Print Slip
            </Button>
          </div>
        </div>

        {/* Slip Content Wrapper */}
        <div className="print-slip-container">
        <div className="print-slip-card print-slip print-slip-wrapper mx-auto max-w-[800px] bg-white px-8 py-10 print:max-w-none print:px-0 print:py-4">
            <div className="print-slip-content">
            {/* Header */}
            <div className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4 print:mb-4 print:pb-3">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 print:text-xl">UNICA TEXTILE MILLS</h1>
                <p className="mt-1 text-sm text-slate-600 print:text-xs">Yarn Issue Slip</p>
              </div>
              <div className="flex h-20 w-20 items-center justify-center print:h-16 print:w-16 overflow-hidden">
                <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
              </div>
            </div>

            {/* Title and Slip Number */}
            <div className="mb-4 text-center print:mb-3">
              <h2 className="mb-1 text-xl font-semibold text-slate-900 print:text-lg">
                Yarn Issue Slip
              </h2>
              {slipData.slip_no && (
                <p className="text-base font-bold text-slate-900 print:text-sm">
                  Slip No: <span className="text-teal-700">{slipData.slip_no}</span>
                </p>
              )}
            </div>

            {/* Header Details */}
            <div className="mb-4 grid gap-3 border-b border-slate-200 pb-4 sm:grid-cols-2 print:mb-3 print:pb-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 print:text-xs">Date of Issue</p>
                <p className="text-sm text-slate-600 print:text-xs">
                  {new Date(slipData.txn_time).toLocaleDateString("en-ZA", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 print:text-xs">Slip No</p>
                <p className="text-sm font-medium text-slate-900 print:text-xs">
                  {slipData.slip_no || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 print:text-xs">Department / Destination</p>
                <p className="text-sm text-slate-600 print:text-xs">{slipData.destination || "-"}</p>
              </div>
            </div>

            {/* Main Table */}
            <div className="mb-4 overflow-x-auto print:mb-3">
              <table className="w-full border-collapse text-sm print:text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-300">
                    <th className="px-3 py-2 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">Yarn Item</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">Lot / Batch No</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-900 print:px-2 print:py-1.5">Quantity</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">UoM</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">Source</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">Destination</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="px-3 py-2 text-slate-900 print:px-2 print:py-1.5">
                      <div>
                        <p className="font-medium">{slipData.yarn_items?.name || "N/A"}</p>
                        {slipData.yarn_items?.denier && (
                          <p className="text-xs text-slate-600 print:text-[10px]">
                            {slipData.yarn_items.denier}D
                            {slipData.yarn_items.material && ` - ${slipData.yarn_items.material}`}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 print:px-2 print:py-1.5">
                      {slipData.batch_no || "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-900 print:px-2 print:py-1.5">
                      {slipData.quantity.toFixed(3)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 print:px-2 print:py-1.5">{slipData.uom}</td>
                    <td className="px-3 py-2 text-slate-600 print:px-2 print:py-1.5">{slipData.source || "-"}</td>
                    <td className="px-3 py-2 text-slate-600 print:px-2 print:py-1.5">{slipData.destination || "-"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Notes */}
            {slipData.notes && (
              <div className="mb-4 border-b border-slate-200 pb-4 print:mb-3 print:pb-3">
                <p className="mb-1 text-sm font-semibold text-slate-900 print:text-xs">Notes</p>
                <p className="text-sm text-slate-600 print:text-xs">{slipData.notes}</p>
              </div>
            )}

            {/* Signatures */}
            <div className="mb-6 grid gap-6 border-b border-slate-200 pb-4 sm:grid-cols-2 print:mb-4 print:gap-4 print:pb-3">
              <div>
                <p className="mb-6 text-sm font-semibold text-slate-900 print:mb-4 print:text-xs">Issued By:</p>
                <div className="border-b border-slate-300 pt-6 print:pt-4"></div>
              </div>
              <div>
                <p className="mb-6 text-sm font-semibold text-slate-900 print:mb-4 print:text-xs">Received By:</p>
                <div className="border-b border-slate-300 pt-6 print:pt-4"></div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-slate-600 print:text-[10px]">
              <p>Document Number: UTM-WEAV-FT-001</p>
              <p>Page 1 of 1</p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

