"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";
import { motion } from "framer-motion";

const LOCATION_STORE = "FINISHED_STORE";
const STATUS_IN_STORE = "IN_STORE";
const STATUS_AWAITING_RECEIPT = "AWAITING_RECEIPT";
const LOCATION_COATING = "COATING";

interface StoreRoll {
  id: string;
  roll_no: string | null;
  length_m: number;
  grade: string | null;
  batch_no: string | null;
  color: string | null;
  gsm: number | null;
  coating_type: string | null;
}

export default function FinishedFabricStorePage() {
  const [awaitingReceiptRolls, setAwaitingReceiptRolls] = useState<StoreRoll[]>([]);
  const [inStoreRolls, setInStoreRolls] = useState<StoreRoll[]>([]);
  const [issuings, setIssuings] = useState<any[]>([]);
  const [issueReturns, setIssueReturns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"awaiting" | "inStore" | "issuings" | "returns">("awaiting");
  const lastFetchRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);

  const fetchData = useCallback(async () => {
    // Prevent rapid successive calls (debounce: max once per 500ms)
    const now = Date.now();
    if (isFetchingRef.current || now - lastFetchRef.current < 500) {
      return;
    }
    isFetchingRef.current = true;
    lastFetchRef.current = now;

    try {
      setIsLoading(true);
      setError(null);

      // Fetch awaiting receipt rolls
      const { data: awaitingData, error: awaitingError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select(
          `
          id,
          roll_no,
          length_m,
          grade,
          color,
          gsm,
          coating_type,
          batch_id,
          status,
          current_location,
          coating_batches (
            batch_no
          )
        `
        )
        .eq("status", STATUS_AWAITING_RECEIPT)
        .eq("current_location", LOCATION_COATING)
        .order("created_at", { ascending: false });

      if (awaitingError) throw awaitingError;

      // Fetch in store rolls
      const { data: inStoreData, error: inStoreError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select(
          `
          id,
          roll_no,
          length_m,
          grade,
          color,
          gsm,
          coating_type,
          batch_id,
          status,
          current_location,
          coating_batches (
            batch_no
          )
        `
        )
        .eq("status", STATUS_IN_STORE)
        .eq("current_location", LOCATION_STORE)
        .order("created_at", { ascending: false });

      if (inStoreError) throw inStoreError;

      const mapRolls = (data: any[]): StoreRoll[] =>
        (data || []).map((row: any) => {
          const batch = Array.isArray(row.coating_batches)
            ? row.coating_batches[0]
            : row.coating_batches;
          return {
            id: row.id as string,
            roll_no: row.roll_no ?? null,
            length_m: Number(row.length_m || 0),
            grade: row.grade ?? null,
            batch_no: batch?.batch_no ?? null,
            color: row.color ?? null,
            gsm: row.gsm ? Number(row.gsm) : null,
            coating_type: row.coating_type ?? null,
          };
        });

      setAwaitingReceiptRolls(mapRolls(awaitingData || []));
      setInStoreRolls(mapRolls(inStoreData || []));

      // Fetch issuings
      const { data: issuingsData, error: issuingsError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .select(
          `
          id,
          issue_no,
          issue_time,
          destination,
          reference,
          notes,
          order_id,
          invoice_no,
          gate_pass_no,
          customer_orders:order_id (
            order_ref,
            customers:customer_id (
              name
            )
          ),
          finished_fabric_store_issue_items (
            id,
            length_m
          )
        `
        )
        .order("issue_time", { ascending: false })
        .limit(50);

      if (issuingsError) throw issuingsError;

      const mappedIssuings = (issuingsData || []).map((issue: any) => {
        const order = Array.isArray(issue.customer_orders) ? issue.customer_orders[0] : issue.customer_orders;
        const customer = order?.customers
          ? Array.isArray(order.customers)
            ? order.customers[0]
            : order.customers
          : null;
        const items = issue.finished_fabric_store_issue_items || [];
        const totalMeters = items.reduce((sum: number, item: any) => sum + Number(item.length_m || 0), 0);

        return {
          id: issue.id,
          issue_no: issue.issue_no,
          issue_time: issue.issue_time,
          destination: issue.destination,
          reference: issue.reference,
          notes: issue.notes,
          order_ref: order?.order_ref || null,
          customer_name: customer?.name || null,
          invoice_no: issue.invoice_no,
          gate_pass_no: issue.gate_pass_no,
          items_count: items.length,
          total_meters: totalMeters,
        };
      });

      setIssuings(mappedIssuings);

      // Fetch issue returns (last 50)
      // NOTE: We intentionally avoid embedding finished_fabric_store_issues here because
      // PostgREST can throw "table name specified more than once" for this relationship
      // in some environments. We'll load issues in a second query instead.
      const { data: returnsData, error: returnsError } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_returns")
        .select(
          `
          id,
          return_no,
          return_time,
          reason,
          notes,
          issue_id,
          finished_fabric_store_issue_return_items (
            id,
            length_m
          )
        `,
        )
        .order("return_time", { ascending: false })
        .limit(50);

      if (returnsError) throw returnsError;

      const returnRows = (returnsData || []) as any[];
      const issueIds = [
        ...new Set(returnRows.map((r) => r.issue_id).filter(Boolean)),
      ] as string[];

      let issueById: Record<string, any> = {};
      if (issueIds.length > 0) {
        const { data: issueRows, error: issueError } = await supabaseBrowserClient
          .from("finished_fabric_store_issues")
          .select("id, issue_no, destination, reference")
          .in("id", issueIds);
        if (issueError) throw issueError;
        (issueRows || []).forEach((row: any) => {
          issueById[row.id] = row;
        });
      }

      const mappedReturns = returnRows.map((ret: any) => {
        const issue = ret.issue_id ? issueById[ret.issue_id] : null;
        const items = ret.finished_fabric_store_issue_return_items || [];
        const totalMeters = items.reduce(
          (sum: number, item: any) => sum + Number(item.length_m || 0),
          0,
        );
        return {
          id: ret.id,
          return_no: ret.return_no ?? null,
          return_time: ret.return_time,
          reason: ret.reason ?? null,
          issue_no: issue?.issue_no ?? null,
          destination: issue?.destination ?? null,
          reference: issue?.reference ?? null,
          rolls_count: items.length,
          total_meters: totalMeters,
        };
      });

      setIssueReturns(mappedReturns);
    } catch (err: any) {
      console.error("Failed to load store data", err);
      const message = err?.message || JSON.stringify(err) || "Failed to load store data.";
      setError(message);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch when page becomes visible or window gains focus (user navigates back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchData();
      }
    };
    const handleFocus = () => {
      fetchData();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchData]);

  // Compute totals and breakdowns
  const awaitingTotals = useMemo(() => {
    const rollsCount = awaitingReceiptRolls.length;
    const metersTotal = awaitingReceiptRolls.reduce((sum, roll) => sum + roll.length_m, 0);
    return { rollsCount, metersTotal };
  }, [awaitingReceiptRolls]);

  const inStoreTotals = useMemo(() => {
    const rollsCount = inStoreRolls.length;
    const metersTotal = inStoreRolls.reduce((sum, roll) => sum + roll.length_m, 0);
    return { rollsCount, metersTotal };
  }, [inStoreRolls]);

  // Breakdown by GSM
  const inStoreByGsm = useMemo(() => {
    const grouped: Record<string, { rollsCount: number; metersTotal: number }> = {};
    inStoreRolls.forEach((roll) => {
      const key = roll.gsm?.toString() || "Unknown";
      if (!grouped[key]) {
        grouped[key] = { rollsCount: 0, metersTotal: 0 };
      }
      grouped[key].rollsCount += 1;
      grouped[key].metersTotal += roll.length_m;
    });
    return Object.entries(grouped)
      .map(([gsm, stats]) => ({ gsm, ...stats }))
      .sort((a, b) => {
        if (a.gsm === "Unknown") return 1;
        if (b.gsm === "Unknown") return -1;
        return Number(a.gsm) - Number(b.gsm);
      });
  }, [inStoreRolls]);

  // Breakdown by Colour
  const inStoreByColor = useMemo(() => {
    const grouped: Record<string, { rollsCount: number; metersTotal: number }> = {};
    inStoreRolls.forEach((roll) => {
      const key = roll.color?.trim() || "Unknown";
      if (!grouped[key]) {
        grouped[key] = { rollsCount: 0, metersTotal: 0 };
      }
      grouped[key].rollsCount += 1;
      grouped[key].metersTotal += roll.length_m;
    });
    return Object.entries(grouped)
      .map(([color, stats]) => ({ color, ...stats }))
      .sort((a, b) => a.color.localeCompare(b.color));
  }, [inStoreRolls]);

  // Breakdown by Coating Type
  const inStoreByType = useMemo(() => {
    const grouped: Record<string, { rollsCount: number; metersTotal: number }> = {};
    inStoreRolls.forEach((roll) => {
      const key = roll.coating_type?.trim() || "Unknown";
      if (!grouped[key]) {
        grouped[key] = { rollsCount: 0, metersTotal: 0 };
      }
      grouped[key].rollsCount += 1;
      grouped[key].metersTotal += roll.length_m;
    });
    return Object.entries(grouped)
      .map(([type, stats]) => ({ type, ...stats }))
      .sort((a, b) => a.type.localeCompare(b.type));
  }, [inStoreRolls]);

  // Breakdown by Grade (A, B, C, Scrap)
  const inStoreByGrade = useMemo(() => {
    const grades = ["A", "B", "C", "SCRAP"] as const;
    const grouped: Record<string, { rollsCount: number; metersTotal: number }> = {};
    grades.forEach((g) => {
      grouped[g] = { rollsCount: 0, metersTotal: 0 };
    });
    grouped["Other"] = { rollsCount: 0, metersTotal: 0 };
    inStoreRolls.forEach((roll) => {
      const key = roll.grade && grades.includes(roll.grade as any) ? roll.grade : "Other";
      grouped[key].rollsCount += 1;
      grouped[key].metersTotal += roll.length_m;
    });
    return [
      { grade: "A", ...grouped["A"] },
      { grade: "B", ...grouped["B"] },
      { grade: "C", ...grouped["C"] },
      { grade: "Scrap", ...grouped["SCRAP"] },
      ...(grouped["Other"].rollsCount > 0 ? [{ grade: "Other", ...grouped["Other"] }] : []),
    ];
  }, [inStoreRolls]);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Finished Fabric Store</h1>
          <p className="mt-1 text-slate-600">Control receipts and issues for finished rolls.</p>
        </div>
        <BackButton href="/toolbox/finished-fabric" label="Back to Finished Fabric" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/toolbox/finished-fabric/store/receive" className="w-full">
            <Button variant="primary" className="w-full">
              Receive into Store
            </Button>
          </Link>
          <Link href="/toolbox/finished-fabric/store/issue" className="w-full">
            <Button variant="primary" className="w-full">
              Issue from Store
            </Button>
          </Link>
          <Link href="/toolbox/finished-fabric/store/returns/new" className="w-full">
            <Button variant="secondary" className="w-full">
              Return Issue Slip
            </Button>
          </Link>
        </div>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <Link href="/toolbox/finished-fabric/store/cleanup-duplicates" className="text-sm text-amber-700 hover:text-amber-800 font-semibold">
            Cleanup Duplicate Issues →
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            Utility to find and remove duplicate issues and restore stock figures
          </p>
        </div>
      </motion.section>

      {/* Tabs */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("awaiting")}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "awaiting"
                  ? "border-b-2 border-teal-700 text-teal-700"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Awaiting Receipt ({awaitingReceiptRolls.length})
            </button>
            <button
              onClick={() => setActiveTab("inStore")}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "inStore"
                  ? "border-b-2 border-teal-700 text-teal-700"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              In Store ({inStoreRolls.length})
            </button>
            <button
              onClick={() => setActiveTab("issuings")}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "issuings"
                  ? "border-b-2 border-teal-700 text-teal-700"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Issuings ({issuings.length})
            </button>
            <button
              onClick={() => setActiveTab("returns")}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "returns"
                  ? "border-b-2 border-teal-700 text-teal-700"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Returns ({issueReturns.length})
            </button>
          </div>
          <Button variant="secondary" onClick={fetchData} isLoading={isLoading}>
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : (
          <>
            {/* Awaiting Receipt Tab */}
            {activeTab === "awaiting" && (
              <div>
                {awaitingReceiptRolls.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-slate-600">No rolls awaiting receipt.</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Rolls will appear here after they are created during rolling/inspection.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Summary Card */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium text-slate-500">Total Rolls</p>
                          <p className="text-2xl font-semibold text-slate-900">
                            {awaitingTotals.rollsCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Total Meters</p>
                          <p className="text-2xl font-semibold text-slate-900">
                            {awaitingTotals.metersTotal.toFixed(3)} m
                          </p>
                        </div>
                      </div>
                    </motion.div>

                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-sm text-slate-600">
                        {awaitingReceiptRolls.length} roll(s) awaiting store receipt acknowledgement
                      </p>
                      <Link href="/toolbox/finished-fabric/store/receive">
                        <Button variant="primary">Receive into Store</Button>
                      </Link>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-900">Length (m)</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-900">Batch</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-900">Colour</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-900">GSM</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-900">Coating Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {awaitingReceiptRolls.map((roll) => (
                            <tr key={roll.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {roll.roll_no || "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-900">{roll.length_m.toFixed(3)}</td>
                              <td className="px-4 py-3 text-slate-900">{roll.grade || "—"}</td>
                              <td className="px-4 py-3 text-slate-900">{roll.batch_no || "—"}</td>
                              <td className="px-4 py-3 text-slate-900">{roll.color || "—"}</td>
                              <td className="px-4 py-3 text-slate-900">
                                {roll.gsm ? roll.gsm.toString() : "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-900">{roll.coating_type || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* In Store Tab */}
            {activeTab === "inStore" && (
              <div>
                {inStoreRolls.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-slate-600">No rolls currently in store.</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Rolls will appear here after they are received into the store.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Summary Card */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <h3 className="mb-4 text-lg font-semibold text-slate-900">Summary</h3>
                      
                      {/* Totals */}
                      <div className="mb-6 grid gap-4 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-medium text-slate-500">Total Rolls</p>
                          <p className="text-2xl font-semibold text-slate-900">
                            {inStoreTotals.rollsCount}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-medium text-slate-500">Total Meters</p>
                          <p className="text-2xl font-semibold text-slate-900">
                            {inStoreTotals.metersTotal.toFixed(3)} m
                          </p>
                        </div>
                      </div>

                      {/* Breakdown Tables */}
                      <div className="grid gap-4 lg:grid-cols-3">
                        {/* By GSM */}
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <h4 className="mb-2 text-sm font-semibold text-slate-700">By GSM</h4>
                          <div className="space-y-1">
                            {inStoreByGsm.length === 0 ? (
                              <p className="text-xs text-slate-500">No data</p>
                            ) : (
                              inStoreByGsm.map((item) => (
                                <div
                                  key={item.gsm}
                                  className="flex items-center justify-between border-b border-slate-200 pb-1 text-xs"
                                >
                                  <span className="font-medium text-slate-700">{item.gsm}</span>
                                  <span className="text-slate-600">
                                    {item.rollsCount} roll{item.rollsCount !== 1 ? "s" : ""} •{" "}
                                    {item.metersTotal.toFixed(2)}m
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* By Colour */}
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <h4 className="mb-2 text-sm font-semibold text-slate-700">By Colour</h4>
                          <div className="space-y-1">
                            {inStoreByColor.length === 0 ? (
                              <p className="text-xs text-slate-500">No data</p>
                            ) : (
                              inStoreByColor.map((item) => (
                                <div
                                  key={item.color}
                                  className="flex items-center justify-between border-b border-slate-200 pb-1 text-xs"
                                >
                                  <span className="font-medium text-slate-700">{item.color}</span>
                                  <span className="text-slate-600">
                                    {item.rollsCount} roll{item.rollsCount !== 1 ? "s" : ""} •{" "}
                                    {item.metersTotal.toFixed(2)}m
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* By Coating Type */}
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <h4 className="mb-2 text-sm font-semibold text-slate-700">By Coating Type</h4>
                          <div className="space-y-1">
                            {inStoreByType.length === 0 ? (
                              <p className="text-xs text-slate-500">No data</p>
                            ) : (
                              inStoreByType.map((item) => (
                                <div
                                  key={item.type}
                                  className="flex items-center justify-between border-b border-slate-200 pb-1 text-xs"
                                >
                                  <span className="font-medium text-slate-700">{item.type}</span>
                                  <span className="text-slate-600">
                                    {item.rollsCount} roll{item.rollsCount !== 1 ? "s" : ""} •{" "}
                                    {item.metersTotal.toFixed(2)}m
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* By Grade (A, B, C, Scrap) */}
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <h4 className="mb-2 text-sm font-semibold text-slate-700">By Grade</h4>
                          <div className="space-y-1">
                            {inStoreByGrade.map((item) => (
                              <div
                                key={item.grade}
                                className="flex items-center justify-between border-b border-slate-200 pb-1 text-xs"
                              >
                                <span className="font-medium text-slate-700">{item.grade}</span>
                                <span className="text-slate-600">
                                  {item.rollsCount} roll{item.rollsCount !== 1 ? "s" : ""} •{" "}
                                  {item.metersTotal.toFixed(2)}m
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>

                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Length (m)</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Batch</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Colour</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">GSM</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Coating Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inStoreRolls.map((roll) => (
                          <tr key={roll.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {roll.roll_no || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-900">{roll.length_m.toFixed(3)}</td>
                            <td className="px-4 py-3 text-slate-900">{roll.grade || "—"}</td>
                            <td className="px-4 py-3 text-slate-900">{roll.batch_no || "—"}</td>
                            <td className="px-4 py-3 text-slate-900">{roll.color || "—"}</td>
                            <td className="px-4 py-3 text-slate-900">
                              {roll.gsm ? roll.gsm.toString() : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-900">{roll.coating_type || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Issuings Tab */}
            {activeTab === "issuings" && (
              <div>
                {issuings.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-slate-600">No issuings recorded yet.</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Issuings will appear here after rolls are issued from the store.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Issue No</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Date/Time</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Destination</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Reference</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Order</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Customer</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">Rolls</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">Meters</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {issuings.map((issue) => (
                          <tr key={issue.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {issue.issue_no ? `FFSI-${String(issue.issue_no).padStart(6, "0")}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {new Date(issue.issue_time).toLocaleString("en-ZA", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {issue.destination === "CUSTOMER"
                                ? "Customer"
                                : issue.destination === "DISPATCH"
                                ? "Dispatch"
                                : issue.destination === "INTERNAL"
                                ? "Internal"
                                : issue.destination || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{issue.reference || "—"}</td>
                            <td className="px-4 py-3 text-slate-600">{issue.order_ref || "—"}</td>
                            <td className="px-4 py-3 text-slate-600">{issue.customer_name || "—"}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{issue.items_count}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              {issue.total_meters.toFixed(3)} m
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/toolbox/finished-fabric/store/issues/${issue.id}`}
                                className="text-teal-700 hover:text-teal-800 text-sm font-semibold"
                              >
                                View &amp; Print
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Returns Tab */}
            {activeTab === "returns" && (
              <div>
                {issueReturns.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-slate-600">No issue returns recorded yet.</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Returns will appear here after you return an issue slip.
                    </p>
                    <div className="mt-4">
                      <Link href="/toolbox/finished-fabric/store/returns/new">
                        <Button variant="primary">Return Issue Slip</Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Return No
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Date/Time
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Original Issue
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Destination
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Reference
                          </th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">
                            Rolls
                          </th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-900">
                            Meters
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Reason
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-900">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {issueReturns.map((ret) => (
                          <tr
                            key={ret.id}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {ret.return_no != null
                                ? `FFIR-${String(ret.return_no).padStart(6, "0")}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {new Date(ret.return_time).toLocaleString("en-ZA", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {ret.issue_no != null
                                ? `FFSI-${String(ret.issue_no).padStart(6, "0")}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {ret.destination === "CUSTOMER"
                                ? "Customer"
                                : ret.destination === "DISPATCH"
                                  ? "Dispatch"
                                  : ret.destination === "INTERNAL"
                                    ? "Internal"
                                    : ret.destination || "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {ret.reference || "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">
                              {ret.rolls_count}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              {Number(ret.total_meters || 0).toFixed(3)} m
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {ret.reason || "—"}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/toolbox/finished-fabric/store/returns/${ret.id}`}
                                className="text-teal-700 hover:text-teal-800 text-sm font-semibold"
                              >
                                View &amp; Print
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </motion.section>
    </div>
  );
}

