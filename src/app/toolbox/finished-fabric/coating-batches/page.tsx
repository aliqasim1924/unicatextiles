"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

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
              {batches.map((batch) => (
                <tr
                  key={batch.id}
                  onClick={() => router.push(`/toolbox/finished-fabric/coating-batches/${batch.id}`)}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
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
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}

