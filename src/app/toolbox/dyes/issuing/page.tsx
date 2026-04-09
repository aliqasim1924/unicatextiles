"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface DyeItem {
  id: string;
  name: string;
  type: string | null;
  code: string | null;
  uom: string;
}

interface StockItem {
  dye_item_id: string;
  stock_qty: number;
}

interface IssueLine {
  id: string;
  chemical_item_id: string;
  quantity: string;
  uom: string;
  batch_no: string;
  stockOnHand: number | null;
}

interface IssueRow {
  id: string;
  issued_at: string;
  slip_no: string | null;
  issued_to_department: string;
  coating_batch_no: string | null;
  lines_count: number;
}

interface CoatingBatchOption {
  id: string;
  batch_no: string;
  status: string;
}

const DESTINATION_OPTIONS = [
  { value: "COATING", label: "Coating Department" },
  { value: "GENERAL", label: "General" },
];

export default function DyesIssuingPage() {
  const [dyeItems, setDyeItems] = useState<DyeItem[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [lines, setLines] = useState<IssueLine[]>([
    { id: "1", chemical_item_id: "", quantity: "", uom: "kg", batch_no: "", stockOnHand: null },
  ]);
  const [issuedToDepartment, setIssuedToDepartment] = useState("GENERAL");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; id?: string; slip_no?: string } | null>(null);
  const [recentIssues, setRecentIssues] = useState<IssueRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchSearchInput, setBatchSearchInput] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<CoatingBatchOption | null>(null);
  const [batchSearchResults, setBatchSearchResults] = useState<CoatingBatchOption[]>([]);
  const [isSearchingBatch, setIsSearchingBatch] = useState(false);

  useEffect(() => {
    fetchItems();
    fetchStock();
    fetchRecentIssues();
  }, []);

  async function fetchItems() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("dye_items")
        .select("id, name, type, code, uom")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      setDyeItems(data as DyeItem[]);
    } catch (err: any) {
      setError(err.message || "Failed to load dye items.");
    }
  }

  async function fetchStock() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("dye_stock")
        .select("dye_item_id, stock_qty");

      if (error) throw error;

      const map = new Map<string, number>();
      (data as StockItem[]).forEach((item) => {
        map.set(item.dye_item_id, item.stock_qty);
      });
      setStockMap(map);
    } catch (err: any) {
      console.error("Failed to load stock:", err);
    }
  }

  async function fetchRecentIssues() {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("dye_issue_slips")
        .select(
          `
          id,
          slip_no,
          issued_at,
          issued_to_department,
          coating_batches:coating_batch_id ( batch_no ),
          dye_issue_lines (id)
        `
        )
        .order("issued_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      const processed = (data as any[]).map((row) => ({
        id: row.id,
        slip_no: row.slip_no,
        issued_at: row.issued_at,
        issued_to_department: row.issued_to_department,
        coating_batch_no: Array.isArray(row.coating_batches)
          ? row.coating_batches[0]?.batch_no ?? null
          : row.coating_batches?.batch_no ?? null,
        lines_count: Array.isArray(row.dye_issue_lines) ? row.dye_issue_lines.length : 0,
      })) as IssueRow[];

      setRecentIssues(processed);
    } catch (err: any) {
      console.error("Failed to load recent issues:", err);
    }
  }

  async function handleSearchBatch(e?: React.FormEvent) {
    e?.preventDefault();
    const input = batchSearchInput.trim();
    if (!input) {
      setBatchSearchResults([]);
      setSelectedBatch(null);
      return;
    }

    setError(null);
    setIsSearchingBatch(true);
    try {
      const rawUpper = input.toUpperCase().replace(/\s+/g, "");
      const compact = rawUpper.replace(/-/g, "");

      const { data, error: searchError } = await supabaseBrowserClient
        .from("coating_batches")
        .select("id, batch_no, status")
        .or(
          `batch_no.ilike.%${rawUpper}%,batch_no.ilike.%${compact}%`
        )
        .neq("status", "CANCELLED")
        .order("batch_no", { ascending: true })
        .limit(8);

      if (searchError) throw searchError;
      const rows = ((data || []) as any[]).map((r) => ({
        id: r.id as string,
        batch_no: r.batch_no as string,
        status: r.status as string,
      }));
      setBatchSearchResults(rows);
      // Never auto-select: user must explicitly choose one batch from results.
      setSelectedBatch((prev) =>
        prev && rows.some((r) => r.id === prev.id) ? prev : null
      );
    } catch (err: any) {
      setError(err.message || "Failed to search coating batches.");
      setBatchSearchResults([]);
      setSelectedBatch(null);
    } finally {
      setIsSearchingBatch(false);
    }
  }

  function addLine() {
    const newId = Date.now().toString();
    setLines([
      ...lines,
      { id: newId, chemical_item_id: "", quantity: "", uom: "kg", batch_no: "", stockOnHand: null },
    ]);
  }

  function removeLine(lineId: string) {
    if (lines.length > 1) {
      setLines(lines.filter((line) => line.id !== lineId));
    }
  }

  function updateLine(lineId: string, updates: Partial<IssueLine>) {
    setLines(
      lines.map((line) => {
        if (line.id === lineId) {
          const updated = { ...line, ...updates };
          // Update stock on hand when chemical is selected
          if (updates.chemical_item_id !== undefined) {
            updated.stockOnHand = stockMap.get(updates.chemical_item_id) ?? null;
            // Reset quantity if stock is 0
            if (updated.stockOnHand === 0 || updated.stockOnHand === null) {
              updated.quantity = "";
            }
          }
          // Get UOM from selected item
          if (updates.chemical_item_id !== undefined && updates.chemical_item_id) {
            const item = dyeItems.find((i) => i.id === updates.chemical_item_id);
            if (item) {
              updated.uom = item.uom;
            }
          }
          return updated;
        }
        return line;
      })
    );
  }

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const selectedChemicals = new Set<string>();

    lines.forEach((line, index) => {
      if (!line.chemical_item_id) {
        errors.push(`Line ${index + 1}: Please select a chemical.`);
      } else {
        // Check for duplicates
        if (selectedChemicals.has(line.chemical_item_id)) {
          errors.push(`Line ${index + 1}: Duplicate chemical selected. Each chemical can only appear once per slip.`);
        } else {
          selectedChemicals.add(line.chemical_item_id);
        }
      }

      if (!line.quantity || Number(line.quantity) <= 0) {
        errors.push(`Line ${index + 1}: Quantity must be greater than zero.`);
      } else {
        const qty = Number(line.quantity);
        const stock = line.stockOnHand ?? 0;
        if (qty > stock) {
          errors.push(
            `Line ${index + 1}: Quantity (${qty.toFixed(3)}) exceeds stock on hand (${stock.toFixed(3)} ${line.uom}).`
          );
        }
      }
    });

    return errors;
  }, [lines]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
      return;
    }

    if (lines.length === 0 || lines.every((l) => !l.chemical_item_id)) {
      setError("Please add at least one line item.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Generate slip number
      const { data: slipNoData, error: slipNoError } = await supabaseBrowserClient.rpc(
        "generate_dye_issue_slip_no"
      );
      if (slipNoError) throw slipNoError;

      const slipNo = slipNoData as string;

      // Get current user
      const {
        data: { user },
      } = await supabaseBrowserClient.auth.getUser();

      // Create issue header
      const { data: issueHeader, error: headerError } = await supabaseBrowserClient
        .from("dye_issue_slips")
        .insert({
          slip_no: slipNo,
          issued_to_department: issuedToDepartment,
          issued_at: new Date().toISOString(),
          created_by: user?.id || null,
          coating_batch_id: selectedBatch?.id || null,
          notes: notes || null,
        })
        .select("id")
        .single();

      if (headerError) throw headerError;

      // Create issue lines
      const issueLines = lines
        .filter((line) => line.chemical_item_id && line.quantity)
        .map((line) => ({
          issue_id: issueHeader.id,
          chemical_item_id: line.chemical_item_id,
          quantity: Number(line.quantity),
          uom: line.uom,
          batch_no: line.batch_no || null,
        }));

      const { error: linesError } = await supabaseBrowserClient.from("dye_issue_lines").insert(issueLines);

      if (linesError) throw linesError;

      // Create stock transactions for each line
      const transactions = issueLines.map((line) => ({
        dye_item_id: line.chemical_item_id,
        transaction_type: "ISSUE",
        quantity: line.quantity,
        uom: line.uom,
        source: "CHEMICAL STORE",
        destination: issuedToDepartment,
        batch_no: line.batch_no,
        notes: notes || null,
        slip_no: slipNo,
        created_by: user?.id || null,
      }));

      const { error: txnError } = await supabaseBrowserClient.from("dye_transactions").insert(transactions);

      if (txnError) throw txnError;

      setSuccess({
        message: "Dyes/Chemicals issue recorded successfully.",
        id: issueHeader.id,
        slip_no: slipNo,
      });

      // Reset form
      setLines([{ id: "1", chemical_item_id: "", quantity: "", uom: "kg", batch_no: "", stockOnHand: null }]);
      setIssuedToDepartment("GENERAL");
      setNotes("");

      // Refresh data
      await Promise.all([fetchStock(), fetchRecentIssues()]);
    } catch (err: any) {
      setError(err.message || "Failed to record issue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Dyes &amp; Chemicals Issuing</h1>
          <p className="mt-1 text-slate-600">Record issues of dyes and chemicals.</p>
        </div>
        <Link
          href="/toolbox/dyes"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Dyes &amp; Chemicals
        </Link>
      </div>

      {/* Form */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Record Issuing</h2>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {success && (
          <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <p>
              {success.message}
              {success.slip_no ? ` Slip No: ${success.slip_no}` : ""}
            </p>
            {success.id && (
              <div className="mt-2">
                <Link href={`/toolbox/dyes/issuing/slip/${success.id}`}>
                  <Button variant="primary">View &amp; Print Issue Slip</Button>
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* Header Fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Issued To Department
              </label>
              <select
                value={issuedToDepartment}
                onChange={(e) => setIssuedToDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                required
              >
                {DESTINATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Link to Coating Batch (optional)
              </label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="text"
                  value={batchSearchInput}
                  onChange={(e) => setBatchSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSearchBatch();
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                  placeholder="Enter batch number (e.g. CBT-000026 or CBT000026) and press Enter"
                />
                <Button type="button" variant="secondary" disabled={isSearchingBatch} onClick={() => void handleSearchBatch()}>
                  {isSearchingBatch ? "Searching..." : "Search"}
                </Button>
              </div>
              {batchSearchResults.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {batchSearchResults.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() =>
                        setSelectedBatch((prev) => (prev?.id === b.id ? null : b))
                      }
                      className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 ${
                        selectedBatch?.id === b.id
                          ? "bg-teal-50 text-teal-800 font-semibold"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="inline-flex w-full items-center justify-between gap-2">
                        <span>
                          {b.batch_no} ({b.status})
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            selectedBatch?.id === b.id
                              ? "bg-teal-700 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {selectedBatch?.id === b.id ? "Selected" : "Select"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {selectedBatch && (
                <p className="mt-2 text-xs text-green-700">
                  Linked batch selected: <span className="font-semibold">{selectedBatch.batch_no}</span>
                </p>
              )}
              {!selectedBatch && batchSearchResults.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">
                  No batch selected. Click a batch to select it.
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Press Enter or click Search. Only non-cancelled batches are selectable.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                placeholder="Optional notes"
              />
            </div>
          </div>

          {/* Lines Table */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Issue Items</h3>
              <Button
                type="button"
                variant="secondary"
                onClick={addLine}
                className="text-xs"
              >
                + Add Line
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Chemical</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-900">Stock</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-900">Quantity</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">UoM</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Batch No</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-900 w-16">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const exceedsStock =
                      line.quantity &&
                      line.stockOnHand !== null &&
                      Number(line.quantity) > line.stockOnHand;
                    const selectedItem = dyeItems.find((item) => item.id === line.chemical_item_id);

                    return (
                      <tr
                        key={line.id}
                        className={`border-b border-slate-100 ${exceedsStock ? "bg-red-50" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <select
                            value={line.chemical_item_id}
                            onChange={(e) =>
                              updateLine(line.id, {
                                chemical_item_id: e.target.value,
                              })
                            }
                            className={`w-full rounded-lg border px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent ${
                              exceedsStock ? "border-red-300" : "border-slate-200"
                            }`}
                            required
                          >
                            <option value="">Select chemical</option>
                            {dyeItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} {item.type ? `(${item.type})` : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">
                          {line.stockOnHand !== null
                            ? `${line.stockOnHand.toFixed(3)} ${line.uom}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                            className={`w-full rounded-lg border px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent ${
                              exceedsStock ? "border-red-300" : "border-slate-200"
                            }`}
                            placeholder="0.000"
                            required
                          />
                          {exceedsStock && (
                            <p className="mt-1 text-xs text-red-600">
                              Exceeds stock
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{line.uom}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.batch_no}
                            onChange={(e) => updateLine(line.id, { batch_no: e.target.value })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                            placeholder={selectedBatch?.batch_no || "Optional"}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(line.id)}
                              className="text-red-600 hover:text-red-800 text-sm font-semibold"
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record Issuing"}
            </Button>
          </div>
        </form>
      </motion.section>

      {/* Recent issues */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Recent Issues</h2>
        {recentIssues.length === 0 ? (
          <p className="text-sm text-slate-600">No issues recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Date/Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Slip No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Department</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Coating Batch</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Items</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentIssues.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(row.issued_at).toLocaleString("en-ZA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.slip_no || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.issued_to_department === "COATING"
                        ? "Coating Department"
                        : row.issued_to_department === "WEAVING"
                        ? "Weaving Department"
                        : row.issued_to_department === "GENERAL"
                        ? "General"
                        : row.issued_to_department || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.coating_batch_no || "-"}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{row.lines_count} item(s)</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/toolbox/dyes/issuing/slip/${row.id}`}
                        className="text-teal-700 hover:text-teal-800 text-sm font-semibold"
                      >
                        View Slip
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </div>
  );
}
