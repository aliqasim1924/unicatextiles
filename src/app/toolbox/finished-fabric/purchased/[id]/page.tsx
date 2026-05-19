"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { BackButton } from "@/components/navigation/BackButton";

interface Purchase {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  purchased_from: string | null;
  notes: string | null;
  created_at: string;
}

interface PurchaseLine {
  id: string;
  cost_per_m_zar: number | null;
  sort_order: number;
  fabric_types?: { name: string; code: string } | null;
  fabric_type_color_options?: { color_name: string } | null;
  fabric_type_gsm_options?: { gsm: number } | null;
  fabric_type_width_options?: { width_mm: number } | null;
}

interface PurchaseRoll {
  id: string;
  roll_no: string | null;
  length_m: number;
  grade: string | null;
  color: string | null;
  gsm: number | null;
  coating_type: string | null;
  purchased_cost_per_m_zar: number | null;
  outsource_purchase_line_id: string | null;
}

export default function PurchasedFinishedFabricDetailPage() {
  const params = useParams();
  const purchaseId = params?.id as string;

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [rolls, setRolls] = useState<PurchaseRoll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!purchaseId) return;
    loadPurchase();
  }, [purchaseId]);

  async function loadPurchase() {
    setIsLoading(true);
    setError(null);
    try {
      const { data: purchaseData, error: purchaseError } = await supabaseBrowserClient
        .from("finished_fabric_outsource_purchases")
        .select("id, invoice_no, invoice_date, purchased_from, notes, created_at")
        .eq("id", purchaseId)
        .single();

      if (purchaseError) throw purchaseError;

      const { data: linesData, error: linesError } = await supabaseBrowserClient
        .from("finished_fabric_outsource_purchase_lines")
        .select(
          `
          id,
          cost_per_m_zar,
          sort_order,
          fabric_types:fabric_type_id ( name, code ),
          fabric_type_color_options:color_option_id ( color_name ),
          fabric_type_gsm_options:gsm_option_id ( gsm ),
          fabric_type_width_options:width_option_id ( width_mm )
        `,
        )
        .eq("purchase_id", purchaseId)
        .order("sort_order", { ascending: true });

      if (linesError) throw linesError;

      const lineRows = (linesData || []) as unknown as PurchaseLine[];
      const lineIds = lineRows.map((l) => l.id);

      let rollRows: PurchaseRoll[] = [];
      if (lineIds.length > 0) {
        const { data: rollsData, error: rollsError } = await supabaseBrowserClient
          .from("finished_fabric_rolls")
          .select(
            "id, roll_no, length_m, grade, color, gsm, coating_type, purchased_cost_per_m_zar, outsource_purchase_line_id",
          )
          .in("outsource_purchase_line_id", lineIds)
          .order("roll_no", { ascending: true });

        if (rollsError) throw rollsError;
        rollRows = (rollsData as PurchaseRoll[]) || [];
      }

      setPurchase(purchaseData as Purchase);
      setLines(lineRows);
      setRolls(rollRows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load purchase.");
    } finally {
      setIsLoading(false);
    }
  }

  const rollsByLine = useMemo(() => {
    const map: Record<string, PurchaseRoll[]> = {};
    rolls.forEach((r) => {
      const key = r.outsource_purchase_line_id || "";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [rolls]);

  const totals = useMemo(() => {
    const totalMetres = rolls.reduce((sum, r) => sum + Number(r.length_m || 0), 0);
    const totalValue = rolls.reduce((sum, r) => {
      const cost = r.purchased_cost_per_m_zar;
      if (cost == null) return sum;
      return sum + Number(r.length_m || 0) * Number(cost);
    }, 0);
    return { totalMetres, totalValue, rollCount: rolls.length };
  }, [rolls]);

  function unwrap<T>(val: T | T[] | null | undefined): T | null {
    if (val == null) return null;
    return Array.isArray(val) ? val[0] ?? null : val;
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600">Loading purchase...</p>;
  }

  if (error || !purchase) {
    return (
      <motion.div className="grid gap-4">
        <p className="text-sm text-red-600">{error || "Purchase not found."}</p>
        <BackButton href="/toolbox/finished-fabric" label="Back to Finished Fabric" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="grid gap-8"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">
            Outsourced Finished Fabric Purchase
          </h1>
          <p className="mt-1 text-slate-600">
            {purchase.purchased_from || "Supplier"} — recorded{" "}
            {new Date(purchase.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/toolbox/finished-fabric/purchased"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800"
          >
            All purchases
          </Link>
          <Link
            href="/toolbox/finished-fabric/purchased/new"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800"
          >
            Record another
          </Link>
          <BackButton href="/toolbox/finished-fabric" label="Finished Fabric" />
        </div>
      </div>

      <motion.section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Invoice</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">Supplier</p>
            <p className="mt-1 text-slate-900">{purchase.purchased_from || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">Invoice No</p>
            <p className="mt-1 text-slate-900">{purchase.invoice_no || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">Invoice Date</p>
            <p className="mt-1 text-slate-900">
              {purchase.invoice_date
                ? new Date(purchase.invoice_date).toLocaleDateString()
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">Totals</p>
            <p className="mt-1 text-slate-900">
              {totals.rollCount} roll(s), {totals.totalMetres.toFixed(3)} m
              {totals.totalValue > 0 && (
                <span className="block text-sm text-slate-600">
                  Est. value R {totals.totalValue.toFixed(2)}
                </span>
              )}
            </p>
          </div>
        </div>
        {purchase.notes && (
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-500 uppercase">Notes</p>
            <p className="mt-1 text-slate-900 whitespace-pre-wrap">{purchase.notes}</p>
          </div>
        )}
      </motion.section>

      {lines.map((line, idx) => {
        const type = unwrap(line.fabric_types);
        const color = unwrap(line.fabric_type_color_options);
        const gsm = unwrap(line.fabric_type_gsm_options);
        const width = unwrap(line.fabric_type_width_options);
        const lineRolls = rollsByLine[line.id] || [];
        const lineMetres = lineRolls.reduce((s, r) => s + Number(r.length_m || 0), 0);
        const cost = line.cost_per_m_zar;

        return (
          <motion.section
            key={line.id}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Line {idx + 1}: {type?.name || "Fabric"}
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              {color?.color_name || "—"} · GSM {gsm?.gsm ?? "—"} ·{" "}
              {width?.width_mm ? `${width.width_mm} mm` : "—"}
              {cost != null && (
                <span className="ml-2 font-medium text-slate-800">
                  · R {Number(cost).toFixed(2)} / m
                </span>
              )}
              <span className="ml-2">
                ({lineRolls.length} roll(s), {lineMetres.toFixed(3)} m)
              </span>
            </p>

            {lineRolls.length === 0 ? (
              <p className="text-sm text-slate-500">No rolls linked to this line.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-2 text-left font-semibold">Roll No</th>
                      <th className="px-4 py-2 text-left font-semibold">Length (m)</th>
                      <th className="px-4 py-2 text-left font-semibold">Grade</th>
                      <th className="px-4 py-2 text-left font-semibold">Line value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineRolls.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="px-4 py-2 font-medium">{r.roll_no || "—"}</td>
                        <td className="px-4 py-2">{Number(r.length_m).toFixed(3)}</td>
                        <td className="px-4 py-2">{r.grade || "—"}</td>
                        <td className="px-4 py-2">
                          {cost != null
                            ? `R ${(Number(r.length_m) * Number(cost)).toFixed(2)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.section>
        );
      })}

      <motion.div className="flex gap-3">
        <Link
          href="/toolbox/finished-fabric/store"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800"
        >
          View Finished Store →
        </Link>
      </motion.div>
    </motion.div>
  );
}
