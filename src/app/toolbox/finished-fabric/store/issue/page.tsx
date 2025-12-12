"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

const LOCATION_STORE = "FINISHED_STORE";
const STATUS_IN_STORE = "IN_STORE";
const LOCATION_DISPATCHED = "DISPATCHED";
const STATUS_ISSUED = "ISSUED";

type GradeFilter = "ALL" | "A" | "B" | "C" | "SCRAP";

interface StoreRoll {
  id: string;
  roll_no: string | null;
  length_m: number;
  grade: string | null;
}

export default function FinishedFabricStoreIssuePage() {
  const router = useRouter();
  const [stockRolls, setStockRolls] = useState<StoreRoll[]>([]);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set());
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [destination, setDestination] = useState("DISPATCH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchStock();
  }, []);

  async function fetchStock() {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select("id, roll_no, length_m, grade, status, current_location")
        .eq("status", STATUS_IN_STORE)
        .eq("current_location", LOCATION_STORE)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const mapped: StoreRoll[] =
        (data || []).map((row: any) => ({
          id: row.id as string,
          roll_no: row.roll_no ?? null,
          length_m: Number(row.length_m || 0),
          grade: row.grade ?? null,
        })) || [];

      setStockRolls(mapped);
      setSelectedRollIds(new Set());
    } catch (err: any) {
      console.error("Failed to load store stock", err);
      const message = err?.message || JSON.stringify(err) || "Failed to load store stock.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredRolls = useMemo(() => {
    return stockRolls.filter((roll) => {
      const matchesGrade = gradeFilter === "ALL" || roll.grade === gradeFilter;
      const matchesSearch =
        searchTerm.trim() === "" ||
        (roll.roll_no || "").toLowerCase().includes(searchTerm.trim().toLowerCase());
      return matchesGrade && matchesSearch;
    });
  }, [stockRolls, gradeFilter, searchTerm]);

  const selectedRolls = useMemo(
    () => filteredRolls.filter((r) => selectedRollIds.has(r.id)),
    [filteredRolls, selectedRollIds]
  );

  function toggleSelect(id: string) {
    setSelectedRollIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (selectedRollIds.size === 0) {
      setError("Select at least one roll to issue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabaseBrowserClient.auth.getUser();

      const { data: issue, error: issueError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .insert({
          issued_by: userData?.user?.id || null,
          destination: destination || null,
          reference: reference || null,
          notes: notes || null,
        })
        .select("id, issue_no")
        .single();

      if (issueError) throw issueError;

      const lineRows = selectedRolls.map((roll) => ({
        issue_id: issue.id,
        roll_id: roll.id,
        roll_no: roll.roll_no,
        length_m: roll.length_m,
        grade: roll.grade,
      }));

      const { error: lineError } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_items")
        .insert(lineRows);
      if (lineError) throw lineError;

      const { error: updateError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .update({
          current_location: LOCATION_DISPATCHED,
          status: STATUS_ISSUED,
          issued_store_at: new Date().toISOString(),
          issued_store_by: userData?.user?.id || null,
        })
        .in("id", Array.from(selectedRollIds));
      if (updateError) throw updateError;

      setSuccess("Store issue created.");
      router.push(`/toolbox/finished-fabric/store/issues/${issue.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create store issue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Issue from Finished Store</h1>
          <p className="mt-1 text-slate-600">
            Select rolls in store to issue for dispatch or internal use.
          </p>
        </div>
        <BackButton href="/toolbox/finished-fabric/store" label="Back to Store" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {success}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Destination</label>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              >
                <option value="DISPATCH">Dispatch</option>
                <option value="CUSTOMER">Customer</option>
                <option value="INTERNAL">Internal</option>
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Reference</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Optional dispatch/customer ref"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Optional notes"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Grade</label>
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value as GradeFilter)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                >
                  <option value="ALL">All</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="SCRAP">Scrap</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Search Roll</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                  placeholder="Roll No..."
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={isSubmitting || filteredRolls.length === 0}
            >
              Create Store Issue
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-600">Loading store stock...</p>
          ) : filteredRolls.length === 0 ? (
            <p className="text-sm text-slate-600">No rolls available in store.</p>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedRollIds.size === filteredRolls.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRollIds(new Set(filteredRolls.map((r) => r.id)));
                          } else {
                            setSelectedRollIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Length (m)</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRolls.map((roll) => (
                    <tr key={roll.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedRollIds.has(roll.id)}
                          onChange={() => toggleSelect(roll.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {roll.roll_no || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{roll.length_m.toFixed(3)}</td>
                      <td className="px-4 py-3 text-slate-900">{roll.grade || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </form>
      </motion.section>
    </div>
  );
}

