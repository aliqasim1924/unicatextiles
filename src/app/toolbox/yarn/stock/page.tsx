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
        const [stockResult, issuedResult, beamsResult, weftResult] = await Promise.all([
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
            .from("base_fabric_order_beams")
            .select("yarn_item_id, weight_ready_kg, weaving_beams:beam_id(tare_weight_kg)"),
          supabaseBrowserClient
            .from("base_fabric_order_weft")
            .select("yarn_item_id, kg_start, kg_end")
            .not("kg_end", "is", null),
        ]);

        const { data, error } = stockResult;
        const { data: issuedData } = issuedResult;
        const { data: beamsData } = beamsResult;
        const { data: weftData } = weftResult;

        if (error) throw error;

        const issuedByItem: Record<string, number> = {};
        (issuedData || []).forEach((row: { yarn_item_id: string; quantity: number }) => {
          const id = row.yarn_item_id;
          const qty = Number(row.quantity || 0);
          issuedByItem[id] = (issuedByItem[id] || 0) + qty;
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
          return {
            ...item,
            stock_qty: Number(item.stock_qty || 0),
            issued_qty: issued,
            consumed_qty: consumed,
            with_department_qty: withDept,
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
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
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

      doc.setFontSize(12);
      const reportDate = new Date().toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const metadataY = titleY + 35;
      doc.text(`Generated: ${reportDate}`, pageWidth / 2, metadataY, { align: "center" });
      
      const totalItems = stockItems.length;
      const totalInStore = stockItems.reduce((sum, item) => sum + item.stock_qty, 0);
      const totalIssued = stockItems.reduce((sum, item) => sum + (item.issued_qty ?? 0), 0);
      const totalConsumed = stockItems.reduce((sum, item) => sum + (item.consumed_qty ?? 0), 0);
      const totalWithDept = stockItems.reduce((sum, item) => sum + (item.with_department_qty ?? 0), 0);
      const totalValuation = stockItems.reduce((sum, item) => sum + (item.valuation_zar || 0), 0);

      doc.text(`Total Items: ${totalItems}`, pageWidth / 2, metadataY + 15, { align: "center" });
      doc.text(`Total In Store: ${totalInStore.toFixed(3)}`, pageWidth / 2, metadataY + 30, { align: "center" });
      doc.text(`Total Issued: ${totalIssued.toFixed(3)}`, pageWidth / 2, metadataY + 45, { align: "center" });
      doc.text(`Total Consumed: ${totalConsumed.toFixed(3)}`, pageWidth / 2, metadataY + 60, { align: "center" });
      doc.text(`Total With Dept: ${totalWithDept.toFixed(3)}`, pageWidth / 2, metadataY + 75, { align: "center" });
      doc.text(`Total Valuation: R ${totalValuation.toFixed(2)}`, pageWidth / 2, metadataY + 90, { align: "center" });

      doc.setFontSize(10);
      doc.setTextColor(128, 128, 128);
      doc.text("Confidential - For Internal Use Only", pageWidth / 2, pageHeight - 20, { align: "center" });

      // ===== STOCK TABLE =====
      doc.addPage();
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
        item.yarn_items?.uom || "kg",
        item.avg_price_zar && item.avg_price_zar > 0 ? `R ${item.avg_price_zar.toFixed(4)}` : "-",
        item.valuation_zar && item.valuation_zar > 0 ? `R ${item.valuation_zar.toFixed(2)}` : "-",
      ]);

      const availableWidth = pageWidth - 2 * margin;
      autoTable(doc, {
        head: [["Yarn Name", "Denier", "In Store", "Issued", "Consumed", "With Dept", "UoM", "Avg Price (ZAR)", "Valuation (ZAR)"]],
        body: tableData,
        startY: 30,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8 },
        headStyles: {
          fillColor: [16, 185, 129],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251],
        },
        columnStyles: {
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          7: { halign: "right" },
          8: { halign: "right" },
        },
        didDrawPage: function (data: any) {
          const currentPage = data.pageNumber || doc.internal.pages.length - 1;
          if (currentPage > 1) {
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Page ${currentPage}`, margin, pageHeight - 10);
            doc.text(templateName, pageWidth - margin, pageHeight - 10, { align: "right" });
          }
        },
      });

      // ===== VALUATION SUMMARY =====
      doc.addPage();
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
          styles: { fontSize: 8 },
          headStyles: {
            fillColor: [16, 185, 129],
            textColor: [255, 255, 255],
            fontStyle: "bold",
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251],
          },
          columnStyles: {
            1: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" },
          },
          didDrawPage: function (data: any) {
            const currentPage = data.pageNumber || doc.internal.pages.length - 1;
            if (currentPage > 1) {
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              doc.text(`Page ${currentPage}`, margin, pageHeight - 10);
              doc.text(templateName, pageWidth - margin, pageHeight - 10, { align: "right" });
            }
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
            In-store, issued, consumed (beams + cones), and with department.
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
                    With Dept
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

