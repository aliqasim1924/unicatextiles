"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { generateQRCode } from "@/lib/qr/generateQRCode";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const LOCATION_WEAVING = "WEAVING";
const STATUS_AVAILABLE = "AVAILABLE";

/** Predefined reasons for variances (including add/remove for balancing). */
const VARIANCE_REASONS = [
  { value: "", label: "— Select or type —" },
  { value: "Manufactured – not recorded in app", label: "Manufactured – not recorded in app" },
  { value: "Outsourced – not recorded in app", label: "Outsourced – not recorded in app" },
  { value: "Stock balancing – initial setup", label: "Stock balancing – initial setup" },
  { value: "Stock balancing – quantity correction", label: "Stock balancing – quantity correction" },
  { value: "Roll lost or damaged", label: "Roll lost or damaged" },
  { value: "Measurement variance (re-measured)", label: "Measurement variance (re-measured)" },
  { value: "Other", label: "Other" },
];

/** Reasons when adding an unrecorded roll. */
const UNRECORDED_ROLL_REASONS = [
  { value: "Manufactured – not recorded in app", label: "Manufactured – not recorded in app" },
  { value: "Outsourced – not recorded in app", label: "Outsourced – not recorded in app" },
  { value: "Stock balancing – initial setup", label: "Stock balancing – initial setup" },
  { value: "Stock balancing – quantity correction", label: "Stock balancing – quantity correction" },
  { value: "Other", label: "Other" },
];

interface Session {
  id: string;
  name: string;
  stocktake_date: string;
  performed_by: string;
  status: string;
  created_at: string;
  notes: string | null;
}

interface Line {
  id: string;
  base_fabric_roll_id: string;
  system_qty: number;
  counted_qty: number | null;
  variance_qty: number | null;
  reason: string | null;
  note: string | null;
  base_fabric_rolls?: {
    roll_no: string | null;
    qr_code: string | null;
    length_m: number;
    base_fabric_orders?: {
      order_no: string | null;
      loom_no: number | null;
      base_fabric_items?: {
        name: string | null;
      } | null;
    } | null;
  } | null;
}

interface RollRow {
  id: string;
  roll_no: string | null;
  qr_code: string | null;
  length_m: number;
  base_fabric_orders?: {
    order_no: string | null;
    loom_no: number | null;
    base_fabric_items?: {
      name: string | null;
    } | null;
  } | null;
}

export default function BaseFabricStocktakeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [fabricItems, setFabricItems] = useState<{ id: string; name: string }[]>([]);
  const [showAddRollModal, setShowAddRollModal] = useState(false);
  const [addRollForm, setAddRollForm] = useState({
    base_fabric_item_id: "",
    roll_no: "",
    loom_no: "",
    length_m: "",
    reason: "",
    note: "",
  });
  const [isAddingRoll, setIsAddingRoll] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    loadData();
  }, [sessionId]);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [
        { data: sessionData, error: sessionError },
        { data: linesData, error: linesError },
        { data: itemsData, error: itemsError },
      ] = await Promise.all([
        supabaseBrowserClient
          .from("base_fabric_stocktake_sessions")
          .select("id, name, stocktake_date, performed_by, status, created_at, notes")
          .eq("id", sessionId)
          .single(),
        supabaseBrowserClient
          .from("base_fabric_stocktake_lines")
          .select(
            `
              id,
              base_fabric_roll_id,
              system_qty,
              counted_qty,
              variance_qty,
              reason,
              note,
              base_fabric_rolls:base_fabric_roll_id (
                roll_no,
                qr_code,
                length_m,
                base_fabric_orders:base_fabric_order_id (
                  order_no,
                  loom_no,
                  base_fabric_items:base_fabric_item_id (
                    name
                  )
                )
              )
            `,
          )
          .eq("session_id", sessionId)
          .order("id"),
        supabaseBrowserClient
          .from("base_fabric_items")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      if (sessionError) throw sessionError;
      if (linesError) throw linesError;
      if (itemsError) throw itemsError;
      setFabricItems((itemsData as { id: string; name: string }[]) || []);

      setSession(sessionData as Session);
      const processed = (linesData as any[])?.map((row) => {
        const roll = Array.isArray(row.base_fabric_rolls)
          ? row.base_fabric_rolls[0]
          : row.base_fabric_rolls;
        const order = roll?.base_fabric_orders
          ? Array.isArray(roll.base_fabric_orders)
            ? roll.base_fabric_orders[0]
            : roll.base_fabric_orders
          : null;
        const item = order?.base_fabric_items
          ? Array.isArray(order.base_fabric_items)
            ? order.base_fabric_items[0]
            : order.base_fabric_items
          : null;

        return {
          ...row,
          base_fabric_rolls: roll
            ? {
                ...roll,
                base_fabric_orders: order
                  ? {
                      ...order,
                      base_fabric_items: item,
                    }
                  : null,
              }
            : null,
        };
      }) as Line[];
      setLines(processed || []);

      if (!linesData || (linesData as any[]).length === 0) {
        await generateLinesFromCurrentStock(sessionData as Session);
      }
    } catch (err: any) {
      console.error("Failed to load stocktake", err);
      setError(err.message || "Failed to load stocktake session.");
    } finally {
      setIsLoading(false);
    }
  }

  async function generateLinesFromCurrentStock(currentSession: Session | null) {
    try {
      const { data: stockData, error: stockError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .select(
          `
          id,
          roll_no,
          qr_code,
          length_m,
          base_fabric_orders:base_fabric_order_id (
            order_no,
            loom_no,
            base_fabric_items:base_fabric_item_id (
              name
            )
          )
        `,
        )
        .eq("current_location", LOCATION_WEAVING)
        .eq("status", STATUS_AVAILABLE)
        .order("cut_at", { ascending: false });

      if (stockError) throw stockError;

      const rollRows: RollRow[] =
        (stockData as any[])?.map((row) => {
          const order = Array.isArray(row.base_fabric_orders)
            ? row.base_fabric_orders[0]
            : row.base_fabric_orders;
          const item = order?.base_fabric_items
            ? Array.isArray(order.base_fabric_items)
              ? order.base_fabric_items[0]
              : order.base_fabric_items
            : null;

          return {
            id: row.id,
            roll_no: row.roll_no,
            qr_code: row.qr_code,
            length_m: Number(row.length_m || 0),
            base_fabric_orders: order
              ? {
                  order_no: order.order_no || null,
                  loom_no: order.loom_no || null,
                  base_fabric_items: item || null,
                }
              : null,
          };
        }) || [];

      if (rollRows.length === 0) {
        return;
      }

      const payload = rollRows.map((roll) => ({
        session_id: currentSession?.id || sessionId,
        base_fabric_roll_id: roll.id,
        system_qty: roll.length_m,
        counted_qty: roll.length_m,
        variance_qty: 0,
      }));

      const { error: upsertError } = await supabaseBrowserClient
        .from("base_fabric_stocktake_lines")
        .upsert(payload, { onConflict: "session_id,base_fabric_roll_id" });
      if (upsertError) throw upsertError;

      const { data: linesData, error: linesError } = await supabaseBrowserClient
        .from("base_fabric_stocktake_lines")
        .select(
          `
          id,
          base_fabric_roll_id,
          system_qty,
          counted_qty,
          variance_qty,
          reason,
          note,
          base_fabric_rolls:base_fabric_roll_id (
            roll_no,
            qr_code,
            length_m,
            base_fabric_orders:base_fabric_order_id (
              order_no,
              loom_no,
              base_fabric_items:base_fabric_item_id (
                name
              )
            )
          )
        `,
        )
        .eq("session_id", currentSession?.id || sessionId)
        .order("id");

      if (linesError) throw linesError;

      const processed = (linesData as any[])?.map((row) => {
        const roll = Array.isArray(row.base_fabric_rolls)
          ? row.base_fabric_rolls[0]
          : row.base_fabric_rolls;
        const order = roll?.base_fabric_orders
          ? Array.isArray(roll.base_fabric_orders)
            ? roll.base_fabric_orders[0]
            : roll.base_fabric_orders
          : null;
        const item = order?.base_fabric_items
          ? Array.isArray(order.base_fabric_items)
            ? order.base_fabric_items[0]
            : order.base_fabric_items
          : null;

        return {
          ...row,
          base_fabric_rolls: roll
            ? {
                ...roll,
                base_fabric_orders: order
                  ? {
                      ...order,
                      base_fabric_items: item,
                    }
                  : null,
              }
            : null,
        };
      }) as Line[];
      setLines(processed || []);
    } catch (err: any) {
      console.error("Failed to generate stocktake lines", err);
      setError(
        err.message || "Failed to generate stocktake lines from current stock.",
      );
    }
  }

  function updateLineLocal(id: string, updates: Partial<Line>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const updated: Line = { ...line, ...updates };
        const counted = updates.counted_qty ?? updated.counted_qty;
        if (counted !== null && counted !== undefined) {
          updated.variance_qty = counted - updated.system_qty;
        }
        return updated;
      }),
    );
  }

  const variances = useMemo(() => {
    const withVariance = lines.filter((l) => (l.variance_qty ?? 0) !== 0);
    const missingReason = withVariance.filter(
      (l) => !l.reason || !l.reason.trim(),
    );
    return {
      totalCount: withVariance.length,
      hasMissingReasons: missingReason.length > 0,
    };
  }, [lines]);

  async function saveLines() {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updates = lines.map((line) => ({
        id: line.id,
        session_id: session?.id || sessionId,
        base_fabric_roll_id: line.base_fabric_roll_id,
        system_qty: line.system_qty,
        counted_qty: line.counted_qty,
        variance_qty:
          line.counted_qty === null || line.counted_qty === undefined
            ? null
            : line.counted_qty - line.system_qty,
        reason: line.reason || null,
        note: line.note || null,
      }));

      const { error: updateError } = await supabaseBrowserClient
        .from("base_fabric_stocktake_lines")
        .upsert(updates);
      if (updateError) throw updateError;

      setSuccess("Stocktake counts saved.");
    } catch (err: any) {
      console.error("Failed to save lines", err);
      setError(err.message || "Failed to save stocktake counts.");
    } finally {
      setIsSaving(false);
    }
  }

  async function addUnrecordedRoll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!session) return;
    if (session.status === "posted") {
      setError("Cannot add rolls to a posted stocktake.");
      return;
    }
    const lengthM = parseFloat(addRollForm.length_m);
    if (!addRollForm.base_fabric_item_id.trim()) {
      setError("Please select a fabric.");
      return;
    }
    if (!Number.isFinite(lengthM) || lengthM <= 0) {
      setError("Enter a valid length (m) greater than zero.");
      return;
    }
    const reasonText =
      addRollForm.reason === "Other" ? addRollForm.note.trim() : addRollForm.reason;
    if (!reasonText) {
      setError("Please select or enter a reason for this unrecorded roll.");
      return;
    }
    if (addRollForm.reason === "Other" && !addRollForm.note.trim()) {
      setError("Please enter a reason in the note field when selecting Other.");
      return;
    }

    setIsAddingRoll(true);
    try {
      const orderNotes = `Stocktake – unrecorded roll. Session: ${session.name} (${session.stocktake_date}). Reason: ${reasonText}`;
      const isOutsourced =
        addRollForm.reason === "Outsourced – not recorded in app";

      const { data: orderData, error: orderError } = await supabaseBrowserClient
        .from("base_fabric_orders")
        .insert({
          base_fabric_item_id: addRollForm.base_fabric_item_id.trim(),
          planned_qty_m: lengthM,
          loom_no: addRollForm.loom_no.trim() || null,
          status: "COMPLETED",
          is_outsourced: isOutsourced,
          beam_weft_not_required: true,
          notes: orderNotes,
          actual_completion_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      const qrCode = generateQRCode("base_fabric");
      const { data: rollData, error: rollError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .insert({
          base_fabric_order_id: orderData.id,
          roll_no: addRollForm.roll_no.trim() || null,
          length_m: lengthM,
          qr_code: qrCode,
          cut_at: new Date().toISOString(),
          // Do not treat as in-stock until stocktake is posted
          current_location: LOCATION_WEAVING,
          status: "PENDING_STOCKTAKE",
        })
        .select("id")
        .single();

      if (rollError) throw rollError;

      const { error: lineError } = await supabaseBrowserClient
        .from("base_fabric_stocktake_lines")
        .insert({
          session_id: session.id,
          base_fabric_roll_id: rollData.id,
          system_qty: 0,
          counted_qty: lengthM,
          variance_qty: lengthM,
          reason: reasonText,
          note: addRollForm.note.trim() || null,
        });

      if (lineError) throw lineError;

      setSuccess("Unrecorded roll added. Reloading list.");
      setShowAddRollModal(false);
      setAddRollForm({
        base_fabric_item_id: "",
        roll_no: "",
        loom_no: "",
        length_m: "",
        reason: "",
        note: "",
      });
      await loadData();
    } catch (err: any) {
      console.error("Failed to add unrecorded roll", err);
      setError(err.message || "Failed to add unrecorded roll.");
    } finally {
      setIsAddingRoll(false);
    }
  }

  async function postAdjustments() {
    if (!session) return;
    if (session.status === "posted") {
      setError("This stocktake has already been posted.");
      return;
    }

    if (variances.hasMissingReasons) {
      setError("All variances must have a reason before posting.");
      return;
    }

    const confirm = window.confirm(
      "Posting will mark missing rolls and update roll statuses. Continue?",
    );
    if (!confirm) return;

    setIsPosting(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { user },
      } = await supabaseBrowserClient.auth.getUser();

      // For base fabric rolls, we handle variances differently:
      // - If counted_qty < system_qty (or 0), mark roll as missing/lost
      // - If counted_qty > system_qty, it's an extra roll found (less common)
      const rollUpdates: Array<{
        id: string;
        status?: string;
        current_location?: string;
        notes?: string;
      }> = [];

      lines
        .filter((line) => (line.variance_qty ?? 0) !== 0)
        .forEach((line) => {
          const variance = line.variance_qty ?? 0;
          const reasonText = line.reason || "";
          const baseNotes = `Base fabric stocktake ${session.name} (${session.stocktake_date})`;
          const fullNotes = reasonText
            ? `${baseNotes} - Reason: ${reasonText}`
            : baseNotes;

          // New extra roll (unrecorded roll added during stocktake: system = 0, counted > 0)
          if ((line.system_qty ?? 0) === 0 && (line.counted_qty ?? 0) > 0) {
            rollUpdates.push({
              id: line.base_fabric_roll_id,
              status: STATUS_AVAILABLE,
              current_location: LOCATION_WEAVING,
              notes: fullNotes,
            });
          }
          // If counted is 0 or significantly less, mark as missing/lost
          else if (line.counted_qty === 0 || (line.counted_qty ?? 0) < line.system_qty * 0.5) {
            rollUpdates.push({
              id: line.base_fabric_roll_id,
              status: "LOST",
              current_location: "UNKNOWN",
              notes: fullNotes,
            });
          }
          // If counted is more than system, it's an extra roll (shouldn't happen often)
          // Could update length if it's a measurement difference
          else if (variance > 0) {
            // For now, just update the length if there's a variance
            rollUpdates.push({
              id: line.base_fabric_roll_id,
              notes: fullNotes,
            });
          }
        });

      // Update rolls
      for (const update of rollUpdates) {
        const { id, ...updateData } = update;
        const { error: updateError } = await supabaseBrowserClient
          .from("base_fabric_rolls")
          .update(updateData)
          .eq("id", id);
        if (updateError) {
          console.error(`Failed to update roll ${id}:`, updateError);
        }
      }

      const { error: statusError } = await supabaseBrowserClient
        .from("base_fabric_stocktake_sessions")
        .update({ status: "posted" })
        .eq("id", session.id);
      if (statusError) throw statusError;

      setSession({ ...session, status: "posted" });
      setSuccess("Adjustments posted and stocktake marked as posted.");
    } catch (err: any) {
      console.error("Failed to post adjustments", err);
      setError(err.message || "Failed to post adjustments.");
    } finally {
      setIsPosting(false);
    }
  }

  async function generatePdf() {
    if (!session) return;
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 15;
      const marginRight = 15;
      const marginTop = 15;
      const marginBottom = 25;

      const templateName = "Base Fabric Stocktake Report";

      // Try to load company logo
      let logoLoaded = false;
      const logoMaxWidth = 40;
      let headerTopOffset = marginTop;

      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.src = "/Logo.png";

        await Promise.race([
          new Promise<void>((resolve) => {
            logoImg.onload = () => {
              try {
                const ratio = logoImg.height / logoImg.width || 1;
                const logoWidth = logoMaxWidth;
                const logoHeight = logoWidth * ratio;
                const x = (pageWidth - logoWidth) / 2;
                const y = marginTop;
                doc.addImage(logoImg, "PNG", x, y, logoWidth, logoHeight);
                logoLoaded = true;
                headerTopOffset = y + logoHeight + 4;
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

      // Header with details (only drawn on first page). Returns bottom Y position.
      const addHeader = () => {
        let y = headerTopOffset;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        if (!logoLoaded) {
          doc.text("UNICA TEXTILES", pageWidth / 2, y, { align: "center" });
          y += 6;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text(templateName, pageWidth / 2, y, {
          align: "center",
        });
        y += 8;

        // 2x2 details layout to save vertical space
        doc.setFontSize(9);
        const generatedAt = new Date().toLocaleString("en-ZA", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const stocktakeDate = new Date(
          session.stocktake_date,
        ).toLocaleDateString("en-ZA", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

        const colWidth = (pageWidth - marginLeft - marginRight) / 2;
        const leftX = marginLeft;
        const rightX = marginLeft + colWidth;
        const rowY1 = y;
        const rowY2 = y + 6;

        // Row 1
        doc.text(`Stocktake Date: ${stocktakeDate}`, leftX, rowY1);
        doc.text(`Generated: ${generatedAt}`, rightX, rowY1, {
          maxWidth: colWidth - 4,
        });

        // Row 2
        doc.text(`Performed By: ${session.performed_by}`, leftX, rowY2);
        if (session.notes) {
          doc.text(`Notes: ${session.notes}`, rightX, rowY2, {
            maxWidth: colWidth - 4,
          });
        }

        // Return bottom Y of the header/details block
        return rowY2 + (session.notes ? 8 : 6);
      };

      const addFooter = (pageNumber: number) => {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Page ${pageNumber}`, marginLeft, pageHeight - 7);
        doc.text(templateName, pageWidth - marginRight, pageHeight - 7, {
          align: "right",
        });
      };

      const addSignatures = () => {
        // Signature area on last page only
        doc.setTextColor(0, 0, 0);
        const sigTop = pageHeight - 35;
        const colWidth = (pageWidth - marginLeft - marginRight) / 4;

        const roles = [
          "Stock Manager",
          "Department Manager",
          "Accounts Manager",
          "Director",
        ];

        roles.forEach((role, index) => {
          const x = marginLeft + index * colWidth;
          const lineY = sigTop + 10;
          doc.setLineWidth(0.2);
          doc.line(x, lineY, x + colWidth - 5, lineY);
          doc.setFontSize(8);
          doc.text(role, x, lineY + 4);
        });
      };

      const headerBottomY = addHeader();

      const body = lines.map((line) => {
        const roll = line.base_fabric_rolls;
        const order = roll?.base_fabric_orders;
        const fabric = order?.base_fabric_items?.name || "-";
        return [
          roll?.roll_no || roll?.qr_code || "N/A",
          fabric,
          order?.order_no || "-",
          order?.loom_no?.toString() || "-",
          (line.system_qty ?? 0).toFixed(3),
          (line.counted_qty ?? 0).toFixed(3),
          (line.variance_qty ?? 0).toFixed(3),
          line.reason || "-",
        ];
      });

      autoTable(doc, {
        head: [
          [
            "Roll No",
            "Fabric",
            "Order No",
            "Loom",
            "System Length (m)",
            "Counted Length (m)",
            "Variance (m)",
            "Reason",
          ],
        ],
        body,
        startY: headerBottomY + 4,
        margin: {
          left: marginLeft,
          right: marginRight,
          top: marginTop,
          bottom: marginBottom,
        },
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: {
          fillColor: [16, 185, 129],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        columnStyles: {
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
        },
        didDrawPage: (data: any) => {
          addFooter(data.pageNumber);
        },
      });

      // Add signatures only on the last page
      const lastPageNumber = (doc as any).internal.getNumberOfPages?.() ?? 1;
      (doc as any).setPage(lastPageNumber);
      addSignatures();

      doc.save(
        `base-fabric-stocktake-${session.stocktake_date}-${new Date()
          .toISOString()
          .split("T")[0]}.pdf`,
      );
    } catch (err: any) {
      console.error("Failed to generate PDF", err);
      setError(err.message || "Failed to generate PDF report.");
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  if (!sessionId) {
    return (
      <div className="p-4 text-sm text-red-600">
        Missing stocktake session id.
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">
            Base Fabric Stocktake
          </h1>
          {session && (
            <p className="mt-1 text-slate-600">
              {session.name} —{" "}
              {new Date(session.stocktake_date).toLocaleDateString("en-ZA", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}{" "}
              (Status:{" "}
              <span className="font-semibold text-slate-900">
                {session.status}
              </span>
              )
            </p>
          )}
        </div>
        <Link
          href="/toolbox/base-fabric/stocktake"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Base Fabric Stocktakes
        </Link>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 justify-between mb-4">
          <div className="text-sm text-slate-700">
            <p>
              Variances:{" "}
              <span className="font-semibold">
                {variances.totalCount} roll(s)
              </span>
            </p>
            <p className="text-slate-600 mt-0.5">
              To add a roll that exists physically but was never recorded (e.g.
              manufactured/outsourced or for balancing), use{" "}
              <strong>Add unrecorded roll</strong>. To remove a roll (e.g. lost
              or balancing), set its counted length to 0 and give a reason.
            </p>
            {variances.hasMissingReasons && (
              <p className="text-red-600">
                All variances must have a reason before posting.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddRollModal(true)}
              disabled={isLoading || session?.status === "posted"}
            >
              Add unrecorded roll
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={saveLines}
              disabled={isSaving || isLoading}
            >
              {isSaving ? "Saving..." : "Save Counts"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={generatePdf}
              disabled={isGeneratingPdf || isLoading}
            >
              {isGeneratingPdf ? "Generating PDF..." : "Print PDF Report"}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={postAdjustments}
              disabled={
                isPosting || isLoading || session?.status === "posted"
              }
            >
              {session && session.status === "posted"
                ? "Already Posted"
                : isPosting
                ? "Posting..."
                : "Post Adjustments"}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading stocktake...</p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-slate-600">
            No rolls found for this stocktake. Ensure there are rolls available
            at WEAVING location with AVAILABLE status.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">
                    Roll No
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">
                    QR Code
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">
                    Fabric
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">
                    Order No
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">
                    Loom
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-900">
                    System Length (m)
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-900">
                    Counted Length (m)
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-900">
                    Variance (m)
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">
                    Reason (required if variance)
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const variance = line.variance_qty ?? 0;
                  const hasVariance = variance !== 0;
                  const missingReason = hasVariance && !line.reason;
                  const roll = line.base_fabric_rolls;
                  const order = roll?.base_fabric_orders;
                  return (
                    <tr
                      key={line.id}
                      className={`border-b border-slate-100 ${
                        hasVariance ? "bg-amber-50" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {roll?.roll_no || "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {roll?.qr_code || "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {order?.base_fabric_items?.name || "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {order?.order_no || "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {order?.loom_no ? `Loom ${order.loom_no}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {(line.system_qty ?? 0).toFixed(3)} m
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={
                            line.counted_qty !== null &&
                            line.counted_qty !== undefined
                              ? line.counted_qty
                              : ""
                          }
                          onChange={(e) =>
                            updateLineLocal(line.id, {
                              counted_qty:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
                          placeholder="0.000"
                          disabled={session?.status === "posted"}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">
                        {variance.toFixed(3)} m
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <select
                            value={
                              VARIANCE_REASONS.some(
                                (r) => r.value === (line.reason || "")
                              )
                                ? line.reason || ""
                                : line.reason
                                  ? "Other"
                                  : ""
                            }
                            onChange={(e) =>
                              updateLineLocal(line.id, {
                                reason: e.target.value || null,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                            disabled={session?.status === "posted"}
                          >
                            {VARIANCE_REASONS.map((r) => (
                              <option key={r.value || "empty"} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={line.reason || ""}
                            onChange={(e) =>
                              updateLineLocal(line.id, {
                                reason: e.target.value || null,
                              })
                            }
                            className={`w-full rounded-lg border px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent ${
                              missingReason ? "border-red-400" : "border-slate-200"
                            }`}
                            placeholder={
                              hasVariance ? "Or type reason" : "Optional"
                            }
                            disabled={session?.status === "posted"}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal: Add unrecorded roll */}
        {showAddRollModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            onClick={() => !isAddingRoll && setShowAddRollModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-semibold text-slate-900">
                Add unrecorded roll
              </h3>
              <p className="mb-4 text-sm text-slate-600">
                Use this when a roll is physically present but was never recorded
                (e.g. manufactured or outsourced without being logged, or for
                stock balancing).
              </p>
              <form onSubmit={addUnrecordedRoll} className="grid gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Fabric <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={addRollForm.base_fabric_item_id}
                    onChange={(e) =>
                      setAddRollForm((prev) => ({
                        ...prev,
                        base_fabric_item_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    required
                  >
                    <option value="">Select fabric</option>
                    {fabricItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Roll no (optional)
                  </label>
                  <input
                    type="text"
                    value={addRollForm.roll_no}
                    onChange={(e) =>
                      setAddRollForm((prev) => ({ ...prev, roll_no: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    placeholder="e.g. R-001"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Loom number (optional)
                  </label>
                  <input
                    type="text"
                    value={addRollForm.loom_no}
                    onChange={(e) =>
                      setAddRollForm((prev) => ({ ...prev, loom_no: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    placeholder="e.g. 5"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Length (m) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={addRollForm.length_m}
                    onChange={(e) =>
                      setAddRollForm((prev) => ({ ...prev, length_m: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    placeholder="0.000"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Reason <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={addRollForm.reason}
                    onChange={(e) =>
                      setAddRollForm((prev) => ({ ...prev, reason: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    required
                  >
                    <option value="">Select reason</option>
                    {UNRECORDED_ROLL_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {addRollForm.reason === "Other" && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Reason (free text) <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={addRollForm.note}
                      onChange={(e) =>
                        setAddRollForm((prev) => ({ ...prev, note: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                      placeholder="Describe reason"
                    />
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddRollModal(false)}
                    disabled={isAddingRoll}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isAddingRoll}
                    className="flex-1"
                  >
                    {isAddingRoll ? "Adding..." : "Add roll"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </motion.section>
    </div>
  );
}
