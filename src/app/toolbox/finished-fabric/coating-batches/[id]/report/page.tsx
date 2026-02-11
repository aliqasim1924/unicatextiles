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

interface BaseRoll {
  id: string;
  base_fabric_rolls: {
    roll_no: string | null;
    qr_code: string | null;
    length_m: number;
    base_fabric_orders: {
      order_no: string | null;
      loom_no: number | null;
      base_fabric_items: {
        name: string | null;
      } | null;
    } | null;
  };
  input_length_m: number;
}

interface ChemicalRow {
  id: string;
  chemical_name: string | null;
  quantity: number | null;
  uom: string | null;
}

export default function CoatingBatchReportPage() {
  const params = useParams();
  const batchId = params.id as string;

  const [batch, setBatch] = useState<CoatingBatch | null>(null);
  const [baseRolls, setBaseRolls] = useState<BaseRoll[]>([]);
  const [chemicals, setChemicals] = useState<ChemicalRow[]>([]);
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
        .from("coating_batch_base_rolls")
        .select(
          `
          id,
          input_length_m,
          base_fabric_rolls:base_fabric_roll_id (
            roll_no,
            qr_code,
            length_m,
            base_fabric_orders:base_fabric_order_id (
              order_no,
              loom_no,
              base_fabric_items:base_fabric_item_id ( name )
            )
          )
        `
        )
        .eq("batch_id", batchId);
      if (rollsError) throw rollsError;
      const mappedRolls =
        (rollsData || []).map((row: any) => ({
          id: row.id,
          input_length_m: Number(row.input_length_m || 0),
          base_fabric_rolls: Array.isArray(row.base_fabric_rolls)
            ? row.base_fabric_rolls[0]
            : row.base_fabric_rolls,
        })) || [];
      setBaseRolls(mappedRolls as BaseRoll[]);

      const { data: chemData, error: chemError } = await supabaseBrowserClient
        .from("coating_batch_chemicals")
        .select("id, chemical_name, quantity, uom")
        .eq("batch_id", batchId);
      if (chemError) throw chemError;
      setChemicals(
        (chemData || []).map((row: any) => ({
          id: row.id,
          chemical_name: row.chemical_name ?? null,
          quantity: row.quantity !== null ? Number(row.quantity) : null,
          uom: row.uom ?? null,
        })) as ChemicalRow[]
      );
    } catch (err: any) {
      setError(err.message || "Failed to load report.");
    } finally {
      setIsLoading(false);
    }
  }

  const totalInputMeters = baseRolls.reduce((sum, r) => sum + (r.input_length_m || 0), 0);
  const yieldPercent =
    batch?.actual_coated_meters && totalInputMeters > 0
      ? (batch.actual_coated_meters / totalInputMeters) * 100
      : null;

  function formatDate(dateString?: string | null) {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleString("en-ZA");
    } catch {
      return dateString;
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 print:bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6">
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
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
            {error || "Report not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Screen-only actions */}
      <div className="print:hidden mx-auto max-w-5xl px-4 py-6 flex items-center justify-between">
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
          }
          .print-slip-card {
            box-shadow: none !important;
            border: none !important;
            position: relative;
            padding-bottom: 30px !important;
          }
          .print-coating-batch-report-footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 8px 10mm;
            background: white;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            color: #64748b;
            z-index: 1000;
          }
          .print-coating-batch-report-footer.print\\:block span:last-child::after {
            content: "Page " counter(page) " of " counter(pages);
          }
          .print-coating-batch-report-footer.print\\:block span:last-child {
            display: block;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>

      <div className="print-coating-batch-report mx-auto max-w-5xl px-4 pb-8 print:px-0">
        <div className="print-slip-card print-coating-batch-report-card rounded-xl border border-slate-200 bg-white shadow-sm p-6 print:p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">UNICA TEXTILE MILLS</h2>
              <p className="text-sm text-slate-700">Coating Batch Report</p>
            </div>
            <div className="text-right">
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded overflow-hidden">
                <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
              </div>
              <p className="text-sm font-semibold text-slate-900">Batch No: {batch.batch_no ?? "-"}</p>
            </div>
          </div>

          {/* Batch details grid */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Detail label="Batch No" value={batch.batch_no ?? "-"} />
            <Detail label="Batch Date" value={formatDate(batch.batch_date)} />
            <Detail label="Coating Type" value={batch.coating_type} />
            <Detail label="Width" value={batch.width_mm !== null ? `${batch.width_mm} mm` : "-"} />
            <Detail label="Colour" value={batch.color ?? "-"} />
            <Detail label="GSM" value={batch.gsm !== null ? `${batch.gsm}` : "-"} />
            <Detail
              label="Planned Meters"
              value={batch.planned_meters !== null ? `${batch.planned_meters.toFixed(2)} m` : "-"}
            />
            <Detail
              label="Actual Coated Meters"
              value={
                batch.actual_coated_meters !== null ? `${batch.actual_coated_meters.toFixed(2)} m` : "-"
              }
            />
            <Detail
              label="Yield %"
              value={yieldPercent !== null ? `${yieldPercent.toFixed(1)}%` : "-"}
            />
            <Detail label="Status" value={batch.status} />
          </div>

          {/* Input rolls table */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-slate-900">Input Base Fabric Rolls</h3>
            <div className="mt-3">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <Th>Roll No</Th>
                    <Th>Loom No</Th>
                    <Th>Order No</Th>
                    <Th>Base Fabric Name</Th>
                    <Th className="text-right">Length (m)</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {baseRolls.map((roll) => {
                    const order = roll.base_fabric_rolls?.base_fabric_orders;
                    const item = order?.base_fabric_items;
                    return (
                      <tr key={roll.id} className="align-top">
                        <Td>{roll.base_fabric_rolls?.roll_no ?? "-"}</Td>
                          <Td>{order?.loom_no ?? "-"}</Td>
                        <Td>{order?.order_no ?? "-"}</Td>
                        <Td>{item?.name ?? "-"}</Td>
                        <Td className="text-right">{roll.input_length_m?.toFixed(2)}</Td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="px-3 py-2 text-sm text-slate-900" colSpan={4}>
                      Total Input Meters
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-slate-900">
                      {totalInputMeters.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Chemicals table */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-slate-900">Chemicals Used (Batch-Level)</h3>
            {chemicals.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No chemicals recorded for this batch.</p>
            ) : (
              <div className="mt-3">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <Th>Chemical</Th>
                      <Th>Quantity</Th>
                      <Th>UOM</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {chemicals.map((chem) => (
                      <tr key={chem.id}>
                        <Td>{chem.chemical_name || "-"}</Td>
                        <Td>{chem.quantity !== null ? chem.quantity : "-"}</Td>
                        <Td>{chem.uom || "-"}</Td>
                      </tr>
                    ))}
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
                  QC Controller
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
      
      {/* Footer - positioned at bottom in print */}
      <div className="print-coating-batch-report-footer print:hidden">
        <span>Document No: UTM-COAT-BATCH-REP-FT-001</span>
        <span>Page 1 of 1</span>
      </div>
      <div className="hidden print:block print-coating-batch-report-footer">
        <span>Document No: UTM-COAT-BATCH-REP-FT-001</span>
        <span>Page </span>
      </div>
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

