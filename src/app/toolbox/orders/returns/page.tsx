"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { BackButton } from "@/components/navigation/BackButton";
import { Button } from "@/components/ui/Button";

type Disposition = "CREDIT" | "EXCHANGE" | "REFUND";

interface ReturnRow {
  id: string;
  created_at: string;
  disposition: string;
  pastel_credit_note_no: string | null;
  reason: string | null;
  notes: string | null;
  customer_name: string;
  line_count: number;
}

export default function CustomerReturnsListPage() {
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispositionFilter, setDispositionFilter] = useState<"ALL" | Disposition>("ALL");

  useEffect(() => {
    fetchReturns();
  }, []);

  async function fetchReturns() {
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
          customer_id,
          customers:customer_id ( name )
        `
        )
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const returnIds = (data as any[])?.map((r) => r.id) ?? [];
      if (returnIds.length === 0) {
        setReturns([]);
        return;
      }

      const { data: lineCounts } = await supabaseBrowserClient
        .from("customer_return_lines")
        .select("return_id")
        .in("return_id", returnIds);

      const countByReturn: Record<string, number> = {};
      (lineCounts as any[])?.forEach((row) => {
        countByReturn[row.return_id] = (countByReturn[row.return_id] ?? 0) + 1;
      });

      const mapped: ReturnRow[] =
        (data as any[])?.map((row: any) => {
          const cust = row.customers;
          const name = Array.isArray(cust) ? cust[0]?.name : cust?.name;
          return {
            id: row.id,
            created_at: row.created_at,
            disposition: row.disposition,
            pastel_credit_note_no: row.pastel_credit_note_no ?? null,
            reason: row.reason ?? null,
            notes: row.notes ?? null,
            customer_name: name ?? "—",
            line_count: countByReturn[row.id] ?? 0,
          };
        }) ?? [];
      setReturns(mapped);
    } catch (err: any) {
      console.error("Failed to load returns", err);
      setError(err?.message || "Failed to load returns.");
    } finally {
      setIsLoading(false);
    }
  }

  const filtered = dispositionFilter === "ALL"
    ? returns
    : returns.filter((r) => r.disposition === dispositionFilter);

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

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Customer Returns</h1>
          <p className="mt-1 text-slate-600">
            Record finished fabric returns (credit, refund, or exchange).
          </p>
        </div>
        <div className="flex gap-2">
          <BackButton href="/toolbox/orders" label="Back to Orders" />
          <Link href="/toolbox/orders/returns/new">
            <Button variant="primary">New Return</Button>
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-900 mb-2">Disposition</label>
          <select
            value={dispositionFilter}
            onChange={(e) => setDispositionFilter(e.target.value as typeof dispositionFilter)}
            className="w-full max-w-xs rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
          >
            <option value="ALL">All</option>
            <option value="CREDIT">Credit</option>
            <option value="REFUND">Refund</option>
            <option value="EXCHANGE">Exchange</option>
          </select>
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-3">
            {error}
          </div>
        )}
        {isLoading ? (
          <p className="text-sm text-slate-600">Loading returns...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-600">No returns found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Disposition</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Pastel CN</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Reason</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Rolls</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => (window.location.href = `/toolbox/orders/returns/${r.id}`)}
                  >
                    <td className="px-4 py-3 text-slate-700">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.customer_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.disposition === "CREDIT"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.disposition === "REFUND"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {r.disposition}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.pastel_credit_note_no ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{r.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{r.line_count}</td>
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
