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
  allocated_to_orders_qty: number;
  available_in_dept_qty: number;
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
        const [stockResult, issuedResult, deptAllocResult, beamsResult, weftResult] = await Promise.all([
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
            .select("yarn_item_id, quantity")
            .eq("transaction_type", "ISSUE"),
          supabaseBrowserClient
            .from("yarn_transactions")
            .select("yarn_item_id, quantity")
            .eq("transaction_type", "DEPT_TO_ORDER"),
          supabaseBrowserClient
            .from("base_fabric_order_beams")
            .select("yarn_item_id, weight_ready_kg, weaving_beams:beam_id(tare_weight_kg)"),
          supabaseBrowserClient
            .from("base_fabric_order_weft")
            .select("yarn_item_id, kg_start, kg_end")
            .not("kg_end", "is", null),
        ]);

        const { data, error } = stockResult;
        const { data: issuedData } = issuedResult;
        const { data: deptAllocData } = deptAllocResult;
        const { data: beamsData } = beamsResult;
        const { data: weftData } = weftResult;

        if (error) throw error;

        const issuedByItem: Record<string, number> = {};
        (issuedData || []).forEach((row: { yarn_item_id: string; quantity: number }) => {
          const id = row.yarn_item_id;
          const qty = Number(row.quantity || 0);
          issuedByItem[id] = (issuedByItem[id] || 0) + qty;
        });

        const allocatedByItem: Record<string, number> = {};
        (deptAllocData || []).forEach((row: { yarn_item_id: string; quantity: number }) => {
          const id = row.yarn_item_id;
          const qty = Number(row.quantity || 0);
          allocatedByItem[id] = (allocatedByItem[id] || 0) + qty;
        });

        const consumedByItem: Record<string, number> = {};
        (beamsData || []).forEach((row: any) => {
          const tare = row.weaving_beams != null
            ? (Array.isArray(row.weaving_beams) ? row.weaving_beams[0]?.tare_weight_kg : row.weaving_beams?.tare_weight_kg)
            : 0;
          const kg = Number(row.weight_ready_kg || 0) - Number(tare || 0);
          if (kg > 0 && row.yarn_item_id) {
            consumedByItem[row.yarn_item_id] = (consumedByItem[row.yarn_item_id] || 0) + kg;
          }
        });
        (weftData || []).forEach((row: { yarn_item_id: string; kg_start: number; kg_end: number }) => {
          const kg = Number(row.kg_start || 0) - Number(row.kg_end || 0);
          if (kg > 0 && row.yarn_item_id) {
            consumedByItem[row.yarn_item_id] = (consumedByItem[row.yarn_item_id] || 0) + kg;
          }
        });

        const processedData = (data as any[]).map((item) => {
          const issued = issuedByItem[item.yarn_item_id] ?? 0;
          const consumed = consumedByItem[item.yarn_item_id] ?? 0;
          const withDept = Math.max(0, issued - consumed);
          const allocated = allocatedByItem[item.yarn_item_id] ?? 0;
          const availableInDept = Math.max(0, withDept - allocated);
          return {
            ...item,
            stock_qty: Number(item.stock_qty || 0),
            issued_qty: issued,
            consumed_qty: consumed,
            with_department_qty: withDept,
            allocated_to_orders_qty: allocated,
            available_in_dept_qty: availableInDept,
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
              // Get RECEIPT and RETURN transactions with pricing
              const { data: receiptData } = await supabaseBrowserClient
                .from("yarn_transactions")
                .select("quantity, unit_price_zar")
                .eq("yarn_item_id", item.yarn_item_id)
                .in("transaction_type", ["RECEIPT", "RETURN"])
                .not("unit_price_zar", "is", null);

              if (receiptData && receiptData.length > 0) {
                // Calculate weighted average price
                let totalQty = 0;
                let totalCost = 0;
                receiptData.forEach((txn: any) => {
                  const qty = Number(txn.quantity || 0);
                  const price = Number(txn.unit_price_zar || 0);
                  totalQty += qty;
                  totalCost += qty * price;
                });

                const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
                const valuation = item.stock_qty * avgPrice;

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

      // ===== COVER PAGE =====
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
      const totalIssued = stockItems.reduce((sum, item) => sum + (item.issued_qty ?? 0), 0);
      const totalConsumed = stockItems.reduce((sum, item) => sum + (item.consumed_qty ?? 0), 0);
      const totalWithDept = stockItems.reduce((sum, item) => sum + (item.with_department_qty ?? 0), 0);
      const totalAllocated = stockItems.reduce((sum, item) => sum + (item.allocated_to_orders_qty ?? 0), 0);
      const totalAvailableInDept = stockItems.reduce((sum, item) => sum + (item.available_in_dept_qty ?? 0), 0);
      const totalValuation = stockItems.reduce((sum, item) => sum + (item.valuation_zar || 0), 0);

      // Cover page: 2-column summary table spanning the page
      const summaryTableWidth = pageWidth - 2 * margin;
      const summaryStartY = titleY + 28;
      autoTable(doc, {
        body: [
          [`Generated: ${reportDate}`, `Total Items: ${totalItems}`],
          [`Total In Store: ${totalInStore.toFixed(3)}`, `Total Issued: ${totalIssued.toFixed(3)}`],
          [`Total Consumed: ${totalConsumed.toFixed(3)}`, `Total In Dept: ${totalWithDept.toFixed(3)}`],
          [`Allocated to Orders: ${totalAllocated.toFixed(3)}`, `Available in Dept: ${totalAvailableInDept.toFixed(3)}`],
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

      // ===== STOCK TABLE (landscape, full width) =====
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
        (item.issued_qty ?? 0).toFixed(3),
        (item.consumed_qty ?? 0).toFixed(3),
        (item.with_department_qty ?? 0).toFixed(3),
        (item.allocated_to_orders_qty ?? 0).toFixed(3),
        (item.available_in_dept_qty ?? 0).toFixed(3),
        item.yarn_items?.uom || "kg",
        item.avg_price_zar && item.avg_price_zar > 0 ? `R ${item.avg_price_zar.toFixed(4)}` : "-",
        item.valuation_zar && item.valuation_zar > 0 ? `R ${item.valuation_zar.toFixed(2)}` : "-",
      ]);

      const availableWidth = pageWidth - 2 * margin;
      // Column width distribution (11 cols) so table fits page width without overflow
      const colWidths: Record<number, number> = {
        0: 38,
        1: 14,
        2: 18,
        3: 18,
        4: 22,
        5: 18,
        6: 18,
        7: 20,
        8: 12,
        9: 28,
        10: 28,
      };
      const totalColWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
      const scale = availableWidth / totalColWidth;
      const columnStyles: Record<number, { halign?: string; cellWidth?: number }> = {};
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((i) => {
        columnStyles[i] = { cellWidth: Math.round((colWidths[i] ?? 20) * scale) };
        if ([2, 3, 4, 5, 6, 7, 9, 10].includes(i)) columnStyles[i].halign = "right";
      });

      autoTable(doc, {
        head: [["Yarn Name", "Denier", "In Store", "Issued", "Consumed", "In Dept", "Alloc'd", "Avail Dept", "UoM", "Avg Price (ZAR)", "Valuation (ZAR)"]],
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
        // Quantities left-aligned to line up with headings
        columnStyles,
      });

      // ===== VALUATION SUMMARY (landscape) =====
      doc.addPage("a4", "landscape");
      pageNumber++;
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Valuation Summary", margin, 20);

      const valuationData = stockItems
        .filter((item) => item.valuation_zar && item.valuation_zar > 0)
        .map((item) => [
          item.yarn_items?.name || "N/A",
          item.stock_qty.toFixed(3),
          item.yarn_items?.uom || "kg",
          `R ${(item.avg_price_zar || 0).toFixed(4)}`,
          `R ${(item.valuation_zar || 0).toFixed(2)}`,
        ])
        .sort((a, b) => {
          const valA = parseFloat(a[4].replace("R ", "").replace(",", ""));
          const valB = parseFloat(b[4].replace("R ", "").replace(",", ""));
          return valB - valA; // Sort descending by valuation
        });

      if (valuationData.length > 0) {
        autoTable(doc, {
          head: [["Yarn Name", "Stock Qty", "UoM", "Avg Price (ZAR)", "Total Valuation (ZAR)"]],
          body: valuationData,
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
          columnStyles: {
            0: { cellWidth: availableWidth * 0.35 },
            1: { cellWidth: availableWidth * 0.15 },
            2: { cellWidth: availableWidth * 0.1 },
            3: { cellWidth: availableWidth * 0.2 },
            4: { cellWidth: availableWidth * 0.2 },
          },
        });

        // Add total at the end
        const finalY = (doc as any).lastAutoTable.finalY || 30;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(
          `Grand Total Valuation: R ${totalValuation.toFixed(2)}`,
          pageWidth - margin,
          finalY + 10,
          { align: "right" }
        );
      } else {
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("No valuation data available (no pricing information found)", margin, 40);
      }

      // Add footer to every page (template name left, Page X of Y right)
      const totalPages = doc.getNumberOfPages();
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Yarn Stock</h1>
          <p className="mt-1 text-slate-600">
            In-store, issued, consumed (beams + cones), total in department, allocated to orders, and available in department.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/toolbox/yarn/stocktake"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            Month-end Stocktake
          </Link>
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

      {/* Search */}
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

      {/* Stock Table */}
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
                    Issued
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Consumed
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Total in Dept
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Allocated to Orders
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">
                    Available in Dept
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
                      {(item.issued_qty ?? 0).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {(item.consumed_qty ?? 0).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {(item.with_department_qty ?? 0).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {(item.allocated_to_orders_qty ?? 0).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {(item.available_in_dept_qty ?? 0).toFixed(3)}
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

