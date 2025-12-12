"use client";

import { useEffect, useState } from "react";
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"awaiting" | "inStore">("awaiting");

  useEffect(() => {
    fetchData();
  }, []);

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
  }, []);

  async function fetchData() {
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
    } catch (err: any) {
      console.error("Failed to load store data", err);
      const message = err?.message || JSON.stringify(err) || "Failed to load store data.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

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
          <Button variant="secondary" className="w-full" disabled>
            Dispatch Planning (coming soon)
          </Button>
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
                )}
              </div>
            )}
          </>
        )}
      </motion.section>
    </div>
  );
}

