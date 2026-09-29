"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface YarnStockItem {
  yarn_item_id: string;
  stock_qty: number;
  issued_qty: number;
  consumed_qty: number;
  with_department_qty: number;
  available_in_dept_qty: number;
  allocated_to_orders_qty?: number;
  yarn_items: {
    name: string;
    denier: number | null;
    uom: string;
  };
  avg_price_zar?: number;
  valuation_zar?: number;
}

export default function YarnStockPage() {
  const router = useRouter();
  const [stockItems, setStockItems] = useState<YarnStockItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<YarnStockItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    async function fetchStock() {
      try {
        const [
          stockResult,
          transactionsResult,
          bfoResult,
        ] = await Promise.all([
          supabaseBrowserClient
            .from("yarn_stock")
            .select(
              `
              yarn_item_id,
              stock_qty,
              yarn_items:yarn_item_id (
                name,
                denier,
                uom
              )
            `
            ),
          supabaseBrowserClient
            .from("yarn_transactions")
            .select("yarn_item_id, transaction_type, quantity, base_fabric_order_id, base_fabric_orders(status)"),
          supabaseBrowserClient
            .from("base_fabric_orders")
            .select("id, status"),
        ]);

        const { data: stockData, error } = stockResult;
        const { data: txnsData } = transactionsResult;

        if (error) throw error;

        // Map BFO statuses for fast lookup
        const bfoStatusMap = new Map<string, string>();
        (bfoResult.data || []).forEach((bfo: any) => {
          if (bfo?.id) bfoStatusMap.set(bfo.id, bfo.status);
        });

        // Compute balances directly matching ledger transaction rules from scratch
        const storeBalances: Record<string, number> = {};
        const deptBalances: Record<string, number> = {};
        const allocatedBalances: Record<string, number> = {};

        // Initialize all items to 0
        (stockData || []).forEach((item: any) => {
          storeBalances[item.yarn_item_id] = 0;
          deptBalances[item.yarn_item_id] = 0;
          allocatedBalances[item.yarn_item_id] = 0;
        });

        // Sum transaction history accurately
        (txnsData || []).forEach((txn: any) => {
          const id = txn.yarn_item_id;
          const qty = Number(txn.quantity || 0);
          if (!id) return;

          // Store Balance calculation
          if (txn.transaction_type === "RECEIPT" || txn.transaction_type === "RETURN" || txn.transaction_type === "ADJUSTMENT") {
            storeBalances[id] = (storeBalances[id] || 0) + qty;
          } else if (txn.transaction_type === "ISSUE" || txn.transaction_type === "SCRAP") {
            storeBalances[id] = (storeBalances[id] || 0) - qty;
          }

          // Department Balance calculation
          if (txn.transaction_type === "ISSUE") {
            deptBalances[id] = (deptBalances[id] || 0) + qty;
          } else if (txn.transaction_type === "DEPT_TO_ORDER") {
            deptBalances[id] = (deptBalances[id] || 0) - qty;
            
            const bfoId = txn.base_fabric_order_id;
            const status = bfoId ? bfoStatusMap.get(bfoId) : "RUNNING";
            const isFinished = status === "COMPLETED" || status === "CLOSED" || status === "CANCELLED";
            if (!isFinished) {
              allocatedBalances[id] = (allocatedBalances[id] || 0) + qty;
            }
          } else if (txn.transaction_type === "RETURN") {
            deptBalances[id] = (deptBalances[id] || 0) + qty;
          }
        });

        const processedData = (stockData as any[]).map((item) => {
          const id = item.yarn_item_id;
          const storeQty = storeBalances[id] ?? Number(item.stock_qty || 0);
          const deptQty = Math.max(0, deptBalances[id] ?? 0);
          const allocatedQty = Math.min(deptQty, allocatedBalances[id] ?? 0);
          const unallocatedDeptQty = Math.max(0, deptQty - allocatedQty);

          return {
            ...item,
            stock_qty: storeQty,
            issued_qty: 0,
            consumed_qty: 0,
            with_department_qty: deptQty,
            allocated_to_orders_qty: allocatedQty,
            available_in_dept_qty: unallocatedDeptQty,
            yarn_items: Array.isArray(item.yarn_items) ? item.yarn_items[0] : item.yarn_items,
          };
        }) as YarnStockItem[];

        // Sort by yarn name
        processedData.sort((a, b) => {
          const nameA = a.yarn_items?.name || "";
          const nameB = b.yarn_items?.name || "";
          return nameA.localeCompare(nameB);
        });

        // Fetch pricing data for valuation
        const itemsWithPricing = await Promise.all(
          processedData.map(async (item) => {
            try {
              const { data: receiptData } = await supabaseBrowserClient
                .from("yarn_transactions")
                .select("quantity, unit_price_zar")
                .eq("yarn_item_id", item.yarn_item_id)
                .in("transaction_type", ["RECEIPT", "RETURN"])
                .not("unit_price_zar", "is", null);

              if (receiptData && receiptData.length > 0) {
                let totalQty = 0;
                let totalCost = 0;
                receiptData.forEach((txn: any) => {
                  const qty = Number(txn.quantity || 0);
                  const price = Number(txn.unit_price_zar || 0);
                  totalQty += qty;
                  totalCost += qty * price;
                });

                const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
                const totalHeldQty = item.stock_qty + (item.with_department_qty ?? 0);
                const valuation = totalHeldQty * avgPrice;

                return {
                  ...item,
                  avg_price_zar: avgPrice,
                  valuation_zar: valuation,
                };
              }

              return {
                ...item,
                avg_price_zar: 0,
                valuation_zar: 0,
              };
            } catch (err) {
              console.error(`Error fetching pricing for ${item.yarn_item_id}:`, err);
              return {
                ...item,
                avg_price_zar: 0,
                valuation_zar: 0,
              };
            }
          })
        );

        setStockItems(itemsWithPricing);
        setFilteredItems(itemsWithPricing);
      } catch (err) {
        console.error("Error fetching yarn stock:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStock();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredItems(stockItems);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = stockItems.filter((item) =>
      item.yarn_items?.name?.toLowerCase().includes(query)
    );
    setFilteredItems(filtered);
  }, [searchQuery, stockItems]);

  async function generatePDF() {
    if (stockItems.length === 0) {
      alert("No stock data to generate report");
      return;
    }

    setIsGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const templateName = "Yarn Stock Report";
      let pageNumber = 1;

      let logoLoaded = false;
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.src = "/Logo.png";
        
        await Promise.race([
          new Promise<void>((resolve) => {
            logoImg.onload = () => {
              try {
                const logoWidth = 60;
                const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
                const logoX = (pageWidth - logoWidth) / 2;
                doc.addImage(logoImg, "PNG", logoX, 30, logoWidth, logoHeight);
                logoLoaded = true;
                resolve();
              } catch (err) {
                resolve();
              }
            };
            logoImg.onerror = () => resolve();
          }),
          new Promise<void>((resolve) => setTimeout(() => resolve(), 1500)),
        ]);
      } catch (err) {
        console.warn("Logo loading error:", err);
      }

      const titleY = logoLoaded ? 100 : 60;
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("UNICA TEXTILES", pageWidth / 2, titleY, { align: "center" });
      
      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.text("Yarn Stock Report", pageWidth / 2, titleY + 15, { align: "center" });

      const reportDate = new Date().toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const totalItems = stockItems.length;
      const totalInStore = stockItems.reduce((sum, item) => sum + item.stock_qty, 0);
      const totalWithDept = stockItems.reduce((sum, item) => sum + (item.with_department_qty ?? 0), 0);
      const totalUnallocatedInDept = stockItems.reduce((sum, item) => sum + (item.available_in_dept_qty ?? 0), 0);
      const totalValuation = stockItems.reduce((sum, item) => sum + (item.valuation_zar || 0), 0);

      const summaryTableWidth = pageWidth - 2 * margin;
      const summaryStartY = titleY + 28;
      autoTable(doc, {
        body: [
          [`Generated: ${reportDate}`, `Total Items: ${totalItems}`],
          [`Total In Store: ${totalInStore.toFixed(3)}`, `Total In Dept: ${totalWithDept.toFixed(3)}`],
          [``, `Unallocated in Dept: ${totalUnallocatedInDept.toFixed(3)}`],
          [`Total Valuation: R ${totalValuation.toFixed(2)}`, ""],
        ],
        startY: summaryStartY,
        margin: { left: margin, right: margin },
        tableWidth: summaryTableWidth,
        styles: { fontSize: 10, cellPadding: 6 },
        columnStyles: {
          0: { cellWidth: summaryTableWidth / 2 },
          1: { cellWidth: summaryTableWidth / 2 },
        },
      });

      doc.setFontSize(10);
      doc.setTextColor(128, 128, 128);
      const confidentialY = Math.min((doc as any).lastAutoTable?.finalY ?? summaryStartY + 80, pageHeight - 25);
      doc.text("Confidential - For Internal Use Only", pageWidth / 2, confidentialY + 12, { align: "center" });

      doc.addPage("a4", "landscape");
      pageNumber++;
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Stock Overview", margin, 20);

      const tableData = stockItems.map((item) => [
        item.yarn_items?.name || "N/A",
        item.yarn_items?.denier ? `${item.yarn_items.denier}D` : "-",
        item.stock_qty.toFixed(3),
        (item.available_in_dept_qty ?? 0).toFixed(3),
        (item.allocated_to_orders_qty ?? 0).toFixed(3),
        (item.with_department_qty ?? 0).toFixed(3),
        item.yarn_items?.uom || "kg",
        item.avg_price_zar && item.avg_price_zar > 0 ? `R ${item.avg_price_zar.toFixed(4)}` : "-",
        item.valuation_zar && item.valuation_zar > 0 ? `R ${item.valuation_zar.toFixed(2)}` : "-",
      ]);

      const availableWidth = pageWidth - 2 * margin;
      const colWidths: Record<number, number> = {
        0: 38,
        1: 14,
        2: 18,
        3: 18,
        4: 22,
        5: 18,
        6: 20,
        7: 12,
        8: 28,
        9: 28,
      };
      const totalColWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
      const scale = availableWidth / totalColWidth;
      const columnStyles: Record<number, { halign?: "left" | "right" | "center"; cellWidth?: number }> = {};
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((i) => {
        columnStyles[i] = { cellWidth: Math.round((colWidths[i] ?? 20) * scale) };
        if ([2, 3, 4, 5, 6, 8, 9].includes(i)) columnStyles[i].halign = "right";
      });

      autoTable(doc, {
        head: [["Yarn Name", "Denier", "In Store", "Unallocated In Dept", "Allocated In Dept", "Total In Dept", "UoM", "Avg Price (ZAR)", "Valuation (ZAR)"]],
        body: tableData,
        startY: 30,
        margin: { left: margin, right: margin },
        tableWidth: availableWidth,
        theme: "grid",
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          overflow: "ellipsize",
          lineWidth: 0.1,
          lineColor: [226, 232, 240],
        },
        headStyles: {
          fillColor: [16, 185, 129],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7,
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251],
        },
        columnStyles,
      });

      const totalPages = (doc as any).getNumberOfPages?.() ?? (doc as any).internal?.getNumberOfPages?.() ?? 1;
      const templateLabel = `1. ${templateName}`;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(templateLabel, margin, pageHeight - 10);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
      }

      doc.save(`yarn-stock-report-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err: any) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF: " + (err.message || "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Yarn Stock</h1>
          <p className="mt-1 text-slate-600">
            Store balances and department inventory tracked via unified transaction ledgers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={generatePDF}
            disabled={isGenerating || isLoading}
          >
            {isGenerating ? "Generating..." : "Print Report"}
          </Button>
          <Link
            href="/toolbox/yarn"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            ← Back to Yarn Control
          </Link>
        </div>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          Search by Yarn Name
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Type to search..."
          className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent transition"
        />
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          Stock Overview
        </h2>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-slate-600">
            {searchQuery ? "No yarn items match your search." : "No yarn items found."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Yarn Name
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    Denier
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    In Store
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Unallocated in Dept
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Allocated in Dept
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Total in Dept
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">
                    UoM
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Avg Price (ZAR)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Valuation (ZAR)
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.yarn_item_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/toolbox/yarn/ledger/${item.yarn_item_id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/toolbox/yarn/ledger/${item.yarn_item_id}`);
                      }
                    }}
                    className="border-b border-slate-100 cursor-pointer hover:bg-teal-50 transition"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {item.yarn_items?.name || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.yarn_items?.denier ? `${item.yarn_items.denier}D` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {item.stock_qty?.toFixed(3) ?? "0.000"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {(item.available_in_dept_qty ?? 0).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {(item.allocated_to_orders_qty ?? 0).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {(item.with_department_qty ?? 0).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.yarn_items?.uom || "kg"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {item.avg_price_zar && item.avg_price_zar > 0
                        ? `R ${item.avg_price_zar.toFixed(4)}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {item.valuation_zar && item.valuation_zar > 0
                        ? `R ${item.valuation_zar.toFixed(2)}`
                        : "-"}
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