"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface PurchaseRow {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  purchased_from: string | null;
  created_at: string;
  line_count: number;
  roll_count: number;
  total_metres: number;
  total_value: number;
}

export default function OutsourcedPurchasesListPage() {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchPurchases();
  }, []);

  async function fetchPurchases() {
    setIsLoading(true);
    setError(null);
    try {
      const { data: purchaseData, error: purchaseError } = await supabaseBrowserClient
        .from("finished_fabric_outsource_purchases")
        .select("id, invoice_no, invoice_date, purchased_from, created_at")
        .order("created_at", { ascending: false });

      if (purchaseError) throw purchaseError;

      const purchaseIds = (purchaseData || []).map((p) => p.id);
      if (purchaseIds.length === 0) {
        setPurchases([]);
        return;
      }

      const { data: linesData, error: linesError } = await supabaseBrowserClient
        .from("finished_fabric_outsource_purchase_lines")
        .select("id, purchase_id, cost_per_m_zar")
        .in("purchase_id", purchaseIds);

      if (linesError) throw linesError;

      const lines = linesData || [];
      const lineIds = lines.map((l) => l.id);

      let rolls: Array<{
        outsource_purchase_line_id: string | null;
        length_m: number;
        purchased_cost_per_m_zar: number | null;
      }> = [];

      if (lineIds.length > 0) {
        const { data: rollsData, error: rollsError } = await supabaseBrowserClient
          .from("finished_fabric_rolls")
          .select("outsource_purchase_line_id, length_m, purchased_cost_per_m_zar")
          .in("outsource_purchase_line_id", lineIds);

        if (rollsError) throw rollsError;
        rolls = rollsData || [];
      }

      const lineIdToPurchase = new Map<string, string>();
      const lineCost = new Map<string, number | null>();
      lines.forEach((l) => {
        lineIdToPurchase.set(l.id, l.purchase_id);
        lineCost.set(l.id, l.cost_per_m_zar != null ? Number(l.cost_per_m_zar) : null);
      });

      const statsByPurchase = new Map<
        string,
        { lineIds: Set<string>; roll_count: number; total_metres: number; total_value: number }
      >();

      purchaseIds.forEach((id) => {
        statsByPurchase.set(id, {
          lineIds: new Set(),
          roll_count: 0,
          total_metres: 0,
          total_value: 0,
        });
      });

      lines.forEach((l) => {
        const stats = statsByPurchase.get(l.purchase_id);
        if (stats) stats.lineIds.add(l.id);
      });

      rolls.forEach((r) => {
        const purchaseId = r.outsource_purchase_line_id
          ? lineIdToPurchase.get(r.outsource_purchase_line_id)
          : null;
        if (!purchaseId) return;
        const stats = statsByPurchase.get(purchaseId);
        if (!stats) return;
        const lengthM = Number(r.length_m || 0);
        const cost =
          r.purchased_cost_per_m_zar != null
            ? Number(r.purchased_cost_per_m_zar)
            : r.outsource_purchase_line_id
              ? lineCost.get(r.outsource_purchase_line_id) ?? null
              : null;
        stats.roll_count += 1;
        stats.total_metres += lengthM;
        if (cost != null) stats.total_value += lengthM * cost;
      });

      const rows: PurchaseRow[] = (purchaseData || []).map((p) => {
        const stats = statsByPurchase.get(p.id)!;
        return {
          id: p.id,
          invoice_no: p.invoice_no,
          invoice_date: p.invoice_date,
          purchased_from: p.purchased_from,
          created_at: p.created_at,
          line_count: stats.lineIds.size,
          roll_count: stats.roll_count,
          total_metres: stats.total_metres,
          total_value: stats.total_value,
        };
      });

      setPurchases(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load purchases.");
    } finally {
      setIsLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(
      (p) =>
        (p.invoice_no || "").toLowerCase().includes(q) ||
        (p.purchased_from || "").toLowerCase().includes(q),
    );
  }, [purchases, search]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="grid gap-6"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Outsourced Purchases</h1>
          <p className="mt-1 text-slate-600">
            Finished fabric bought from external suppliers.
          </p>
        </div>
        <motion.div className="flex items-center gap-3">
          <BackButton href="/toolbox/finished-fabric" label="Finished Fabric" />
          <Link href="/toolbox/finished-fabric/purchased/new">
            <Button variant="primary">Record New Purchase</Button>
          </Link>
        </motion.div>
      </div>

      <motion.section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice no or supplier…"
            className="w-full max-w-md rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
          />
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading purchases…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-slate-600">No outsourced purchases found.</p>
            <Link
              href="/toolbox/finished-fabric/purchased/new"
              className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              Record your first purchase →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Recorded</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Supplier</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Invoice date</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Lines</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Rolls</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Metres</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Est. value</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">
                      {new Date(p.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {p.purchased_from || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{p.invoice_no || "—"}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {p.invoice_date
                        ? new Date(p.invoice_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">{p.line_count}</td>
                    <td className="px-4 py-3 text-right text-slate-900">{p.roll_count}</td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {p.total_metres.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {p.total_value > 0 ? `R ${p.total_value.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/toolbox/finished-fabric/purchased/${p.id}`}
                        className="font-semibold text-teal-700 hover:text-teal-800"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}
