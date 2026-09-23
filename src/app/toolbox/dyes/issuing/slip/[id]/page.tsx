"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";

interface IssueLine {
  id: string;
  quantity: number;
  uom: string;
  batch_no: string | null;
  dye_items: {
    name: string;
    type: string | null;
    code: string | null;
  };
}

interface IssueSlipData {
  id: string;
  slip_no: string | null;
  issued_at: string;
  issued_to_department: string;
  coating_batch_no: string | null;
  notes: string | null;
  lines: IssueLine[];
}

export default function DyesIssueSlipPage() {
  const params = useParams();
  const issueId = params.id as string;
  const [slipData, setSlipData] = useState<IssueSlipData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (issueId) {
      fetchSlipData();
    }
  }, [issueId]);

  async function fetchSlipData() {
    try {
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("dye_issue_slips")
        .select(
          `
          id,
          slip_no,
          issued_at,
          issued_to_department,
          coating_batches:coating_batch_id ( batch_no ),
          notes,
          dye_issue_lines (
            id,
            quantity,
            uom,
            batch_no,
            dye_items:chemical_item_id (
              name,
              type,
              code
            )
          )
        `
        )
        .eq("id", issueId)
        .single();

      if (fetchError) throw fetchError;

      const processed = {
        ...data,
        coating_batch_no: Array.isArray((data as any).coating_batches)
          ? (data as any).coating_batches[0]?.batch_no ?? null
          : (data as any).coating_batches?.batch_no ?? null,
        lines: (data.dye_issue_lines as any[]).map((line) => ({
          ...line,
          dye_items: Array.isArray(line.dye_items) ? line.dye_items[0] : line.dye_items,
        })),
      } as IssueSlipData;

      setSlipData(processed);
    } catch (err: any) {
      setError(err.message || "Failed to load issue slip.");
    } finally {
      setIsLoading(false);
    }
  }

  function formatDepartment(dept: string) {
    if (dept === "COATING") return "Coating Department";
    if (dept === "WEAVING") return "Weaving Department";
    if (dept === "GENERAL") return "General";
    return dept || "—";
  }

  function formatDate(dateString?: string | null) {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  }

  async function generatePdf() {
    if (!slipData) return;
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 14;
      const marginRight = 14;
      const marginTop = 14;
      const marginBottom = 22;
      const slipNoLabel = slipData.slip_no || "DIS-SLIP";
      const documentNo = "UTM-DYES-FT-001";

      let headerTopOffset = marginTop;

      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.src = "/Logo.png";

        await Promise.race([
          new Promise<void>((resolve) => {
            logoImg.onload = () => {
              try {
                const logoWidth = 28;
                const logoHeight = (logoImg.height / logoImg.width || 1) * logoWidth;
                doc.addImage(
                  logoImg,
                  "PNG",
                  pageWidth - marginRight - logoWidth,
                  marginTop,
                  logoWidth,
                  logoHeight
                );
                headerTopOffset = Math.max(headerTopOffset, marginTop + 4);
              } catch {
                // ignore draw errors
              }
              resolve();
            };
            logoImg.onerror = () => resolve();
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 1000)),
        ]);
      } catch {
        // ignore logo load failures
      }

      const addHeader = () => {
        let y = headerTopOffset;

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("UNICA TEXTILE MILLS", marginLeft, y);
        y += 6;

        doc.setFontSize(12);
        doc.text("Dyes & Chemicals Issue Slip", marginLeft, y);
        y += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        const leftCol = [
          `Slip No: ${slipData.slip_no || "—"}`,
          `Date of Issue: ${formatDate(slipData.issued_at)}`,
        ];
        const rightCol = [
          `Issued To: ${formatDepartment(slipData.issued_to_department)}`,
          `Coating Batch: ${slipData.coating_batch_no || "—"}`,
        ];

        const colWidth = (pageWidth - marginLeft - marginRight) / 2;
        const maxRows = Math.max(leftCol.length, rightCol.length);
        for (let i = 0; i < maxRows; i++) {
          if (leftCol[i]) doc.text(leftCol[i], marginLeft, y);
          if (rightCol[i]) doc.text(rightCol[i], marginLeft + colWidth, y);
          y += 5;
        }

        if (slipData.notes) {
          y += 1;
          doc.text(`Notes: ${slipData.notes}`, marginLeft, y, {
            maxWidth: pageWidth - marginLeft - marginRight,
          });
          y += 6;
        }

        y += 2;
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.line(marginLeft, y, pageWidth - marginRight, y);
        y += 4;

        return y;
      };

      const addFooter = (pageNumber: number, pageCount: number) => {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(marginLeft, pageHeight - 14, pageWidth - marginRight, pageHeight - 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(90, 90, 90);
        doc.text(`Document Number: ${documentNo}`, marginLeft, pageHeight - 8);
        doc.text(
          `Page ${pageNumber} of ${pageCount}`,
          pageWidth - marginRight,
          pageHeight - 8,
          { align: "right" }
        );
        doc.setTextColor(0, 0, 0);
      };

      const addSignatures = (startY: number) => {
        const y = Math.min(startY + 10, pageHeight - 40);
        const colWidth = (pageWidth - marginLeft - marginRight) / 2;
        const roles = ["Issued By", "Received By"];

        doc.setTextColor(0, 0, 0);
        roles.forEach((role, index) => {
          const x = marginLeft + index * colWidth;
          const lineY = y + 12;
          doc.setLineWidth(0.3);
          doc.setDrawColor(80, 80, 80);
          doc.line(x, lineY, x + colWidth - 12, lineY);
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.text(`${role}:`, x, lineY + 4);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(120, 120, 120);
          doc.text("Name / Signature / Date", x, lineY + 8);
          doc.setTextColor(0, 0, 0);
        });
      };

      const headerBottomY = addHeader();

      const body = slipData.lines.map((line) => [
        line.dye_items?.name || "—",
        line.dye_items?.type || "—",
        line.dye_items?.code || "—",
        line.batch_no || "—",
        line.quantity.toFixed(3),
        line.uom || "—",
      ]);

      autoTable(doc, {
        head: [["Item", "Type", "Code", "Batch No", "Quantity", "UoM"]],
        body: body.length > 0 ? body : [["—", "—", "—", "—", "—", "No items recorded"]],
        startY: headerBottomY + 2,
        rowPageBreak: "avoid",
        margin: {
          left: marginLeft,
          right: marginRight,
          top: marginTop + 12,
          bottom: marginBottom + 4,
        },
        theme: "grid",
        styles: {
          fontSize: 8,
          cellPadding: 1.6,
          lineColor: [180, 180, 180],
          lineWidth: 0.2,
          textColor: [30, 30, 30],
        },
        headStyles: {
          fillColor: [15, 118, 110],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "left",
        },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 30 },
          2: { cellWidth: 25 },
          3: { cellWidth: 30 },
          4: { cellWidth: 25, halign: "right", fontStyle: "bold" },
          5: { cellWidth: 17 },
        },
        showHead: "everyPage",
        didDrawPage: (data: any) => {
          if (data.pageNumber > 1) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text("UNICA TEXTILE MILLS — Dyes & Chemicals Issue Slip", marginLeft, marginTop + 4);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 80);
            doc.text(
              `${slipData.slip_no || "Slip"} · ${formatDepartment(slipData.issued_to_department)}`,
              pageWidth - marginRight,
              marginTop + 4,
              { align: "right" }
            );
            doc.setTextColor(0, 0, 0);
          }
        },
      });

      let lastTableY = (doc as any).lastAutoTable?.finalY ?? pageHeight - 50;
      if (lastTableY > pageHeight - 48) {
        doc.addPage();
        lastTableY = marginTop;
      }

      const pageCount = (doc as any).internal.getNumberOfPages?.() ?? 1;
      for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);
        addFooter(page, pageCount);
      }

      doc.setPage(pageCount);
      addSignatures(lastTableY);

      doc.save(`Dyes Issue Slip ${slipNoLabel}.pdf`);
    } catch (err: any) {
      console.error("Failed to generate PDF", err);
      setError(err.message || "Failed to generate issue slip PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading issue slip...</p>
      </div>
    );
  }

  if (error || !slipData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-red-600">{error || "Issue slip not found."}</p>
          <Link href="/toolbox/dyes/issuing">
            <Button variant="primary">Back to Dyes Issuing</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <Link
            href="/toolbox/dyes/issuing"
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
          >
            ← Back to Dyes Issuing
          </Link>
          <Button variant="primary" onClick={generatePdf} disabled={isGeneratingPdf}>
            {isGeneratingPdf ? "Generating PDF..." : "Download Issue Slip PDF"}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 pb-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">UNICA TEXTILE MILLS</h1>
              <p className="mt-1 text-sm text-slate-600">Dyes &amp; Chemicals Issue Slip</p>
            </div>
            <div className="w-28 h-14 flex items-center justify-center overflow-hidden">
              <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
            </div>
          </div>

          {/* Title and Slip Number */}
          <div className="mb-4 text-center">
            <h2 className="mb-1 text-xl font-semibold text-slate-900">
              Dyes &amp; Chemicals Issue Slip
            </h2>
            {slipData.slip_no && (
              <p className="text-base font-bold text-slate-900">
                Slip No: <span className="text-teal-700">{slipData.slip_no}</span>
              </p>
            )}
          </div>

          {/* Header Details */}
          <div className="mb-6 grid gap-3 border-b border-slate-200 pb-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Date of Issue</p>
              <p className="text-sm text-slate-600">{formatDate(slipData.issued_at)}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Slip No</p>
              <p className="text-sm font-medium text-slate-900">{slipData.slip_no || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Issued To</p>
              <p className="text-sm text-slate-600">
                {formatDepartment(slipData.issued_to_department)}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Coating Batch</p>
              <p className="text-sm text-slate-600">{slipData.coating_batch_no || "—"}</p>
            </div>
          </div>

          {/* Main Table */}
          <div className="mb-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50">
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">Item</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">Code</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">Batch No</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-900">Quantity</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">UoM</th>
                </tr>
              </thead>
              <tbody>
                {slipData.lines.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-center text-slate-600" colSpan={6}>
                      No items recorded.
                    </td>
                  </tr>
                ) : (
                  slipData.lines.map((line) => (
                    <tr key={line.id} className="border-b border-slate-200">
                      <td className="px-3 py-2 text-slate-900 font-medium">
                        {line.dye_items?.name || "N/A"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{line.dye_items?.type || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{line.dye_items?.code || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{line.batch_no || "—"}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">
                        {line.quantity.toFixed(3)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{line.uom}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          {slipData.notes && (
            <div className="mb-6 border-b border-slate-200 pb-4">
              <p className="mb-1 text-sm font-semibold text-slate-900">Notes</p>
              <p className="text-sm text-slate-600">{slipData.notes}</p>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-6 pt-4 text-xs text-slate-600 border-t border-slate-200 flex justify-between">
            <span>Document Number: UTM-DYES-FT-001</span>
            <span>Use Download Issue Slip PDF for the printable report</span>
          </footer>
        </div>
      </div>
    </div>
  );
}