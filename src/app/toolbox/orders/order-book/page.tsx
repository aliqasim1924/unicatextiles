"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";
import { motion } from "framer-motion";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface OrderLine {
  id: string;
  color: string;
  quantity_m: number;
  coating_type: string | null;
  gsm: string | null;
  price_rand?: number;
}

interface CustomerOrder {
  id: string;
  order_ref: string;
  customer_name: string;
  customer_pastel_code: string | null;
  status: string;
  created_at: string;
  total_m: number;
  total_rand: number;
  order_lines: OrderLine[];
}

export default function OrderBookPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabaseBrowserClient
        .from("customer_orders")
        .select(
          `
          id,
          order_ref,
          status,
          created_at,
          customer_name,
          customer_id,
          customers:customer_id (
            id,
            name,
            pastel_code
          ),
          customer_order_lines (
            id,
            color,
            quantity_m,
            coating_type,
            gsm,
            price_rand
          )
        `
        )
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const mapped: CustomerOrder[] =
        ((data as any[]) || []).map((row: any) => {
          const cust = row.customers;
          const lines = (row.customer_order_lines || []) as OrderLine[];
          const total = lines.reduce(
            (sum: number, l: any) => sum + Number(l.quantity_m || 0),
            0
          );
          const totalRand = lines.reduce(
            (sum: number, l: any) => sum + Number(l.quantity_m || 0) * Number(l.price_rand ?? 0),
            0
          );

          return {
            id: row.id,
            order_ref: row.order_ref,
            customer_name: cust?.name || row.customer_name || "Unknown",
            customer_pastel_code: cust?.pastel_code ?? null,
            status: row.status || "OPEN",
            created_at: row.created_at,
            total_m: total,
            total_rand: totalRand,
            order_lines: lines,
          };
        }) || [];

      setOrders(mapped);
    } catch (err: any) {
      console.error("Failed to load orders", err);
      setError(err?.message || "Failed to load orders");
    } finally {
      setIsLoading(false);
    }
  }

  async function generatePDF() {
    if (orders.length === 0) {
      setError("No orders to generate report");
      return;
    }

    setIsGenerating(true);
    try {
      // Landscape and small margins to use as much page as possible (avoid table cut-off)
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 8;
      const templateName = "Order Book Report";
      let pageNumber = 1;

      // ===== COVER PAGE =====
      // Logo (if available) - try to load, but don't block if it fails
      let logoLoaded = false;
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.src = "/Logo.png";
        
        // Try to load logo with timeout
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
                console.warn("Could not add logo image:", err);
                resolve();
              }
            };
            logoImg.onerror = () => resolve();
          }),
          new Promise<void>((resolve) => setTimeout(() => resolve(), 1500)), // 1.5s timeout
        ]);
      } catch (err) {
        console.warn("Logo loading error:", err);
      }

      // Company name and report title
      // Adjust Y position based on whether logo was loaded
      const titleY = logoLoaded ? 100 : 60;
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("UNICA TEXTILES", pageWidth / 2, titleY, { align: "center" });
      
      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.text("Order Book Report", pageWidth / 2, titleY + 15, { align: "center" });

      // Report metadata
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      const reportDate = new Date().toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const metadataY = titleY + 35;
      doc.text(`Generated: ${reportDate}`, pageWidth / 2, metadataY, { align: "center" });
      // Separate orders for summary
      const openOrdersCount = orders.filter(
        (o) => o.status === "OPEN" || o.status === "PARTIALLY_FULFILLED"
      ).length;
      const completedOrdersCount = orders.filter(
        (o) => o.status === "COMPLETED" || o.status === "CANCELLED"
      ).length;

      doc.text(`Total Orders: ${orders.length}`, pageWidth / 2, metadataY + 15, { align: "center" });
      doc.text(
        `Open/In Production: ${openOrdersCount} | Completed: ${completedOrdersCount}`,
        pageWidth / 2,
        metadataY + 30,
        { align: "center" }
      );

      const totalMeters = orders.reduce((sum, o) => sum + o.total_m, 0);
      doc.text(`Total Quantity: ${totalMeters.toFixed(2)} m`, pageWidth / 2, metadataY + 45, {
        align: "center",
      });

      // Footer on cover page
      doc.setFontSize(10);
      doc.setTextColor(128, 128, 128);
      doc.text(
        "Confidential - For Internal Use Only",
        pageWidth / 2,
        pageHeight - 20,
        { align: "center" }
      );
      
      // Helper function to add footer to pages (from page 2 onwards)
      const addFooter = () => {
        if (pageNumber > 1) {
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          // Page number on the left
          doc.text(`Page ${pageNumber}`, margin, pageHeight - 10);
          // Template name on the right
          doc.text(templateName, pageWidth - margin, pageHeight - 10, { align: "right" });
        }
      };

      // Separate orders by status
      const openOrders = orders.filter(
        (o) => o.status === "OPEN" || o.status === "PARTIALLY_FULFILLED"
      );
      const completedOrders = orders.filter(
        (o) => o.status === "COMPLETED" || o.status === "CANCELLED"
      );

      // Full available width (landscape + small margins to avoid cut-off)
      const availableWidth = pageWidth - 2 * margin;

      // Format Rand as "R x xxx xxx.xx" (spaces as thousand separators)
      const formatRand = (n: number) => {
        const fixed = n.toFixed(2);
        const [intPart, decPart] = fixed.split(".");
        const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        return `R${withSpaces}.${decPart}`;
      };

      // ===== OPEN/IN PRODUCTION ORDERS TABLE =====
      if (openOrders.length > 0) {
        doc.addPage();
        pageNumber++;
        addFooter();
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text("Open & In Production Orders", margin, 20);

        // Prepare table data: add Total (R) at end of each row (customer order value)
        const openOrdersTableData = openOrders.map((order) => [
          order.order_ref,
          order.customer_name,
          order.customer_pastel_code || "—",
          order.status,
          new Date(order.created_at).toLocaleDateString("en-ZA", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          order.total_m.toFixed(2),
          formatRand(order.total_rand),
        ]);

        // Add totals row for Total (m) and Total (R)
        const openOrdersTotalM = openOrders.reduce(
          (sum, order) => sum + order.total_m,
          0
        );
        const openOrdersTotalR = openOrders.reduce(
          (sum, order) => sum + order.total_rand,
          0
        );
        openOrdersTableData.push([
          "TOTAL",
          "",
          "",
          "",
          "",
          openOrdersTotalM.toFixed(2),
          formatRand(openOrdersTotalR),
        ]);

        // Column widths: fit within available width so nothing is cut off
        const orderRefWidth = 26;
        const customerWidth = 42;
        const pastelCodeWidth = 22;
        const statusWidth = 26;
        const createdWidth = 26;
        const totalMWidth = 22;
        const totalRWidth = 24;
        const totalCalculated = orderRefWidth + customerWidth + pastelCodeWidth + statusWidth + createdWidth + totalMWidth + totalRWidth;
        const adjustmentFactor = availableWidth / totalCalculated;
        
        autoTable(doc, {
          head: [["Order Ref", "Customer", "Pastel Code", "Status", "Created", "Total (m)", "Total (R)"]],
          body: openOrdersTableData,
          startY: 30,
          margin: { left: margin, right: margin },
          tableWidth: availableWidth,
          theme: "grid",
          styles: {
            fontSize: 7,
            cellPadding: 1.5,
            lineWidth: 0.1,
            lineColor: [226, 232, 240],
          },
          headStyles: {
            fillColor: [16, 185, 129], // teal-500
            textColor: [255, 255, 255],
            fontStyle: "bold",
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251], // slate-50
          },
          columnStyles: {
            0: { cellWidth: orderRefWidth * adjustmentFactor },
            1: { cellWidth: customerWidth * adjustmentFactor },
            2: { cellWidth: pastelCodeWidth * adjustmentFactor },
            3: { cellWidth: statusWidth * adjustmentFactor },
            4: { cellWidth: createdWidth * adjustmentFactor },
            5: { cellWidth: totalMWidth * adjustmentFactor, halign: "right" },
            6: { cellWidth: totalRWidth * adjustmentFactor, halign: "right" },
          },
          // Highlight totals row
          didParseCell: function (data: any) {
            if (
              data.section === "body" &&
              data.row.index === openOrdersTableData.length - 1
            ) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [241, 245, 249]; // slate-100
            }
          },
          // Add footer on each page of the table
          didDrawPage: function (data: any) {
            const currentPage = data.pageNumber || doc.internal.pages.length - 1;
            if (currentPage > 1) {
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              // Page number on the left
              doc.text(`Page ${currentPage}`, margin, pageHeight - 10);
              // Template name on the right
              doc.text(templateName, pageWidth - margin, pageHeight - 10, { align: "right" });
            }
          },
        });

        // Two summary blocks below the table: Total Ripstop Canvas, Total PVC (meters + value)
        const finalY = (doc as any).lastAutoTable?.finalY ?? 30;
        let blockStartY = finalY + 10;
        const blockHeight = 22;
        const blockGap = 8;
        const halfWidth = (pageWidth - 2 * margin - blockGap) / 2;
        const leftBlockX = margin;
        const rightBlockX = margin + halfWidth + blockGap;

        const ripstopLines = openOrders.flatMap((o) =>
          (o.order_lines || []).filter(
            (l: OrderLine) => (l.coating_type || "").toUpperCase().includes("RIPSTOP")
          )
        );
        const pvcLines = openOrders.flatMap((o) =>
          (o.order_lines || []).filter(
            (l: OrderLine) => (l.coating_type || "").toUpperCase() === "PVC"
          )
        );
        const totalRipstopM = ripstopLines.reduce(
          (sum: number, l: any) => sum + Number(l.quantity_m || 0),
          0
        );
        const totalRipstopR = ripstopLines.reduce(
          (sum: number, l: any) => sum + Number(l.quantity_m || 0) * Number(l.price_rand ?? 0),
          0
        );
        const totalPVCM = pvcLines.reduce(
          (sum: number, l: any) => sum + Number(l.quantity_m || 0),
          0
        );
        const totalPVCR = pvcLines.reduce(
          (sum: number, l: any) => sum + Number(l.quantity_m || 0) * Number(l.price_rand ?? 0),
          0
        );

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(leftBlockX, blockStartY, halfWidth, blockHeight);
        doc.rect(rightBlockX, blockStartY, halfWidth, blockHeight);
        doc.text("Total Ripstop Canvas", leftBlockX + 4, blockStartY + 6);
        doc.text("Total PVC", rightBlockX + 4, blockStartY + 6);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Orders to supply: ${totalRipstopM.toFixed(2)} m`, leftBlockX + 4, blockStartY + 13);
        doc.text(`Value: ${formatRand(totalRipstopR)}`, leftBlockX + 4, blockStartY + 19);
        doc.text(`Orders to supply: ${totalPVCM.toFixed(2)} m`, rightBlockX + 4, blockStartY + 13);
        doc.text(`Value: ${formatRand(totalPVCR)}`, rightBlockX + 4, blockStartY + 19);
        
        // Update page number after table is drawn
        pageNumber = doc.internal.pages.length - 1;
      }

      // ===== COMPLETED/DISPATCHED ORDERS TABLE =====
      if (completedOrders.length > 0) {
        doc.addPage();
        pageNumber++;
        addFooter();
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text("Completed & Dispatched Orders", margin, 20);

        // Prepare table data: add Total (R) at end of each row (customer order value)
        const completedOrdersTableData = completedOrders.map((order) => [
          order.order_ref,
          order.customer_name,
          order.customer_pastel_code || "—",
          order.status,
          new Date(order.created_at).toLocaleDateString("en-ZA", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          order.total_m.toFixed(2),
          formatRand(order.total_rand),
        ]);

        // Add totals row
        const completedTotalM = completedOrders.reduce(
          (sum, order) => sum + order.total_m,
          0
        );
        const completedTotalR = completedOrders.reduce(
          (sum, order) => sum + order.total_rand,
          0
        );
        completedOrdersTableData.push([
          "TOTAL",
          "",
          "",
          "",
          "",
          completedTotalM.toFixed(2),
          formatRand(completedTotalR),
        ]);

        // Column widths: same as open orders so nothing is cut off
        const orderRefWidth = 26;
        const customerWidth = 42;
        const pastelCodeWidth = 22;
        const statusWidth = 26;
        const createdWidth = 26;
        const totalMWidth = 22;
        const totalRWidth = 24;
        const totalCalculated = orderRefWidth + customerWidth + pastelCodeWidth + statusWidth + createdWidth + totalMWidth + totalRWidth;
        const adjustmentFactor = availableWidth / totalCalculated;

        autoTable(doc, {
          head: [["Order Ref", "Customer", "Pastel Code", "Status", "Created", "Total (m)", "Total (R)"]],
          body: completedOrdersTableData,
          startY: 30,
          margin: { left: margin, right: margin },
          tableWidth: availableWidth,
          theme: "grid",
          styles: {
            fontSize: 7,
            cellPadding: 1.5,
            lineWidth: 0.1,
            lineColor: [226, 232, 240],
          },
          headStyles: {
            fillColor: [107, 114, 128], // slate-500 (different color for completed)
            textColor: [255, 255, 255],
            fontStyle: "bold",
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251], // slate-50
          },
          columnStyles: {
            0: { cellWidth: orderRefWidth * adjustmentFactor },
            1: { cellWidth: customerWidth * adjustmentFactor },
            2: { cellWidth: pastelCodeWidth * adjustmentFactor },
            3: { cellWidth: statusWidth * adjustmentFactor },
            4: { cellWidth: createdWidth * adjustmentFactor },
            5: { cellWidth: totalMWidth * adjustmentFactor, halign: "right" },
            6: { cellWidth: totalRWidth * adjustmentFactor, halign: "right" },
          },
          didParseCell: function (data: any) {
            if (
              data.section === "body" &&
              data.row.index === completedOrdersTableData.length - 1
            ) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [241, 245, 249];
            }
          },
          // Add footer on each page of the table
          didDrawPage: function (data: any) {
            const currentPage = data.pageNumber || doc.internal.pages.length - 1;
            if (currentPage > 1) {
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              // Page number on the left
              doc.text(`Page ${currentPage}`, margin, pageHeight - 10);
              // Template name on the right
              doc.text(templateName, pageWidth - margin, pageHeight - 10, { align: "right" });
            }
          },
        });
        
        // Update page number after table is drawn
        pageNumber = doc.internal.pages.length - 1;
      }

      // Helper to filter orders by coating type (e.g. PVC, Ripstop)
      const filterOrdersByCoating = (
        ordersToProcess: CustomerOrder[],
        coatingCode: string
      ) => {
        const target = coatingCode.toUpperCase();
        return ordersToProcess
          .map((order) => {
            const filteredLines = order.order_lines.filter(
              (line) => (line.coating_type || "").toUpperCase() === target
            );
            return { ...order, order_lines: filteredLines };
          })
          .filter((order) => order.order_lines.length > 0);
      };

      // Helper function to build pivot table
      const buildPivotTable = (
        ordersToProcess: CustomerOrder[],
        title: string,
        headerColor: [number, number, number]
      ) => {
        if (ordersToProcess.length === 0) return;

        doc.addPage();
        pageNumber++;
        addFooter();
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(title, margin, 20);

        // Build pivot data: Customer -> Color -> Total meters
        const pivotData: Record<string, Record<string, number>> = {};
        const allColors = new Set<string>();

        ordersToProcess.forEach((order) => {
          if (!pivotData[order.customer_name]) {
            pivotData[order.customer_name] = {};
          }

          order.order_lines.forEach((line) => {
            const color = line.color || "Unknown";
            allColors.add(color);
            if (!pivotData[order.customer_name][color]) {
              pivotData[order.customer_name][color] = 0;
            }
            pivotData[order.customer_name][color] += line.quantity_m;
          });
        });

        // Sort colors alphabetically
        const sortedColors = Array.from(allColors).sort();

        // Build table data
        const pivotTableData: (string | number)[][] = [];
        Object.keys(pivotData)
          .sort()
          .forEach((customer) => {
            const row: (string | number)[] = [customer];
            sortedColors.forEach((color) => {
              const value = pivotData[customer][color] || 0;
              row.push(value > 0 ? value.toFixed(2) : "—");
            });
            // Add total column
            const customerTotal = Object.values(pivotData[customer]).reduce(
              (sum, val) => sum + val,
              0
            );
            row.push(customerTotal.toFixed(2));
            pivotTableData.push(row);
          });

        // Add totals row
        const totalsRow: (string | number)[] = ["TOTAL"];
        let grandTotal = 0;
        sortedColors.forEach((color) => {
          const colorTotal = Object.values(pivotData).reduce(
            (sum, customerColors) => sum + (customerColors[color] || 0),
            0
          );
          totalsRow.push(colorTotal > 0 ? colorTotal.toFixed(2) : "—");
          grandTotal += colorTotal;
        });
        totalsRow.push(grandTotal.toFixed(2));
        pivotTableData.push(totalsRow);

        // Create table headers: Customer, colour columns, then Row total (column totals are in last row)
        const pivotHeaders = ["Customer", ...sortedColors, "Row total"];

        // Use full available width; small margins so table is not cut off
        const customerColWidth = 38;
        const rowTotalColWidth = 28;
        const colorColWidth = Math.max(
          12,
          (availableWidth - customerColWidth - rowTotalColWidth) / sortedColors.length
        );

        const columnStyles: Record<number, any> = {
          0: { cellWidth: customerColWidth, fontStyle: "bold" }, // Customer name
        };

        for (let i = 1; i <= sortedColors.length; i++) {
          columnStyles[i] = { cellWidth: colorColWidth, halign: "right" };
        }

        columnStyles[pivotHeaders.length - 1] = {
          cellWidth: rowTotalColWidth,
          halign: "right",
          fontStyle: "bold",
        };

        autoTable(doc, {
          head: [pivotHeaders],
          body: pivotTableData,
          startY: 30,
          margin: { left: margin, right: margin },
          tableWidth: availableWidth,
          theme: "grid",
          styles: {
            fontSize: 7,
            cellPadding: 1.5,
            lineWidth: 0.1,
            lineColor: [226, 232, 240],
          },
          headStyles: {
            fillColor: headerColor,
            textColor: [255, 255, 255],
            fontStyle: "bold",
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251], // slate-50
          },
          columnStyles: columnStyles,
          // Make totals row bold and align headers properly
          didParseCell: function (data: any) {
            // Align header cells: Customer left, colors and total right
            if (data.section === "head") {
              if (data.column.index === 0) {
                // Customer column header - left align
                data.cell.styles.halign = "left";
              } else {
                // Color columns and Total column headers - right align
                data.cell.styles.halign = "right";
              }
            }
            // Make totals row bold
            if (data.row.index === pivotTableData.length - 1) {
              // Last row (totals)
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [241, 245, 249]; // slate-100
            }
          },
          // Add footer on each page of the table
          didDrawPage: function (data: any) {
            const currentPage = data.pageNumber || doc.internal.pages.length - 1;
            if (currentPage > 1) {
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              // Page number on the left
              doc.text(`Page ${currentPage}`, margin, pageHeight - 10);
              // Template name on the right
              doc.text(templateName, pageWidth - margin, pageHeight - 10, { align: "right" });
            }
          },
        });
        
        // Update page number after table is drawn
        pageNumber = doc.internal.pages.length - 1;
      };

      // ===== COLOR PIVOT TABLES =====
      // Open/In Production Orders Pivot
      buildPivotTable(
        openOrders,
        "Open & In Production Orders by Customer and Colour",
        [16, 185, 129] // teal-500
      );

      // Open/In Production Orders Pivot - PVC only
      buildPivotTable(
        filterOrdersByCoating(openOrders, "PVC"),
        "Open & In Production Orders by Customer and Colour – PVC only",
        [16, 185, 129] // teal-500
      );

      // Open/In Production Orders Pivot - Ripstop only
      buildPivotTable(
        filterOrdersByCoating(openOrders, "RIPSTOP"),
        "Open & In Production Orders by Customer and Colour – Ripstop only",
        [16, 185, 129] // teal-500
      );

      // Completed/Dispatched Orders Pivot
      buildPivotTable(
        completedOrders,
        "Completed & Dispatched Orders by Customer and Colour",
        [107, 114, 128] // slate-500
      );

      // Completed/Dispatched Orders Pivot - PVC only
      buildPivotTable(
        filterOrdersByCoating(completedOrders, "PVC"),
        "Completed & Dispatched Orders by Customer and Colour – PVC only",
        [107, 114, 128] // slate-500
      );

      // Completed/Dispatched Orders Pivot - Ripstop only
      buildPivotTable(
        filterOrdersByCoating(completedOrders, "RIPSTOP"),
        "Completed & Dispatched Orders by Customer and Colour – Ripstop only",
        [107, 114, 128] // slate-500
      );

      // Save PDF
      const fileName = `Order_Book_${new Date().toISOString().split("T")[0]}.pdf`;
      doc.save(fileName);
    } catch (err: any) {
      console.error("Error generating PDF:", err);
      setError(err.message || "Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Order Book Report</h1>
          <p className="mt-1 text-slate-600">
            Generate a comprehensive PDF report of all customer orders.
          </p>
        </div>
        <BackButton href="/toolbox/orders" label="Back to Orders" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Report Contents</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-600 ml-4">
            <li>Cover page with company logo and summary statistics</li>
            <li>Open & In Production orders table (for production planning)</li>
            <li>Completed & Dispatched orders table (for historical reference)</li>
            <li>Pivot tables showing orders by customer and colour for each status group</li>
          </ul>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading orders...</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">
                Ready to generate report for {orders.length} order{orders.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Total quantity:{" "}
                {orders
                  .reduce((sum, o) => sum + o.total_m, 0)
                  .toFixed(2)}{" "}
                meters
              </p>
            </div>

            <Button
              variant="primary"
              onClick={generatePDF}
              disabled={isGenerating || orders.length === 0}
              className="w-full sm:w-auto"
            >
              {isGenerating ? "Generating PDF..." : "Generate Order Book PDF"}
            </Button>
          </div>
        )}
      </motion.section>

      {/* Preview Section */}
      {!isLoading && orders.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Preview</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Order Ref</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Total (m)</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 10).map((order) => (
                  <tr key={order.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{order.order_ref}</td>
                    <td className="px-4 py-3 text-slate-600">{order.customer_name}</td>
                    <td className="px-4 py-3 text-slate-600">{order.status}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {order.total_m.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orders.length > 10 && (
              <p className="mt-2 text-xs text-slate-500 text-center">
                Showing first 10 of {orders.length} orders. Full list will be in PDF.
              </p>
            )}
          </div>
        </motion.section>
      )}
    </div>
  );
}
