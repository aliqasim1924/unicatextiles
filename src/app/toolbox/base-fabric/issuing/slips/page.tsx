"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface SlipRow {
  id: string;
  slip_no: string | null;
  issue_date: string;
  from_location: string;
  to_location: string;
  roll_count: number;
}

export default function BaseFabricIssueSlipsPage() {
  const router = useRouter();
  const [slips, setSlips] = useState<SlipRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchSlips();
  }, [currentPage, searchTerm]);

  async function fetchSlips() {
    try {
      setIsLoading(true);
      setError(null);

      // Build base query
      let countQuery = supabaseBrowserClient
        .from("base_fabric_issue_slips")
        .select("id", { count: "exact", head: true });

      let dataQuery = supabaseBrowserClient
        .from("base_fabric_issue_slips")
        .select("id, slip_no, issue_date, from_location, to_location")
        .order("issue_date", { ascending: false })
        .range((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage - 1);

      // Apply search filter if provided
      if (searchTerm.trim()) {
        const searchPattern = `%${searchTerm.trim()}%`;
        countQuery = countQuery.ilike("slip_no", searchPattern);
        dataQuery = dataQuery.ilike("slip_no", searchPattern);
      }

      // Get total count for pagination
      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      const totalItems = count || 0;
      setTotalPages(Math.max(1, Math.ceil(totalItems / itemsPerPage)));

      // Fetch paginated data
      const { data, error: dataError } = await dataQuery;
      if (dataError) throw dataError;

      // Get roll counts for each slip
      const slipsWithCounts = await Promise.all(
        (data || []).map(async (slip) => {
          const { count: rollCount, error: countError } = await supabaseBrowserClient
            .from("base_fabric_issue_lines")
            .select("*", { count: "exact", head: true })
            .eq("slip_id", slip.id);

          if (countError) {
            console.error("Error counting rolls for slip:", slip.id, countError);
            return { ...slip, roll_count: 0 };
          }

          return {
            ...slip,
            roll_count: rollCount || 0,
          } as SlipRow;
        })
      );

      setSlips(slipsWithCounts);
    } catch (err: any) {
      setError(err.message || "Failed to load issue slips.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setCurrentPage(1); // Reset to first page on new search
    fetchSlips();
  }

  if (isLoading && slips.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading issue slips...</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Base Fabric Issue Slips</h1>
          <p className="mt-1 text-slate-600">View and manage all base fabric issue slips</p>
        </div>
        <BackButton href="/toolbox/base-fabric/issuing" label="Back to Issuing" />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Search */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by slip number..."
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
          />
          <Button type="submit" variant="primary">
            Search
          </Button>
          {searchTerm && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSearchTerm("");
                setCurrentPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </form>
      </motion.section>

      {/* Slips Table */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {slips.length === 0 ? (
          <p className="text-sm text-slate-600 text-center py-8">
            {searchTerm ? "No slips found matching your search." : "No issue slips yet."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Slip No</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">From → To</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-900">Rolls</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slips.map((slip) => (
                    <tr
                      key={slip.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-900 font-semibold">
                        {slip.slip_no || "N/A"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(slip.issue_date).toLocaleString("en-ZA", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {slip.from_location || "-"} → {slip.to_location || "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900 font-medium">
                        {slip.roll_count}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => router.push(`/toolbox/base-fabric/issuing/${slip.id}`)}
                            className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm text-teal-700 hover:bg-teal-100 transition-colors"
                          >
                            View
                          </button>
                          <button
                            onClick={() => {
                              window.open(`/toolbox/base-fabric/issuing/${slip.id}`, "_blank");
                              setTimeout(() => {
                                window.print();
                              }, 500);
                            }}
                            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            Print
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.section>
    </div>
  );
}
