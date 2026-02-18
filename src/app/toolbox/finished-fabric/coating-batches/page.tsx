"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";
import { DateRangeFilter, isDateInRange } from "@/components/ui/DateRangeFilter";

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return date.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

interface CoatingBatch {
  id: string;
  batch_no: string | null;
  batch_date: string;
  coating_type: string;
  color: string | null;
  gsm: number | null;
  planned_meters: number | null;
  actual_coated_meters: number | null;
  status: string;
}

export default function CoatingBatchesPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<CoatingBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchBatches();
  }, []);

  async function fetchBatches() {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabaseBrowserClient
        .from("coating_batches")
        .select(
          `
          id,
          batch_no,
          batch_date,
          coating_type,
          color,
          gsm,
          planned_meters,
          actual_coated_meters,
          status
        `
        )
        .order("batch_date", { ascending: false });

      if (fetchError) throw fetchError;
      setBatches(data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load coating batches");
      console.error("Error fetching batches:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function formatDate(dateString: string) {
    try {
      return new Date(dateString).toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  }

  function getStatusBadgeColor(status: string) {
    switch (status) {
      case "PLANNED":
        return "bg-blue-100 text-blue-800";
      case "RUNNING":
        return "bg-yellow-100 text-yellow-800";
      case "COATED":
        return "bg-green-100 text-green-800";
      case "ROLLED":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-slate-100 text-slate-800";
    }
  }

  const filteredBatches = useMemo(() => {
    if (!dateFrom && !dateTo) return batches;
    return batches.filter((b) => isDateInRange(b.batch_date, dateFrom, dateTo));
  }, [batches, dateFrom, dateTo]);

  const batchesByMonth = useMemo(() => {
    const map = new Map<string, CoatingBatch[]>();
    filteredBatches.forEach((b) => {
      const key = getMonthKey(b.batch_date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredBatches]);

  function toggleMonth(monthKey: string) {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <BackButton href="/toolbox/finished-fabric" />
          <h1 className="mt-4 text-3xl font-semibold text-slate-900">Coating Batches</h1>
          <p className="mt-2 text-slate-600">View and manage coating production batches.</p>
        </div>
        <Link href="/toolbox/finished-fabric/coating-batches/new">
          <Button variant="primary">New Coating Batch</Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      {/* Filters: date range, print, clear dates */}
      {!isLoading && batches.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:hidden"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-end lg:gap-6">
              <DateRangeFilter
                from={dateFrom}
                to={dateTo}
                onFromChange={setDateFrom}
                onToChange={setDateTo}
                label="Date range (for list and print)"
                showAllHint={true}
                className="lg:min-w-0 lg:flex-1"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
                Print report
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="print:hidden"
                disabled={!dateFrom && !dateTo}
              >
                Clear dates
              </Button>
            </div>
          </div>
        </motion.section>
      )}

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
          Loading batches...
        </div>
      ) : batches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-slate-200 bg-white p-8 text-center"
        >
          <p className="text-slate-600">No coating batches found.</p>
          <Link href="/toolbox/finished-fabric/coating-batches/new" className="mt-4 inline-block">
            <Button variant="primary">Create First Batch</Button>
          </Link>
        </motion.div>
      ) : filteredBatches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-slate-200 bg-white p-8 text-center"
        >
          <p className="text-slate-600">No coating batches in the selected date range.</p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Batch No
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Date
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Coating Type
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Colour
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  GSM
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Planned (m)
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Actual Coated (m)
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {batchesByMonth.map(([monthKey, monthBatches]) => {
                const isCollapsed = collapsedMonths.has(monthKey);
                return (
                  <React.Fragment key={monthKey}>
                    <tr className="border-b border-slate-200 bg-slate-100/80">
                      <td colSpan={8} className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleMonth(monthKey)}
                          className="flex items-center gap-2 text-left w-full font-semibold text-slate-800 hover:text-teal-700 transition"
                        >
                          <span className="text-slate-500 select-none w-5">
                            {isCollapsed ? "▶" : "▼"}
                          </span>
                          {formatMonthLabel(monthKey)}
                          <span className="text-slate-500 font-normal text-sm">
                            ({monthBatches.length} batch{monthBatches.length !== 1 ? "es" : ""})
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      monthBatches.map((batch) => (
                        <tr
                          key={batch.id}
                          onClick={() => router.push(`/toolbox/finished-fabric/coating-batches/${batch.id}`)}
                          className="cursor-pointer transition-colors hover:bg-slate-50"
                        >
                          <td className="whitespace-nowrap pl-9 pr-4 py-3 text-sm font-medium text-slate-900">
                            {batch.batch_no ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                            {formatDate(batch.batch_date)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                            {batch.coating_type}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                            {batch.color ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                            {batch.gsm ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">
                            {batch.planned_meters ? batch.planned_meters.toFixed(2) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">
                            {batch.actual_coated_meters ? batch.actual_coated_meters.toFixed(2) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeColor(batch.status)}`}
                            >
                              {batch.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}

