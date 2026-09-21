"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface IssueItem {
  id: string;
  roll_id: string | null;
  roll_no: string | null;
  length_m: number | null;
  grade: string | null;
  color: string | null;
  serial_no: number | null;
  sequence_no: number;
  is_returned?: boolean;
  return_no?: number | null;
}

interface IssueHeader {
  id: string;
  issue_no: number | null;
  issue_time: string;
  destination: string | null;
  reference: string | null;
  notes: string | null;
  status: "ACTIVE" | "PARTIALLY_RETURNED" | "RETURNED";
  order_id?: string | null;
  invoice_no?: string | null;
  gate_pass_no?: string | null;
  order?: any | null;
}

export default function FinishedFabricStoreIssueDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const issueId = params.id as string;
  const backOrderId = searchParams.get("back_order");

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

      // Fetch issue header and items including roll color
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
          status,
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
              serial_no,
              color
            )
          )
        `
        )
        .eq("id", issueId)
        .single();

      if (fetchError) throw fetchError;

      // Fetch non-reversed returns for this issue to identify returned rolls
      const { data: returnsData } = await supabaseBrowserClient
        .from("finished_fabric_store_issue_returns")
        .select(
          `
          return_no,
          status,
          finished_fabric_store_issue_return_items (
            roll_id
          )
        `
        )
        .eq("issue_id", issueId)
        .neq("status", "REVERSED");

      const returnedRollMap = new Map<string, number | null>();
      (returnsData || []).forEach((ret: any) => {
        (ret.finished_fabric_store_issue_return_items || []).forEach((ri: any) => {
          if (ri.roll_id) {
            returnedRollMap.set(ri.roll_id, ret.return_no ?? null);
          }
        });
      });

      let order = Array.isArray(data.customer_orders) ? data.customer_orders[0] : data.customer_orders;
      if (order && Array.isArray(order.customers)) {
        order = { ...order, customers: order.customers[0] ?? null };
      }

      // Dynamic fallback to customer order invoice/gate pass numbers if null/empty on the issue slip
      const invoiceNo =
        data.invoice_no && data.invoice_no.trim() !== ""
          ? data.invoice_no
          : (order?.invoice_no ?? null);

      const gatePassNo =
        data.gate_pass_no && data.gate_pass_no.trim() !== ""
          ? data.gate_pass_no
          : (order?.gate_pass_no ?? null);

      setHeader({
        id: data.id,
        issue_no: data.issue_no ?? null,
        issue_time: data.issue_time,
        destination: data.destination ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        status: data.status || "ACTIVE",
        order_id: data.order_id ?? null,
        invoice_no: invoiceNo,
        gate_pass_no: gatePassNo,
        order: order ?? null,
      });

      // Calculate sequence offset from all prior active dispatches for this order
      let priorActiveRollsCount = 0;
      if (data.order_id && data.issue_no) {
        const { data: priorIssues } = await supabaseBrowserClient
          .from("finished_fabric_store_issues")
          .select(
            `
            id,
            finished_fabric_store_issue_items ( id, roll_id )
          `
          )
          .eq("order_id", data.order_id)
          .lt("issue_no", data.issue_no);

        const priorIssueIds = (priorIssues || []).map((i: any) => i.id);

        if (priorIssueIds.length > 0) {
          const { data: priorReturns } = await supabaseBrowserClient
            .from("finished_fabric_store_issue_returns")
            .select(
              `
              finished_fabric_store_issue_return_items ( roll_id )
            `
            )
            .in("issue_id", priorIssueIds)
            .neq("status", "REVERSED");

          const priorReturnedRollIds = new Set<string>();
          (priorReturns || []).forEach((ret: any) => {
            (ret.finished_fabric_store_issue_return_items || []).forEach((ri: any) => {
              if (ri.roll_id) priorReturnedRollIds.add(ri.roll_id);
            });
          });

          (priorIssues || []).forEach((pi: any) => {
            (pi.finished_fabric_store_issue_items || []).forEach((item: any) => {
              if (!item.roll_id || !priorReturnedRollIds.has(item.roll_id)) {
                priorActiveRollsCount += 1;
              }
            });
          });
        }
      }

      const rawItems = data.finished_fabric_store_issue_items || [];

      // Sort items strictly by roll serial_no ASC
      rawItems.sort((a: any, b: any) => {
        const rollA = Array.isArray(a.finished_fabric_rolls) ? a.finished_fabric_rolls[0] : a.finished_fabric_rolls;
        const rollB = Array.isArray(b.finished_fabric_rolls) ? b.finished_fabric_rolls[0] : b.finished_fabric_rolls;
        return (rollA?.serial_no ?? 0) - (rollB?.serial_no ?? 0);
      });

      let activeCounter = 0;
      const mapped: IssueItem[] = rawItems.map((row: any) => {
        const roll = Array.isArray(row.finished_fabric_rolls)
          ? row.finished_fabric_rolls[0]
          : row.finished_fabric_rolls;
        const rollId = row.roll_id ?? null;
        const isReturned = rollId ? returnedRollMap.has(rollId) : false;
        const returnNo = rollId ? returnedRollMap.get(rollId) ?? null : null;

        if (!isReturned) {
          activeCounter += 1;
        }

        return {
          id: row.id as string,
          roll_id: rollId,
          roll_no: row.roll_no ?? null,
          length_m: row.length_m !== null ? Number(row.length_m) : null,
          grade: row.grade ?? null,
          color: roll?.color ?? null,
          serial_no: roll?.serial_no ?? null,
          sequence_no: priorActiveRollsCount + activeCounter,
          is_returned: isReturned,
          return_no: returnNo,
        };
      });

      setItems(mapped);
    } catch (err: any) {
      setError(err.message || "Failed to load issue.");
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

  function handlePrintLabels() {
    const rollIds = items.filter((i) => !i.is_returned).map((i) => i.roll_id).filter(Boolean);
    if (rollIds.length === 0) {
      alert("No active rolls available for label printing on this issue.");
      return;
    }

    const issueNo = header?.issue_no ? String(header.issue_no) : "";
    window.open(
      `/toolbox/qr/print?type=finished_fabric&rollIds=${rollIds.join(",")}&issueNo=${issueNo}&issueId=${issueId}`,
      "_blank"
    );
  }

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
      const issueNoLabel = formatIssueNo(header.issue_no);
      const documentNo = "UTM-FF-STORE-ISS-FT-001";

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
                // ignore
              }
              resolve();
            };
            logoImg.onerror = () => resolve();
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 1000)),
        ]);
      } catch {
        // ignore
      }

      const addHeader = () => {
        let y = headerTopOffset;

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("UNICA TEXTILE MILLS", marginLeft, y);
        y += 6;

        doc.setFontSize(12);
        doc.text("Finished Fabric Store Issue", marginLeft, y);
        y += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        const leftCol = [
          `Issue No: ${issueNoLabel}`,
          `Date/Time: ${formatDate(header.issue_time)}`,
          `Destination: ${header.destination || "—"}`,
          `Reference: ${header.reference || "—"}`,
        ];
        const rightCol = [
          `Customer: ${getCustomerName(header.order)}`,
          `Invoice No: ${header.invoice_no || "—"}`,
          `Gate Pass No: ${header.gate_pass_no || "—"}`,
          `Status: ${header.status}`,
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
          `Total Issued Meters: ${totalMeters.toFixed(3)} m    Active Meters: ${activeMeters.toFixed(3)} m`,
          marginLeft,
          y
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
          { align: "right" }
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
        const serialStr = String(item.sequence_no).padStart(2, "0");
        const statusText = item.is_returned
          ? `Returned ${item.return_no ? `(FFIR-${String(item.return_no).padStart(6, "0")})` : ""}`
          : "Issued";
        return [
          serialStr,
          item.roll_no || "—",
          item.length_m !== null ? item.length_m.toFixed(3) : "—",
          item.grade || "—",
          item.color || "—",
          statusText,
        ];
      });

      autoTable(doc, {
        head: [["Roll #", "IRR #", "Length (m)", "Grade", "Colour", "Status"]],
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
          0: { cellWidth: 16, fontStyle: "bold", halign: "center" },
          1: { cellWidth: 36 },
          2: { cellWidth: 28, halign: "right" },
          3: { cellWidth: 18, halign: "center" },
          4: { cellWidth: 45 },
          5: { cellWidth: 39 },
        },
        showHead: "everyPage",
        didDrawPage: (data: any) => {
          if (data.pageNumber > 1) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text("UNICA TEXTILE MILLS — Store Issue Slip", marginLeft, marginTop + 4);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 80);
            doc.text(
              `${issueNoLabel} · ${getCustomerName(header.order)}`,
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

      doc.save(`Store Issue ${issueNoLabel}.pdf`);
    } catch (err: any) {
      console.error("Failed to generate store issue PDF", err);
      setError(err.message || "Failed to generate store issue PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            Loading issue...
          </div>
        </div>
      </div>
    );
  }

  if (error || !header) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
            {error || "Issue not found."}
          </div>
        </div>
      </div>
    );
  }

  const activeMeters = items
    .filter((i) => !i.is_returned)
    .reduce((sum, i) => sum + (i.length_m || 0), 0);
  const totalMeters = items.reduce((sum, i) => sum + (i.length_m || 0), 0);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-3">
        {backOrderId && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
            A back order was created for the remaining quantity.{" "}
            <Link
              href={`/toolbox/orders/${backOrderId}`}
              className="font-semibold text-teal-700 underline hover:text-teal-900"
            >
              Open back order →
            </Link>
          </div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <BackButton href="/toolbox/finished-fabric/store" label="Back to Store" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handlePrintLabels}>
              Print Roll Labels
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (issueId) {
                  window.location.href = `/toolbox/finished-fabric/store/issues/${issueId}/packing-list`;
                }
              }}
            >
              Print Packing List
            </Button>
            <Button variant="primary" onClick={generatePdf} disabled={isGeneratingPdf}>
              {isGeneratingPdf ? "Generating PDF..." : "Download Issue Slip PDF"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 pb-8">
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-6 border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-teal-700">UNICA TEXTILE MILLS</p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    header.status === "RETURNED"
                      ? "bg-purple-100 text-purple-800 border border-purple-200"
                      : header.status === "PARTIALLY_RETURNED"
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  }`}
                >
                  {header.status}
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-slate-900 mt-1">
                Finished Fabric Store Issue
              </h1>
              <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                <p>
                  Issue No: <span className="font-medium text-slate-900">{formatIssueNo(header.issue_no)}</span>
                </p>
                <p>Date/Time: {formatDate(header.issue_time)}</p>
                <p>Destination: {header.destination || "—"}</p>
                <p>Customer: {getCustomerName(header.order)}</p>
                <p>Invoice No: {header.invoice_no || "—"}</p>
                <p>Gate Pass No: {header.gate_pass_no || "—"}</p>
                <p>Reference: {header.reference && header.reference.trim() !== "" ? header.reference : "—"}</p>
              </div>
              {header.notes ? (
                <p className="mt-2 text-sm text-slate-600">Notes: {header.notes}</p>
              ) : null}
            </div>
            <div className="w-28 h-14 rounded-lg flex items-center justify-center overflow-hidden">
              <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between text-sm text-slate-700 flex-wrap gap-2">
            <div>
              Total Issued: {totalMeters.toFixed(3)}m
            </div>
            {header.status !== "ACTIVE" && (
              <div className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Active Meters: {activeMeters.toFixed(3)}m
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Serial #</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Roll No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Length (m)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Grade</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Colour</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
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
                    const serialStr = String(item.sequence_no).padStart(2, "0");
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-100 ${
                          item.is_returned ? "bg-slate-50 text-slate-400 line-through" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-bold">
                          {serialStr}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {item.roll_no || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {item.length_m !== null ? item.length_m.toFixed(3) : "—"}
                        </td>
                        <td className="px-4 py-3">{item.grade || "—"}</td>
                        <td className="px-4 py-3 max-w-[160px] truncate">{item.color || "—"}</td>
                        <td className="px-4 py-3 no-underline">
                          {item.is_returned ? (
                            <span className="inline-flex items-center text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              Returned {item.return_no ? `(FFIR-${String(item.return_no).padStart(6, "0")})` : ""}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-emerald-700">Issued</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <footer className="mt-8 pt-4 text-xs text-slate-600 border-t border-slate-200 flex justify-between">
            <span>Document Number: UTM-FF-STORE-ISS-FT-001</span>
            <span>Use Download Issue Slip PDF for the printable report</span>
          </footer>
        </div>
      </div>
    </div>
  );
}