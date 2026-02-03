"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { BackButton } from "@/components/navigation/BackButton";
import { Button } from "@/components/ui/Button";

interface ReturnHeader {
  id: string;
  created_at: string;
  disposition: string;
  pastel_credit_note_no: string | null;
  reason: string | null;
  notes: string | null;
  exchange_slip_no: string | null;
  customer_name: string;
}

interface ReturnLine {
  id: string;
  roll_id: string;
  length_m: number | null;
  grade: string | null;
  roll_no: string | null;
}

export default function CustomerReturnDetailPage() {
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
          pastel_credit_note_no,
          reason,
          notes,
          exchange_slip_no,
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
        pastel_credit_note_no: (data as any).pastel_credit_note_no ?? null,
        reason: (data as any).reason ?? null,
        notes: (data as any).notes ?? null,
        exchange_slip_no: (data as any).exchange_slip_no ?? null,
        customer_name: name ?? "—",
      });

      const { data: linesData, error: linesError } = await supabaseBrowserClient
        .from("customer_return_lines")
        .select(
          `
          id,
          roll_id,
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
            roll_id: row.roll_id,
            length_m: row.length_m != null ? Number(row.length_m) : null,
            grade: row.grade ?? null,
            roll_no: rollNo ?? null,
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
      <div className="grid gap-6">
        <BackButton href="/toolbox/orders/returns" label="Back to Returns" />
        <p className="text-sm text-slate-600">Loading return...</p>
      </div>
    );
  }

  if (error || !header) {
    return (
      <div className="grid gap-6">
        <BackButton href="/toolbox/orders/returns" label="Back to Returns" />
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Return not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Customer Return</h1>
          <p className="mt-1 text-slate-600">
            {formatDate(header.created_at)} — {header.customer_name}
            {header.exchange_slip_no && (
              <span className="ml-2 font-medium text-teal-700">({header.exchange_slip_no})</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {header.disposition === "EXCHANGE" && header.exchange_slip_no && (
            <>
              <Link href={`/toolbox/orders/returns/${returnId}/exchange-slip`}>
                <Button variant="secondary">Print exchange slip</Button>
              </Link>
              <Link
                href={`/toolbox/finished-fabric/store/issue?reference=${encodeURIComponent(header.exchange_slip_no)}`}
              >
                <Button variant="outline">Issue replacement</Button>
              </Link>
            </>
          )}
          <BackButton href="/toolbox/orders/returns" label="Back to Returns" />
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">Customer</p>
            <p className="font-semibold text-slate-900">{header.customer_name}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Disposition</p>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                header.disposition === "CREDIT"
                  ? "bg-emerald-100 text-emerald-800"
                  : header.disposition === "REFUND"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-sky-100 text-sky-800"
              }`}
            >
              {header.disposition}
            </span>
          </div>
          <div>
            <p className="text-sm text-slate-500">Pastel credit note</p>
            <p className="font-medium text-slate-900">{header.pastel_credit_note_no ?? "—"}</p>
          </div>
          {header.disposition === "EXCHANGE" && header.exchange_slip_no && (
            <div>
              <p className="text-sm text-slate-500">Exchange slip no</p>
              <p className="font-semibold text-teal-700">{header.exchange_slip_no}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-slate-500">Reason</p>
            <p className="text-slate-900">{header.reason ?? "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm text-slate-500">Notes</p>
            <p className="text-slate-900">{header.notes ?? "—"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Returned rolls</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-slate-600">No rolls on this return.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Length (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{line.roll_no ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {line.length_m != null ? Number(line.length_m).toFixed(3) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{line.grade ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
