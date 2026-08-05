"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface IssueItem {
  id: string;
  roll_no: string | null;
  length_m: number | null;
  grade: string | null;
  roll?: {
    roll_no?: string | null;
    length_m?: number | null;
    grade?: string | null;
    gsm?: number | null;
    color?: string | null;
    coating_type?: string | null;
  } | null;
}

interface IssueHeader {
  id: string;
  issue_no: number | null;
  issue_time: string;
  destination: string | null;
  reference: string | null;
  notes: string | null;
  order_id?: string | null;
  invoice_no?: string | null;
  gate_pass_no?: string | null;
  order?: any | null;
}

export default function FinishedFabricPackingListPage() {
  const params = useParams();
  const issueId = params.id as string;

  const [header, setHeader] = useState<IssueHeader | null>(null);
  const [items, setItems] = useState<IssueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (issueId) {
      fetchIssue();
    }
  }, [issueId]);

  async function fetchIssue() {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .select(
          `
          id,
          issue_no,
          issue_time,
          destination,
          reference,
          notes,
          order_id,
          invoice_no,
          gate_pass_no,
          customer_orders:order_id (*, customers:customer_id (name)),
          finished_fabric_store_issue_items (
            id,
            roll_id,
            roll_no,
            length_m,
            grade,
            finished_fabric_rolls:roll_id (
              roll_no,
              length_m,
              grade,
              gsm,
              color,
              coating_type
            )
          )
        `
        )
        .eq("id", issueId)
        .single();

      if (fetchError) throw fetchError;

      let order = Array.isArray(data.customer_orders) ? data.customer_orders[0] : data.customer_orders;
      if (order && Array.isArray(order.customers)) {
        order = { ...order, customers: order.customers[0] ?? null };
      }
      setHeader({
        id: data.id,
        issue_no: data.issue_no ?? null,
        issue_time: data.issue_time,
        destination: data.destination ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        order_id: data.order_id ?? null,
        invoice_no: data.invoice_no ?? null,
        gate_pass_no: data.gate_pass_no ?? null,
        order: order ?? null,
      });

      const mapped: IssueItem[] =
        (data.finished_fabric_store_issue_items || []).map((row: any) => ({
          id: row.id as string,
          roll_no: row.roll_no ?? null,
          length_m: row.length_m !== null ? Number(row.length_m) : null,
          grade: row.grade ?? null,
          roll: Array.isArray(row.finished_fabric_rolls)
            ? row.finished_fabric_rolls[0]
            : row.finished_fabric_rolls,
        })) || [];
      setItems(mapped);
    } catch (err: any) {
      console.error("Failed to load packing list", err);
      setError(err.message || "Failed to load packing list.");
    } finally {
      setIsLoading(false);
    }
  }

  function formatIssueNo(issueNo: number | null) {
    if (issueNo === null || issueNo === undefined) return "N/A";
    return `FFSI-${String(issueNo).padStart(6, "0")}`;
  }

  function formatDate(dateString?: string | null) {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  }

  function getCustomerName(order: any | null | undefined) {
    return order?.customers?.name ?? order?.customer_name ?? "—";
  }

  function getOrderRef(order: any | null | undefined) {
    return order?.order_ref ?? "—";
  }

  function getItemLength(item: IssueItem) {
    if (item.length_m !== null && item.length_m !== undefined) return Number(item.length_m);
    if (item.roll?.length_m !== null && item.roll?.length_m !== undefined) {
      return Number(item.roll.length_m);
    }
    return null;
  }

  const totals = useMemo(() => {
    const totalMeters = items.reduce((sum, item) => sum + (getItemLength(item) ?? 0), 0);
    return {
      rollCount: items.length,
      totalMeters,
    };
  }, [items]);

  async function generatePdf() {
    if (!header) return;
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
      const templateName = "Packing List";
      const issueNoLabel = formatIssueNo(header.issue_no);
      const documentNo = "UTM-PACK-LIST-FT-001";

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
                  logoHeight,
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
        doc.text(templateName, marginLeft, y);
        y += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        const leftCol = [
          `Issue No: ${issueNoLabel}`,
          `Date/Time: ${formatDate(header.issue_time)}`,
          `Destination: ${header.destination || "—"}`,
          `Order Ref: ${getOrderRef(header.order)}`,
        ];
        const rightCol = [
          `Customer: ${getCustomerName(header.order)}`,
          `Invoice No: ${header.invoice_no || "—"}`,
          `Gate Pass No: ${header.gate_pass_no || "—"}`,
          `Reference: ${header.reference || "—"}`,
        ];

        const colWidth = (pageWidth - marginLeft - marginRight) / 2;
        const maxRows = Math.max(leftCol.length, rightCol.length);
        for (let i = 0; i < maxRows; i++) {
          if (leftCol[i]) doc.text(leftCol[i], marginLeft, y);
          if (rightCol[i]) doc.text(rightCol[i], marginLeft + colWidth, y);
          y += 5;
        }

        if (header.notes) {
          y += 1;
          doc.text(`Notes: ${header.notes}`, marginLeft, y, {
            maxWidth: pageWidth - marginLeft - marginRight,
          });
          y += 6;
        }

        y += 2;
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.line(marginLeft, y, pageWidth - marginRight, y);
        y += 4;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(
          `Total Rolls: ${totals.rollCount}    Total Length: ${totals.totalMeters.toFixed(3)} m`,
          marginLeft,
          y,
        );
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
          { align: "right" },
        );
        doc.setTextColor(0, 0, 0);
      };

      const addSignatures = (startY: number) => {
        const y = Math.min(startY + 10, pageHeight - 40);
        const colWidth = (pageWidth - marginLeft - marginRight) / 3;
        const roles = ["Prepared By", "Checked By", "Received By"];

        doc.setTextColor(0, 0, 0);
        roles.forEach((role, index) => {
          const x = marginLeft + index * colWidth;
          const lineY = y + 12;
          doc.setLineWidth(0.3);
          doc.setDrawColor(80, 80, 80);
          doc.line(x, lineY, x + colWidth - 8, lineY);
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.text(role, x, lineY + 4);
          doc.setFontSize(7);
          doc.setTextColor(120, 120, 120);
          doc.text("Name / Signature / Date", x, lineY + 8);
          doc.setTextColor(0, 0, 0);
        });
      };

      const headerBottomY = addHeader();

      const body = items.map((item) => {
        const roll = item.roll || {};
        const length = getItemLength(item);
        return [
          item.roll_no || roll.roll_no || "—",
          length !== null ? length.toFixed(3) : "—",
          item.grade || roll.grade || "—",
          roll.gsm !== null && roll.gsm !== undefined ? String(roll.gsm) : "—",
          roll.color || "—",
          roll.coating_type || "—",
        ];
      });

      autoTable(doc, {
        head: [["Roll No", "Length (m)", "Grade", "GSM", "Colour", "Coating Type"]],
        body:
          body.length > 0
            ? body
            : [["—", "—", "—", "—", "—", "No items recorded"]],
        foot: [["Total", totals.totalMeters.toFixed(3), "", "", "", `${totals.rollCount} roll(s)`]],
        startY: headerBottomY + 2,
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
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 24, halign: "right" },
          2: { cellWidth: 18, halign: "center" },
          3: { cellWidth: 18, halign: "right" },
          4: { cellWidth: "auto" },
          5: { cellWidth: 28 },
        },
        showHead: "everyPage",
        showFoot: "lastPage",
        didDrawPage: (data: any) => {
          if (data.pageNumber > 1) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text("UNICA TEXTILE MILLS — Packing List", marginLeft, marginTop + 4);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 80);
            doc.text(
              `${issueNoLabel} · ${getCustomerName(header.order)}`,
              pageWidth - marginRight,
              marginTop + 4,
              { align: "right" },
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

      doc.save(`Packing List ${issueNoLabel}.pdf`);
    } catch (err: any) {
      console.error("Failed to generate packing list PDF", err);
      setError(err.message || "Failed to generate packing list PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-[900px] px-4 py-6">
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            Loading packing list...
          </div>
        </div>
      </div>
    );
  }

  if (error || !header) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-[900px] px-4 py-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
            {error || "Issue not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[900px] px-4 py-6 flex items-center justify-between">
        <BackButton href={`/toolbox/finished-fabric/store/issues/${issueId}`} label="Back to Issue" />
        <Button variant="primary" onClick={generatePdf} disabled={isGeneratingPdf}>
          {isGeneratingPdf ? "Generating PDF..." : "Download Packing List PDF"}
        </Button>
      </div>

      <div className="mx-auto max-w-[900px] px-4 pb-8">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-6 border-b border-slate-200 pb-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">UNICA TEXTILE MILLS</p>
              <h1 className="text-2xl font-semibold text-slate-900">Packing List</h1>
              <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                <p>
                  Issue No: <span className="font-medium text-slate-900">{formatIssueNo(header.issue_no)}</span>
                </p>
                <p>Date/Time: {formatDate(header.issue_time)}</p>
                <p>Destination: {header.destination || "—"}</p>
                <p>Customer: {getCustomerName(header.order)}</p>
                <p>Order Ref: {getOrderRef(header.order)}</p>
                <p>Invoice No: {header.invoice_no || "—"}</p>
                <p>Gate Pass No: {header.gate_pass_no || "—"}</p>
                <p>Reference: {header.reference || "—"}</p>
              </div>
              {header.notes ? (
                <p className="mt-2 text-sm text-slate-600">Notes: {header.notes}</p>
              ) : null}
              <p className="mt-3 text-sm font-medium text-slate-900">
                Total Rolls: {totals.rollCount} · Total Length: {totals.totalMeters.toFixed(3)} m
              </p>
            </div>
            <div className="w-28 h-14 flex items-center justify-center overflow-hidden">
              <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
            </div>
          </div>

          <div className="overflow-hidden border border-slate-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Length (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">GSM</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Colour</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Coating Type</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-700" colSpan={6}>
                      No items recorded.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const roll = item.roll || {};
                    const length = getItemLength(item);
                    return (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-slate-900 font-medium">
                          {item.roll_no || roll.roll_no || "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-900">
                          {length !== null ? length.toFixed(3) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{item.grade || roll.grade || "—"}</td>
                        <td className="px-4 py-3 text-right text-slate-900">
                          {roll.gsm !== null && roll.gsm !== undefined ? roll.gsm : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{roll.color || "—"}</td>
                        <td className="px-4 py-3 text-slate-900">{roll.coating_type || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {totals.totalMeters.toFixed(3)}
                  </td>
                  <td className="px-4 py-3" colSpan={3} />
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {totals.rollCount} roll(s)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <footer className="mt-6 pt-4 text-xs text-slate-600 border-t border-slate-200 flex justify-between">
            <span>Document Number: UTM-PACK-LIST-FT-001</span>
            <span>Use Download Packing List PDF for the printable report</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
