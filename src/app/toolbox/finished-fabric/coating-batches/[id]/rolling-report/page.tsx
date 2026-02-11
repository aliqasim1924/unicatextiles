"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface CoatingBatch {
  id: string;
  batch_no: string | null;
  batch_date: string;
  coating_type: string;
  width_mm: number | null;
  planned_meters: number | null;
  color: string | null;
  gsm: number | null;
  actual_coated_meters: number | null;
  status: string;
}

interface FinishedRoll {
  id: string;
  roll_no: string | null;
  length_m: number;
  grade: string | null;
  notes: string | null;
  produced_at: string | null;
  created_at: string | null;
}

export default function RollingReportPage() {
  const params = useParams();
  const batchId = params.id as string;

  const [batch, setBatch] = useState<CoatingBatch | null>(null);
  const [finishedRolls, setFinishedRolls] = useState<FinishedRoll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (batchId) {
      fetchData();
    }
  }, [batchId]);

  async function fetchData() {
    try {
      setIsLoading(true);
      setError(null);

      const { data: batchData, error: batchError } = await supabaseBrowserClient
        .from("coating_batches")
        .select(
          "id, batch_no, batch_date, coating_type, width_mm, planned_meters, color, gsm, actual_coated_meters, status"
        )
        .eq("id", batchId)
        .single();
      if (batchError) throw batchError;
      setBatch(batchData as CoatingBatch);

      const { data: rollsData, error: rollsError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select("id, roll_no, length_m, grade, notes, produced_at, created_at")
        .eq("batch_id", batchId)
        .order("produced_at", { ascending: true });

      if (rollsError) throw rollsError;
      setFinishedRolls(
        (rollsData || []).map((row: any) => ({
          id: row.id,
          roll_no: row.roll_no ?? null,
          length_m: Number(row.length_m || 0),
          grade: row.grade ?? null,
          notes: row.notes ?? null,
          produced_at: row.produced_at ?? null,
          created_at: row.created_at ?? null,
        })) as FinishedRoll[]
      );
    } catch (err: any) {
      setError(err.message || "Failed to load report.");
    } finally {
      setIsLoading(false);
    }
  }

  const actualCoated = batch?.actual_coated_meters ?? null;
  const totalFinished = finishedRolls.reduce((sum, r) => sum + r.length_m, 0);
  const gradeSum = (grade: string) =>
    finishedRolls.filter((r) => r.grade === grade).reduce((sum, r) => sum + r.length_m, 0);
  const aMeters = gradeSum("A");
  const bMeters = gradeSum("B");
  const cMeters = gradeSum("C");
  const scrapMeters = gradeSum("SCRAP");

  const yieldPercent =
    actualCoated !== null && actualCoated > 0 ? (totalFinished / actualCoated) * 100 : null;
  const percentOfCoated = (val: number) =>
    actualCoated !== null && actualCoated > 0 ? (val / actualCoated) * 100 : null;
  const bPercent = percentOfCoated(bMeters);
  const cPercent = percentOfCoated(cMeters);
  const scrapPercent = percentOfCoated(scrapMeters);

  function formatDate(dateString?: string | null) {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleDateString("en-ZA", {
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
            Loading report...
          </div>
        </div>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="min-h-screen bg-slate-100 print:bg-white">
        <div className="mx-auto max-w-[900px] px-4 py-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
            {error || "Report not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:p-0">
      {/* Screen-only actions */}
      <div className="print:hidden mx-auto max-w-[900px] px-4 py-6 flex items-center justify-between">
        <BackButton
          href={`/toolbox/finished-fabric/coating-batches/${batch.id}`}
          label="Back to Batch"
        />
        <Button variant="primary" onClick={() => window.print()}>
          Print Report
        </Button>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm 10mm 20mm 10mm;
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
            box-sizing: border-box;
            box-shadow: none !important;
            border: none !important;
            display: block !important;
            flex-direction: unset !important;
            min-height: unset !important;
            height: auto !important;
            max-height: none !important;
            page-break-inside: auto;
            break-inside: auto;
          }
          .print-slip-card > * {
            page-break-inside: auto;
            break-inside: auto;
          }
          .print-slip-card > div:not(.rolling-report-table-wrap) {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .print-slip-card .rolling-report-table-wrap {
            page-break-inside: auto;
            break-inside: auto;
            overflow: visible !important;
            margin-top: 0;
          }
          .print-slip-card .rolling-report-table-wrap h3 {
            page-break-after: avoid;
            break-after: avoid;
          }
          .print-slip-card .rolling-report-table-wrap > div {
            overflow: visible !important;
          }
          .print-slip-card .rolling-report-table {
            page-break-inside: auto;
            border-collapse: collapse;
            width: 100%;
          }
          .print-slip-card .rolling-report-table thead {
            display: table-header-group;
          }
          .print-slip-card .rolling-report-table tbody {
            display: table-row-group;
            page-break-inside: auto;
          }
          .print-slip-card .rolling-report-table tr {
            page-break-inside: avoid;
            page-break-after: auto;
            break-inside: avoid;
          }
          .print-slip-card .rolling-report-table td,
          .print-slip-card .rolling-report-table th {
            page-break-inside: avoid;
          }
          footer.print\\:block span:last-child::after {
            content: "Page " counter(page) " of " counter(pages);
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[900px] px-4 pb-8 print:p-0">
        <div className="print-slip-card flex flex-col min-h-0 rounded-xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 print:p-4 print:pb-20">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">UNICA TEXTILE MILLS</h2>
              <p className="text-sm font-semibold text-slate-700">Rolling Report (Finished Fabric)</p>
            </div>
            <div className="text-right">
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded overflow-hidden">
                <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
              </div>
              <p className="text-sm font-semibold text-slate-900">Batch No: {batch.batch_no ?? "-"}</p>
              <p className="text-xs text-slate-600">Status: {batch.status}</p>
            </div>
          </div>

          {/* Batch Summary */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <Detail label="Batch No" value={batch.batch_no ?? "-"} />
            <Detail label="Batch Date" value={formatDate(batch.batch_date)} />
            <Detail label="Coating Type" value={batch.coating_type} />
            <Detail label="Colour" value={batch.color ?? "-"} />
            <Detail label="GSM" value={batch.gsm !== null ? `${batch.gsm}` : "-"} />
            <Detail
              label="Planned Meters"
              value={batch.planned_meters !== null ? `${batch.planned_meters.toFixed(2)} m` : "-"}
            />
            <Detail
              label="Coated Meters"
              value={actualCoated !== null ? `${actualCoated.toFixed(2)} m` : "-"}
            />
            <Detail
              label="Total Finished Meters"
              value={totalFinished > 0 ? `${totalFinished.toFixed(2)} m` : "-"}
            />
            <Detail
              label="Yield %"
              value={yieldPercent !== null ? `${yieldPercent.toFixed(1)}%` : "-"}
            />
          </div>

          {/* Yield / Grades Summary */}
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
              Yield & Grades Summary
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <span className="font-semibold text-slate-900">A-Grade:</span>{" "}
                <span className="text-slate-700">{aMeters.toFixed(2)} m</span>
              </div>
              <div>
                <span className="font-semibold text-slate-900">B-Grade:</span>{" "}
                <span className="text-slate-700">
                  {bMeters.toFixed(2)} m{bPercent !== null ? ` (${bPercent.toFixed(1)}%)` : ""}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-900">C-Grade:</span>{" "}
                <span className="text-slate-700">
                  {cMeters.toFixed(2)} m{cPercent !== null ? ` (${cPercent.toFixed(1)}%)` : ""}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-900">Scrap:</span>{" "}
                <span className="text-slate-700">
                  {scrapMeters.toFixed(2)} m{scrapPercent !== null ? ` (${scrapPercent.toFixed(1)}%)` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Finished Rolls Table */}
          <div className="mb-6 rolling-report-table-wrap print:mb-0">
            <h3 className="mb-3 text-lg font-semibold text-slate-900 print:mb-2">
              Finished Rolls (Rolling & Inspection)
            </h3>
            {finishedRolls.length === 0 ? (
              <p className="text-sm text-slate-600">No finished rolls recorded yet.</p>
            ) : (
              <div className="overflow-x-auto print:overflow-visible print:block">
                <table className="min-w-full text-sm rolling-report-table print:w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <Th>Roll No</Th>
                      <Th className="text-right">Length (m)</Th>
                      <Th>Grade</Th>
                      <Th>Notes</Th>
                      <Th>Produced At</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {finishedRolls.map((roll) => (
                      <tr key={roll.id} className="align-top">
                        <Td>{roll.roll_no ?? "-"}</Td>
                        <Td className="text-right">{roll.length_m.toFixed(2)}</Td>
                        <Td>{roll.grade ?? "-"}</Td>
                        <Td>{roll.notes ?? "-"}</Td>
                        <Td>{formatDate(roll.produced_at || roll.created_at)}</Td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 font-semibold bg-slate-50">
                      <td className="px-3 py-2 text-sm text-slate-900" colSpan={1}>
                        Total Finished Meters
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-slate-900">
                        {totalFinished.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-900" colSpan={3}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="print-coating-signatures mt-10 pt-6 border-t border-slate-200">
            <div className="grid grid-cols-2 gap-8 max-w-md">
              <div>
                <div className="border-b border-slate-400 mb-1 h-10" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Production Manager
                </p>
              </div>
              <div>
                <div className="border-b border-slate-400 mb-1 h-10" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Rolling Supervisor
                </p>
              </div>
            </div>
          </div>

        </div>
        
        {/* Footer - positioned at bottom in print */}
        <footer className="mt-auto pt-4 flex items-center justify-between text-xs text-slate-600 border-t border-slate-200 print:hidden">
          <span>Document No: UTM-ROLL-REP-FT-001</span>
          <span>Page 1 of 1</span>
        </footer>
      </div>
      
      {/* Print footer - fixed at bottom */}
      <footer className="hidden print:block print:fixed print:bottom-0 print:left-0 print:right-0 print:px-[10mm] print:py-2 print:bg-white print:border-t print:border-slate-200 print:flex print:justify-between print:items-center print:text-[10px] print:text-slate-600 print:z-[1000]">
        <span>Document No: UTM-ROLL-REP-FT-001</span>
        <span>Page </span>
      </footer>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value}</p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-700 ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-sm text-slate-700 ${className}`}>{children}</td>;
}

