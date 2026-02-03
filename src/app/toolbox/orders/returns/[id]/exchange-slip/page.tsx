"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { BackButton } from "@/components/navigation/BackButton";
import { Button } from "@/components/ui/Button";

interface ReturnHeader {
  id: string;
  created_at: string;
  disposition: string;
  exchange_slip_no: string | null;
  reason: string | null;
  notes: string | null;
  customer_name: string;
}

interface ReturnLine {
  id: string;
  roll_no: string | null;
  length_m: number | null;
  grade: string | null;
}

export default function ExchangeSlipPage() {
  const params = useParams();
  const returnId = params.id as string;
  const [header, setHeader] = useState<ReturnHeader | null>(null);
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (returnId) fetchReturn();
  }, [returnId]);

  async function fetchReturn() {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("customer_returns")
        .select(
          `
          id,
          created_at,
          disposition,
          exchange_slip_no,
          reason,
          notes,
          customer_id,
          customers:customer_id ( name )
        `
        )
        .eq("id", returnId)
        .single();

      if (fetchError) throw fetchError;
      const cust = (data as any)?.customers;
      const name = Array.isArray(cust) ? cust[0]?.name : cust?.name;
      setHeader({
        id: (data as any).id,
        created_at: (data as any).created_at,
        disposition: (data as any).disposition,
        exchange_slip_no: (data as any).exchange_slip_no ?? null,
        reason: (data as any).reason ?? null,
        notes: (data as any).notes ?? null,
        customer_name: name ?? "—",
      });

      const { data: linesData, error: linesError } = await supabaseBrowserClient
        .from("customer_return_lines")
        .select(
          `
          id,
          length_m,
          grade,
          finished_fabric_rolls:roll_id ( roll_no )
        `
        )
        .eq("return_id", returnId);

      if (linesError) throw linesError;
      const mapped: ReturnLine[] =
        ((linesData as any[]) ?? []).map((row: any) => {
          const roll = row.finished_fabric_rolls;
          const rollNo = Array.isArray(roll) ? roll[0]?.roll_no : roll?.roll_no;
          return {
            id: row.id,
            roll_no: rollNo ?? null,
            length_m: row.length_m != null ? Number(row.length_m) : null,
            grade: row.grade ?? null,
          };
        });
      setLines(mapped);
    } catch (err: any) {
      console.error("Failed to load return", err);
      setError(err?.message || "Failed to load return.");
    } finally {
      setIsLoading(false);
    }
  }

  function formatDate(dateString?: string | null) {
    if (!dateString) return "—";
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
          <p className="text-sm text-slate-600">Loading exchange slip...</p>
        </div>
      </div>
    );
  }

  if (error || !header) {
    return (
      <div className="min-h-screen bg-slate-100 print:bg-white">
        <div className="mx-auto max-w-[900px] px-4 py-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error || "Return not found."}
          </div>
          <div className="mt-4">
            <BackButton href="/toolbox/orders/returns" label="Back to Returns" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:p-0">
      <div className="print:hidden mx-auto max-w-[900px] px-4 py-6 flex items-center justify-between">
        <BackButton href={`/toolbox/orders/returns/${returnId}`} label="Back to Return" />
        <div className="flex gap-2">
          <Link href={`/toolbox/finished-fabric/store/issue?reference=${encodeURIComponent(header.exchange_slip_no ?? "")}`}>
            <Button variant="outline">Issue replacement</Button>
          </Link>
          <Button variant="primary" onClick={() => window.print()}>
            Print exchange slip
          </Button>
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
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[900px] px-4 pb-8 print:p-0">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 print:p-4 print:border-0 print:shadow-none">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-sm font-semibold text-teal-700">UNICA TEXTILE MILLS</p>
              <h1 className="text-2xl font-semibold text-slate-900">Exchange Slip</h1>
              <p className="text-sm text-slate-600 mt-1">
                Exchange slip no: <span className="font-semibold text-teal-700">{header.exchange_slip_no ?? "—"}</span>
              </p>
              <p className="text-sm text-slate-600">Date: {formatDate(header.created_at)}</p>
              <p className="text-sm text-slate-600">Customer: {header.customer_name}</p>
              <p className="text-sm text-slate-600">Reason: {header.reason ?? "—"}</p>
              {header.notes && (
                <p className="text-sm text-slate-600 mt-1">Notes: {header.notes}</p>
              )}
            </div>
            <div className="w-28 h-14 rounded-lg flex items-center justify-center overflow-hidden print:hidden">
              <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
            </div>
          </div>

          <h2 className="text-sm font-semibold text-slate-900 mb-2">Rolls returned (by customer)</h2>
          <div className="rounded-lg border border-slate-200 overflow-hidden mb-6">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Length (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-700" colSpan={3}>
                      No rolls recorded.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{line.roll_no ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        {line.length_m != null ? Number(line.length_m).toFixed(3) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{line.grade ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
            <p className="font-semibold">Replacement</p>
            <p className="mt-1">
              Issue replacement rolls via <strong>Issue from Finished Store</strong> (destination: Customer) using reference:{" "}
              <strong>{header.exchange_slip_no ?? "—"}</strong>
            </p>
          </div>

          <footer className="mt-8 pt-4 text-xs text-slate-500 border-t border-slate-200">
            Exchange slip {header.exchange_slip_no ?? ""} — {formatDate(header.created_at)} — {header.customer_name}
          </footer>
        </div>
      </div>
    </div>
  );
}
