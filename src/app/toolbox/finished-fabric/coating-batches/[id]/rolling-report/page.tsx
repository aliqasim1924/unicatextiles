"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface CoatingBatch {
  id: string;
  batch_no: string | null;
  batch_date: string;
  coating_type: string;
  width_mm: number | null;
  planned_meters: number | null;
  color: string | null;
  gsm: number | null;
  actual_coated_meters: number | null;
  status: string;
}

interface FinishedRoll {
  id: string;
  roll_no: string | null;
  length_m: number;
  grade: string | null;
  notes: string | null;
  produced_at: string | null;
  created_at: string | null;
}

export default function RollingReportPage() {
  const params = useParams();
  const batchId = params.id as string;

  const [batch, setBatch] = useState<CoatingBatch | null>(null);
  const [finishedRolls, setFinishedRolls] = useState<FinishedRoll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (batchId) {
      fetchData();
    }
  }, [batchId]);

  async function fetchData() {
    try {
      setIsLoading(true);
      setError(null);

      const { data: batchData, error: batchError } = await supabaseBrowserClient
        .from("coating_batches")
        .select(
          "id, batch_no, batch_date, coating_type, width_mm, planned_meters, color, gsm, actual_coated_meters, status"
        )
        .eq("id", batchId)
        .single();
      if (batchError) throw batchError;
      setBatch(batchData as CoatingBatch);

      const { data: rollsData, error: rollsError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select("id, roll_no, length_m, grade, notes, produced_at, created_at")
        .eq("batch_id", batchId)
        .order("produced_at", { ascending: true });

      if (rollsError) throw rollsError;
      setFinishedRolls(
        (rollsData || []).map((row: any) => ({
          id: row.id,
          roll_no: row.roll_no ?? null,
          length_m: Number(row.length_m || 0),
          grade: row.grade ?? null,
          notes: row.notes ?? null,
          produced_at: row.produced_at ?? null,
          created_at: row.created_at ?? null,
        })) as FinishedRoll[]
      );
    } catch (err: any) {
      setError(err.message || "Failed to load report.");
    } finally {
      setIsLoading(false);
    }
  }

  const actualCoated = batch?.actual_coated_meters ?? null;
  const totalFinished = finishedRolls.reduce((sum, r) => sum + r.length_m, 0);
  const gradeSum = (grade: string) =>
    finishedRolls.filter((r) => r.grade === grade).reduce((sum, r) => sum + r.length_m, 0);
  const aMeters = gradeSum("A");
  const bMeters = gradeSum("B");
  const cMeters = gradeSum("C");
  const scrapMeters = gradeSum("SCRAP");

  const yieldPercent =
    actualCoated !== null && actualCoated > 0 ? (totalFinished / actualCoated) * 100 : null;
  const percentOfCoated = (val: number) =>
    actualCoated !== null && actualCoated > 0 ? (val / actualCoated) * 100 : null;
  const aPercent = percentOfCoated(aMeters);
  const bPercent = percentOfCoated(bMeters);
  const cPercent = percentOfCoated(cMeters);
  const scrapPercent = percentOfCoated(scrapMeters);

  function formatDate(dateString?: string | null) {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleDateString("en-ZA");
    } catch {
      return dateString;
    }
  }

  function formatDateTime(dateString?: string | null) {
    if (!dateString) return "—";
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

  function formatMeters(value: number | null | undefined) {
    if (value === null || value === undefined) return "—";
    return `${value.toFixed(2)} m`;
  }

  function formatPercent(value: number | null) {
    return value !== null ? `${value.toFixed(1)}%` : "—";
  }

  async function generatePdf() {
    if (!batch) return;
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
      const batchNoLabel = batch.batch_no || "BATCH";
      const documentNo = "UTM-ROLL-REP-FT-001";
      const contentWidth = pageWidth - marginLeft - marginRight;

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

      const addContinuationHeader = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text("UNICA TEXTILE MILLS — Rolling Report", marginLeft, marginTop + 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(batchNoLabel, pageWidth - marginRight, marginTop + 4, { align: "right" });
        doc.setTextColor(0, 0, 0);
      };

      const addHeader = () => {
        let y = headerTopOffset;

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("UNICA TEXTILE MILLS", marginLeft, y);
        y += 6;

        doc.setFontSize(12);
        doc.text("Rolling Report (Finished Fabric)", marginLeft, y);
        y += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        const leftCol = [
          `Batch No: ${batch.batch_no || "—"}`,
          `Batch Date: ${formatDate(batch.batch_date)}`,
          `Coating Type: ${batch.coating_type || "—"}`,
          `Colour: ${batch.color || "—"}`,
          `GSM: ${batch.gsm != null ? String(batch.gsm) : "—"}`,
        ];
        const rightCol = [
          `Width: ${batch.width_mm ? `${batch.width_mm} mm` : "—"}`,
          `Planned Meters: ${formatMeters(batch.planned_meters)}`,
          `Coated Meters: ${formatMeters(actualCoated)}`,
          `Total Finished: ${formatMeters(totalFinished)}`,
          `Status: ${batch.status}`,
        ];

        const colWidth = contentWidth / 2;
        const maxRows = Math.max(leftCol.length, rightCol.length);
        for (let i = 0; i < maxRows; i++) {
          if (leftCol[i]) doc.text(leftCol[i], marginLeft, y);
          if (rightCol[i]) doc.text(rightCol[i], marginLeft + colWidth, y);
          y += 5;
        }

        y += 2;
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.line(marginLeft, y, pageWidth - marginRight, y);
        y += 5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(
          `Yield: ${yieldPercent !== null ? `${yieldPercent.toFixed(1)}%` : "—"}    Rolls: ${finishedRolls.length}    Finished: ${totalFinished.toFixed(2)} m`,
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
        const colWidth = contentWidth / 2;
        const roles = ["Production Manager", "Rolling Supervisor"];

        doc.setTextColor(0, 0, 0);
        roles.forEach((role, index) => {
          const x = marginLeft + index * colWidth;
          const lineY = y + 12;
          doc.setLineWidth(0.3);
          doc.setDrawColor(80, 80, 80);
          doc.line(x, lineY, x + colWidth - 10, lineY);
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.text(role, x, lineY + 4);
          doc.setFontSize(7);
          doc.setTextColor(120, 120, 120);
          doc.text("Name / Signature / Date", x, lineY + 8);
          doc.setTextColor(0, 0, 0);
        });
      };

      const tableOptions = {
        rowPageBreak: "avoid" as const,
        margin: {
          left: marginLeft,
          right: marginRight,
          top: marginTop + 12,
          bottom: marginBottom + 4,
        },
        theme: "grid" as const,
        styles: {
          fontSize: 8,
          cellPadding: 1.6,
          lineColor: [180, 180, 180] as [number, number, number],
          lineWidth: 0.2,
          textColor: [30, 30, 30] as [number, number, number],
        },
        headStyles: {
          fillColor: [15, 118, 110] as [number, number, number],
          textColor: [255, 255, 255] as [number, number, number],
          fontStyle: "bold" as const,
          halign: "left" as const,
        },
        footStyles: {
          fillColor: [241, 245, 249] as [number, number, number],
          textColor: [15, 23, 42] as [number, number, number],
          fontStyle: "bold" as const,
        },
        showHead: "everyPage" as const,
        didDrawPage: (data: any) => {
          if (data.pageNumber > 1) addContinuationHeader();
        },
      };

      const ensureSpace = (startY: number, needed: number) => {
        if (startY + needed > pageHeight - marginBottom - 8) {
          doc.addPage();
          addContinuationHeader();
          return marginTop + 12;
        }
        return startY;
      };

      const sectionTitle = (title: string, startY: number) => {
        const nextY = ensureSpace(startY, 12);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(title, marginLeft, nextY);
        return nextY + 3;
      };

      let y = addHeader();

      y = sectionTitle("Yield & Grades Summary", y + 2);
      autoTable(doc, {
        ...tableOptions,
        startY: y,
        head: [["Grade", "Meters", "% of Coated"]],
        body: [
          ["A", aMeters.toFixed(2), formatPercent(aPercent)],
          ["B", bMeters.toFixed(2), formatPercent(bPercent)],
          ["C", cMeters.toFixed(2), formatPercent(cPercent)],
          ["Scrap", scrapMeters.toFixed(2), formatPercent(scrapPercent)],
        ],
        foot: [
          [
            "Total finished / yield",
            totalFinished.toFixed(2),
            yieldPercent !== null ? `${yieldPercent.toFixed(1)}%` : "—",
          ],
        ],
        showFoot: "lastPage",
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 60, halign: "right" },
          2: { cellWidth: contentWidth - 110, halign: "right" },
        },
      });

      y = (doc as any).lastAutoTable?.finalY ?? y;

      y = sectionTitle("Finished Rolls (Rolling & Inspection)", y + 10);
      autoTable(doc, {
        ...tableOptions,
        startY: y,
        head: [["Roll No", "Length (m)", "Grade", "Notes", "Produced At"]],
        body:
          finishedRolls.length > 0
            ? finishedRolls.map((roll) => [
                roll.roll_no || "—",
                roll.length_m.toFixed(2),
                roll.grade || "—",
                roll.notes || "—",
                formatDateTime(roll.produced_at || roll.created_at),
              ])
            : [["—", "—", "—", "No finished rolls recorded yet", "—"]],
        foot: [["Total Finished Meters", totalFinished.toFixed(2), "", `${finishedRolls.length} roll(s)`, ""]],
        showFoot: "lastPage",
        columnStyles: {
          0: { cellWidth: 36 },
          1: { cellWidth: 26, halign: "right" },
          2: { cellWidth: 20, halign: "center" },
          3: { cellWidth: contentWidth - 118 },
          4: { cellWidth: 36 },
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

      doc.save(`Rolling Report ${batchNoLabel}.pdf`);
    } catch (err: any) {
      console.error("Failed to generate rolling report PDF", err);
      setError(err.message || "Failed to generate rolling report PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            Loading report...
          </div>
        </div>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
            {error || "Report not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-6 flex items-center justify-between">
        <BackButton
          href={`/toolbox/finished-fabric/coating-batches/${batch.id}`}
          label="Back to Batch"
        />
        <Button variant="primary" onClick={generatePdf} disabled={isGeneratingPdf}>
          {isGeneratingPdf ? "Generating PDF..." : "Download Rolling Report PDF"}
        </Button>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-8">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-6 border-b border-slate-200 pb-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">UNICA TEXTILE MILLS</p>
              <h1 className="text-2xl font-semibold text-slate-900">
                Rolling Report (Finished Fabric)
              </h1>
              <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                <p>
                  Batch No:{" "}
                  <span className="font-medium text-slate-900">{batch.batch_no ?? "—"}</span>
                </p>
                <p>Batch Date: {formatDate(batch.batch_date)}</p>
                <p>Coating Type: {batch.coating_type}</p>
                <p>Colour: {batch.color ?? "—"}</p>
                <p>GSM: {batch.gsm != null ? String(batch.gsm) : "—"}</p>
                <p>Width: {batch.width_mm ? `${batch.width_mm} mm` : "—"}</p>
                <p>Planned Meters: {formatMeters(batch.planned_meters)}</p>
                <p>Coated Meters: {formatMeters(actualCoated)}</p>
                <p>Total Finished: {formatMeters(totalFinished)}</p>
                <p>Status: {batch.status}</p>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-900">
                Yield: {yieldPercent !== null ? `${yieldPercent.toFixed(1)}%` : "—"} · Rolls:{" "}
                {finishedRolls.length} · Finished: {totalFinished.toFixed(2)} m
              </p>
            </div>
            <div className="w-28 h-14 flex items-center justify-center overflow-hidden">
              <img src="/Logo.png" alt="Company Logo" className="h-full w-full object-contain" />
            </div>
          </div>

          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Yield & Grades Summary
          </h2>
          <div className="mb-6 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <Th>Grade</Th>
                  <Th className="text-right">Meters</Th>
                  <Th className="text-right">% of Coated</Th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <Td>A</Td>
                  <Td className="text-right">{aMeters.toFixed(2)}</Td>
                  <Td className="text-right">{formatPercent(aPercent)}</Td>
                </tr>
                <tr className="border-b border-slate-100">
                  <Td>B</Td>
                  <Td className="text-right">{bMeters.toFixed(2)}</Td>
                  <Td className="text-right">{formatPercent(bPercent)}</Td>
                </tr>
                <tr className="border-b border-slate-100">
                  <Td>C</Td>
                  <Td className="text-right">{cMeters.toFixed(2)}</Td>
                  <Td className="text-right">{formatPercent(cPercent)}</Td>
                </tr>
                <tr className="border-b border-slate-100">
                  <Td>Scrap</Td>
                  <Td className="text-right">{scrapMeters.toFixed(2)}</Td>
                  <Td className="text-right">{formatPercent(scrapPercent)}</Td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Finished Rolls (Rolling & Inspection)
          </h2>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <Th>Roll No</Th>
                  <Th className="text-right">Length (m)</Th>
                  <Th>Grade</Th>
                  <Th>Notes</Th>
                  <Th>Produced At</Th>
                </tr>
              </thead>
              <tbody>
                {finishedRolls.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-center text-slate-600" colSpan={5}>
                      No finished rolls recorded yet.
                    </td>
                  </tr>
                ) : (
                  finishedRolls.map((roll) => (
                    <tr key={roll.id} className="border-b border-slate-100">
                      <Td className="font-medium">{roll.roll_no ?? "—"}</Td>
                      <Td className="text-right">{roll.length_m.toFixed(2)}</Td>
                      <Td>{roll.grade ?? "—"}</Td>
                      <Td>{roll.notes ?? "—"}</Td>
                      <Td>{formatDateTime(roll.produced_at || roll.created_at)}</Td>
                    </tr>
                  ))
                )}
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2 text-slate-900">Total Finished Meters</td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {totalFinished.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-slate-900" colSpan={3}>
                    {finishedRolls.length} roll(s)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <footer className="mt-6 pt-4 text-xs text-slate-600 border-t border-slate-200 flex justify-between">
            <span>Document Number: UTM-ROLL-REP-FT-001</span>
            <span>Use Download Rolling Report PDF for the printable report</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-3 text-left font-semibold text-slate-900 ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 text-slate-900 ${className}`}>{children}</td>;
}
