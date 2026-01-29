"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface StockRow {
  dye_item_id: string;
  stock_qty: number;
  issued_qty: number;
  dye_items: {
    id: string;
    name: string;
    type: string | null;
    code: string | null;
    uom: string;
  };
}

export default function StockClient({ initialStock }: { initialStock: StockRow[] }) {
  const [search, setSearch] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return initialStock;
    const q = search.toLowerCase();
    return initialStock.filter((row) => row.dye_items?.name?.toLowerCase().includes(q));
  }, [search, initialStock]);

  async function generatePDF() {
    if (initialStock.length === 0) {
      alert("No stock data to generate report");
      return;
    }

    setIsGenerating(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const templateName = "Dyes & Chemicals Stock Report";
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
      doc.text("Dyes & Chemicals Stock Report", pageWidth / 2, titleY + 15, { align: "center" });

      doc.setFontSize(12);
      const reportDate = new Date().toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const metadataY = titleY + 35;
      doc.text(`Generated: ${reportDate}`, pageWidth / 2, metadataY, { align: "center" });
      
      const totalItems = initialStock.length;
      const totalInStore = initialStock.reduce((sum, item) => sum + item.stock_qty, 0);
      const totalIssued = initialStock.reduce((sum, item) => sum + (item.issued_qty ?? 0), 0);

      doc.text(`Total Items: ${totalItems}`, pageWidth / 2, metadataY + 15, { align: "center" });
      doc.text(`Total In Store: ${totalInStore.toFixed(3)}`, pageWidth / 2, metadataY + 30, { align: "center" });
      doc.text(`Total Issued: ${totalIssued.toFixed(3)}`, pageWidth / 2, metadataY + 45, { align: "center" });

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

      const tableData = initialStock.map((item) => [
        item.dye_items?.name || "N/A",
        item.dye_items?.type || "-",
        item.dye_items?.code || "-",
        item.stock_qty.toFixed(3),
        (item.issued_qty ?? 0).toFixed(3),
        item.dye_items?.uom || "kg",
      ]);

      const availableWidth = pageWidth - 2 * margin;
      autoTable(doc, {
        head: [["Name", "Type", "Code", "In Store", "Issued", "UoM"]],
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

      doc.save(`dyes-stock-report-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err: any) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF: " + (err.message || "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-semibold text-slate-900">
            Search by Name
          </label>
          <Button variant="primary" onClick={generatePDF} disabled={isGenerating}>
            {isGenerating ? "Generating..." : "Print Report"}
          </Button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-600">No dye items found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Code</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">In Store</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Issued</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">UoM</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.dye_item_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.dye_items?.name || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.dye_items?.type || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.dye_items?.code || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {row.stock_qty?.toFixed(3) ?? "0.000"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {(row.issued_qty ?? 0).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.dye_items?.uom || "kg"}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/toolbox/dyes/ledger/${row.dye_item_id}`}
                        className="inline-block rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800"
                      >
                        View Ledger
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </>
  );
}

