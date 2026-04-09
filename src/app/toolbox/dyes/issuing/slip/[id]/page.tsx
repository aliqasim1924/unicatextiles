"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";

interface IssueLine {
  id: string;
  quantity: number;
  uom: string;
  batch_no: string | null;
  dye_items: {
    name: string;
    type: string | null;
    code: string | null;
  };
}

interface IssueSlipData {
  id: string;
  slip_no: string | null;
  issued_at: string;
  issued_to_department: string;
  coating_batch_no: string | null;
  notes: string | null;
  lines: IssueLine[];
}

export default function DyesIssueSlipPage() {
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
        .from("dye_issue_slips")
        .select(
          `
          id,
          slip_no,
          issued_at,
          issued_to_department,
          coating_batches:coating_batch_id ( batch_no ),
          notes,
          dye_issue_lines (
            id,
            quantity,
            uom,
            batch_no,
            dye_items:chemical_item_id (
              name,
              type,
              code
            )
          )
        `
        )
        .eq("id", issueId)
        .single();

      if (fetchError) throw fetchError;

      const processed = {
        ...data,
        coating_batch_no: Array.isArray((data as any).coating_batches)
          ? (data as any).coating_batches[0]?.batch_no ?? null
          : (data as any).coating_batches?.batch_no ?? null,
        lines: (data.dye_issue_lines as any[]).map((line) => ({
          ...line,
          dye_items: Array.isArray(line.dye_items) ? line.dye_items[0] : line.dye_items,
        })),
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
          <Link href="/toolbox/dyes/issuing">
            <Button variant="primary">Back to Dyes Issuing</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
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
        `,
        }}
      />

      <div className="print-page-shell min-h-screen bg-slate-100 print:bg-white print:min-h-0">
        {/* Print Button - Hidden in print */}
        <div className="mx-auto max-w-[800px] px-4 py-6 print:hidden">
          <div className="mb-4 flex items-center justify-between">
            <Link
              href="/toolbox/dyes/issuing"
              className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
            >
              ← Back to Dyes Issuing
            </Link>
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
                  <p className="mt-1 text-sm text-slate-600 print:text-xs">Dyes &amp; Chemicals Issue Slip</p>
                </div>
                <div className="flex h-20 w-20 items-center justify-center print:h-16 print:w-16 overflow-hidden">
                  <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
                </div>
              </div>

              {/* Title and Slip Number */}
              <div className="mb-4 text-center print:mb-3">
                <h2 className="mb-1 text-xl font-semibold text-slate-900 print:text-lg">
                  Dyes &amp; Chemicals Issue Slip
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
                    {new Date(slipData.issued_at).toLocaleDateString("en-ZA", {
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
                  <p className="text-sm font-semibold text-slate-900 print:text-xs">Issued To</p>
                  <p className="text-sm text-slate-600 print:text-xs">
                    {slipData.issued_to_department === "COATING"
                      ? "Coating Department"
                      : slipData.issued_to_department === "WEAVING"
                      ? "Weaving Department"
                      : slipData.issued_to_department === "GENERAL"
                      ? "General"
                      : slipData.issued_to_department || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 print:text-xs">Coating Batch</p>
                  <p className="text-sm text-slate-600 print:text-xs">
                    {slipData.coating_batch_no || "-"}
                  </p>
                </div>
              </div>

              {/* Main Table */}
              <div className="mb-4 overflow-x-auto print:mb-3">
                <table className="w-full border-collapse text-sm print:text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-300">
                      <th className="px-3 py-2 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">
                        Item
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">
                        Type
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">
                        Code
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">
                        Batch No
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-900 print:px-2 print:py-1.5">
                        Quantity
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-900 print:px-2 print:py-1.5">
                        UoM
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {slipData.lines.map((line) => (
                      <tr key={line.id} className="border-b border-slate-200">
                        <td className="px-3 py-2 text-slate-900 print:px-2 print:py-1.5">
                          {line.dye_items?.name || "N/A"}
                        </td>
                        <td className="px-3 py-2 text-slate-600 print:px-2 print:py-1.5">
                          {line.dye_items?.type || "-"}
                        </td>
                        <td className="px-3 py-2 text-slate-600 print:px-2 print:py-1.5">
                          {line.dye_items?.code || "-"}
                        </td>
                        <td className="px-3 py-2 text-slate-600 print:px-2 print:py-1.5">
                          {line.batch_no || "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-900 print:px-2 print:py-1.5">
                          {line.quantity.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-slate-600 print:px-2 print:py-1.5">{line.uom}</td>
                      </tr>
                    ))}
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
              <div className="mb-6 hidden grid-cols-2 gap-6 border-b border-slate-200 pb-4 print:grid print:mb-4 print:gap-4 print:pb-3">
                <div>
                  <p className="mb-1 text-sm font-semibold text-slate-900 print:text-xs">Issued By:</p>
                  <div className="mt-8 border-b border-slate-300"></div>
                  <p className="mt-1 text-xs text-slate-500 print:text-[10px]">Name &amp; Signature</p>
                  <p className="mt-4 text-xs text-slate-500 print:text-[10px]">Date: _______________</p>
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold text-slate-900 print:text-xs">Received By:</p>
                  <div className="mt-8 border-b border-slate-300"></div>
                  <p className="mt-1 text-xs text-slate-500 print:text-[10px]">Name &amp; Signature</p>
                  <p className="mt-4 text-xs text-slate-500 print:text-[10px]">Date: _______________</p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-slate-600 print:text-[10px]">
                <p>Document Number: UTM-DYES-FT-001</p>
                <p>Page 1 of 1</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
