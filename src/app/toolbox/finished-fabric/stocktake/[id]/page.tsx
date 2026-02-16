"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { generateQRCode } from "@/lib/qr/generateQRCode";

const LOCATION_STORE = "FINISHED_STORE";
const LOCATION_COATING = "COATING";
const STATUS_IN_STORE = "IN_STORE";
const STATUS_AWAITING_RECEIPT = "AWAITING_RECEIPT";

/** Reasons when adding an unrecorded finished roll. Mirrors base fabric stocktake. */
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
  finished_fabric_roll_id: string;
  system_qty: number;
  counted_qty: number | null;
  variance_qty: number | null;
  reason: string | null;
  note: string | null;
  finished_fabric_rolls?: {
    roll_no: string | null;
    qr_code?: string | null;
    length_m: number;
    grade: string | null;
    color: string | null;
    gsm: number | null;
    coating_type: string | null;
    batch_id?: string | null;
    coating_batches?: {
      batch_no: string | null;
    } | null;
  } | null;
}

interface FabricTypeOption {
  id: string;
  code: string;
  name: string;
}

interface ColorOption {
  id: string;
  fabric_type_id: string;
  color_name: string;
}

interface GsmOption {
  id: string;
  fabric_type_id: string;
  gsm: number;
}

interface WidthOption {
  id: string;
  fabric_type_id: string;
  width_mm: number;
}

export default function FinishedFabricStocktakeDetailPage() {
  const params = useParams();
  const sessionId = params?.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [fabricTypes, setFabricTypes] = useState<FabricTypeOption[]>([]);
  const [colorOptions, setColorOptions] = useState<Record<string, ColorOption[]>>({});
  const [gsmOptions, setGsmOptions] = useState<Record<string, GsmOption[]>>({});
  const [widthOptions, setWidthOptions] = useState<Record<string, WidthOption[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Unrecorded roll modal state
  const [showAddRollModal, setShowAddRollModal] = useState(false);
  const [isAddingRoll, setIsAddingRoll] = useState(false);
  const [addRollForm, setAddRollForm] = useState({
    fabric_type_id: "",
    color_option_id: "",
    gsm_option_id: "",
    width_option_id: "",
    length_m: "",
    grade: "",
    reason: "",
    note: "",
  });

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
        { data: typesData, error: typesError },
        { data: colorData, error: colorError },
        { data: gsmData, error: gsmError },
        { data: widthData, error: widthError },
      ] = await Promise.all([
        supabaseBrowserClient
          .from("finished_fabric_stocktake_sessions")
          .select("id, name, stocktake_date, performed_by, status, created_at, notes")
          .eq("id", sessionId)
          .single(),
        supabaseBrowserClient
          .from("finished_fabric_stocktake_lines")
          .select(
            `
            id,
            finished_fabric_roll_id,
            system_qty,
            counted_qty,
            variance_qty,
            reason,
            note,
            finished_fabric_rolls:finished_fabric_roll_id (
              roll_no,
              qr_code,
              length_m,
              grade,
              color,
              gsm,
              coating_type,
              batch_id,
              coating_batches (
                batch_no
              )
            )
          `,
          )
          .eq("session_id", sessionId)
          .order("id"),
        supabaseBrowserClient
          .from("fabric_types")
          .select("id, code, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabaseBrowserClient
          .from("fabric_type_color_options")
          .select("id, fabric_type_id, color_name")
          .eq("is_active", true)
          .order("color_name", { ascending: true }),
        supabaseBrowserClient
          .from("fabric_type_gsm_options")
          .select("id, fabric_type_id, gsm")
          .eq("is_active", true)
          .order("gsm", { ascending: true }),
        supabaseBrowserClient
          .from("fabric_type_width_options")
          .select("id, fabric_type_id, width_mm")
          .eq("is_active", true)
          .order("width_mm", { ascending: true }),
      ]);

      if (sessionError) throw sessionError;
      if (linesError) throw linesError;
      if (typesError) throw typesError;
      if (colorError) throw colorError;
      if (gsmError) throw gsmError;
      if (widthError) throw widthError;

      setSession(sessionData as Session);
      setFabricTypes((typesData as FabricTypeOption[]) || []);

      const colorMap: Record<string, ColorOption[]> = {};
      (colorData as any[] | null | undefined)?.forEach((opt: any) => {
        if (!colorMap[opt.fabric_type_id]) colorMap[opt.fabric_type_id] = [];
        colorMap[opt.fabric_type_id].push({
          id: opt.id,
          fabric_type_id: opt.fabric_type_id,
          color_name: opt.color_name,
        });
      });
      setColorOptions(colorMap);

      const gsmMap: Record<string, GsmOption[]> = {};
      (gsmData as any[] | null | undefined)?.forEach((opt: any) => {
        if (!gsmMap[opt.fabric_type_id]) gsmMap[opt.fabric_type_id] = [];
        gsmMap[opt.fabric_type_id].push({
          id: opt.id,
          fabric_type_id: opt.fabric_type_id,
          gsm: Number(opt.gsm),
        });
      });
      setGsmOptions(gsmMap);

      const widthMap: Record<string, WidthOption[]> = {};
      (widthData as any[] | null | undefined)?.forEach((opt: any) => {
        if (!widthMap[opt.fabric_type_id]) widthMap[opt.fabric_type_id] = [];
        widthMap[opt.fabric_type_id].push({
          id: opt.id,
          fabric_type_id: opt.fabric_type_id,
          width_mm: Number(opt.width_mm),
        });
      });
      setWidthOptions(widthMap);

      const processed = (linesData as any[])?.map((row) => ({
        ...row,
        finished_fabric_rolls: Array.isArray(row.finished_fabric_rolls)
          ? row.finished_fabric_rolls[0]
          : row.finished_fabric_rolls,
      })) as Line[];
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
        .from("finished_fabric_rolls")
        .select(
          `
          id,
          roll_no,
          qr_code,
          length_m,
          grade,
          color,
          gsm,
          coating_type,
          batch_id,
          status,
          current_location,
          coating_batches (
            batch_no
          )
        `,
        )
        .or(
          `and(status.eq.${STATUS_IN_STORE},current_location.eq.${LOCATION_STORE}),` +
            `and(status.eq.${STATUS_AWAITING_RECEIPT},current_location.eq.${LOCATION_COATING})`,
        );

      if (stockError) throw stockError;

      const rows =
        (stockData as any[])?.map((row) => ({
          ...row,
          coating_batches: Array.isArray(row.coating_batches)
            ? row.coating_batches[0]
            : row.coating_batches,
        })) || [];

      if (rows.length === 0) {
        return;
      }

      const payload = rows.map((row) => ({
        session_id: currentSession?.id || sessionId,
        finished_fabric_roll_id: row.id,
        system_qty: Number(row.length_m || 0),
        counted_qty: Number(row.length_m || 0),
        variance_qty: 0,
      }));

      const { error: upsertError } = await supabaseBrowserClient
        .from("finished_fabric_stocktake_lines")
        .upsert(payload, { onConflict: "session_id,finished_fabric_roll_id" });
      if (upsertError) throw upsertError;

      const { data: linesData, error: linesError } = await supabaseBrowserClient
        .from("finished_fabric_stocktake_lines")
        .select(
          `
          id,
          finished_fabric_roll_id,
          system_qty,
          counted_qty,
          variance_qty,
          reason,
          note,
          finished_fabric_rolls:finished_fabric_roll_id (
            roll_no,
            qr_code,
            length_m,
            grade,
            color,
            gsm,
            coating_type,
            batch_id,
            coating_batches (
              batch_no
            )
          )
        `,
        )
        .eq("session_id", currentSession?.id || sessionId)
        .order("id");

      if (linesError) throw linesError;

      const processed = (linesData as any[])?.map((row) => ({
        ...row,
        finished_fabric_rolls: Array.isArray(row.finished_fabric_rolls)
          ? row.finished_fabric_rolls[0]
          : row.finished_fabric_rolls,
      })) as Line[];
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

  async function addUnrecordedRoll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!session) {
      setError("Missing stocktake session.");
      return;
    }
    if (session.status === "posted") {
      setError("Cannot add rolls to a posted stocktake.");
      return;
    }

    const lengthM = parseFloat(addRollForm.length_m);
    if (!Number.isFinite(lengthM) || lengthM <= 0) {
      setError("Enter a valid roll length (m) greater than zero.");
      return;
    }

    if (!addRollForm.fabric_type_id.trim()) {
      setError("Fabric type is required.");
      return;
    }
    const selectedType =
      fabricTypes.find((t) => t.id === addRollForm.fabric_type_id) || null;
    if (!selectedType) {
      setError("Please select a valid fabric type.");
      return;
    }

    if (!addRollForm.color_option_id.trim()) {
      setError("Colour is required.");
      return;
    }
    const selectedColor =
      (colorOptions[addRollForm.fabric_type_id] || []).find(
        (c) => c.id === addRollForm.color_option_id,
      ) || null;
    if (!selectedColor) {
      setError("Please select a valid colour for this fabric type.");
      return;
    }

    if (!addRollForm.gsm_option_id.trim()) {
      setError("GSM is required.");
      return;
    }
    const selectedGsm =
      (gsmOptions[addRollForm.fabric_type_id] || []).find(
        (g) => g.id === addRollForm.gsm_option_id,
      ) || null;
    if (!selectedGsm || !Number.isFinite(selectedGsm.gsm) || selectedGsm.gsm <= 0) {
      setError("Please select a valid GSM for this fabric type.");
      return;
    }

    if (!addRollForm.width_option_id.trim()) {
      setError("Width is required.");
      return;
    }
    const selectedWidth =
      (widthOptions[addRollForm.fabric_type_id] || []).find(
        (w) => w.id === addRollForm.width_option_id,
      ) || null;
    if (!selectedWidth || !Number.isFinite(selectedWidth.width_mm) || selectedWidth.width_mm <= 0) {
      setError("Please select a valid width for this fabric type.");
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
      const descriptionParts = [
        `Stocktake – unrecorded roll.`,
        `Session: ${session.name} (${session.stocktake_date})`,
        `Reason: ${reasonText}`,
      ];
      descriptionParts.push(`Width: ${selectedWidth.width_mm}mm`);
      const rollNotes = descriptionParts.join(" ");

      const qrCode = generateQRCode("finished_fabric");
      const nowIso = new Date().toISOString();

      const { data: rollData, error: rollError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .insert({
          batch_id: null,
          roll_no: null,
          length_m: lengthM,
          grade: addRollForm.grade.trim() || null,
          gsm: selectedGsm.gsm,
          color: selectedColor.color_name,
          // Store catalog ID for consistent matching elsewhere (e.g. store issuing)
          fabric_type_id: selectedType.id,
          gsm_option_id: selectedGsm.id,
          color_option_id: selectedColor.id,
          width_option_id: selectedWidth.id,
          // Backward compatibility: still store text field
          coating_type: selectedType.code || selectedType.name,
          notes: rollNotes,
          qr_code: qrCode,
          // Do not yet treat as in-store stock until stocktake is posted
          current_location: LOCATION_STORE,
          status: "PENDING_STOCKTAKE",
        })
        .select("id")
        .single();

      if (rollError) throw rollError;

      const { error: lineError } = await supabaseBrowserClient
        .from("finished_fabric_stocktake_lines")
        .insert({
          session_id: session.id,
          finished_fabric_roll_id: rollData.id,
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
        fabric_type_id: "",
        color_option_id: "",
        gsm_option_id: "",
        width_option_id: "",
        length_m: "",
        grade: "",
        reason: "",
        note: "",
      });
      await loadData();
    } catch (err: any) {
      console.error("Failed to add unrecorded roll", err);
      const message =
        err?.message || (typeof err === "string" ? err : JSON.stringify(err)) || "Failed to add unrecorded roll.";
      setError(message);
    } finally {
      setIsAddingRoll(false);
    }
  }

  async function saveLines() {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updates = lines.map((line) => ({
        id: line.id,
        session_id: session?.id || sessionId,
        finished_fabric_roll_id: line.finished_fabric_roll_id,
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
        .from("finished_fabric_stocktake_lines")
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

  async function postAdjustments() {
    if (!session) {
      setError("Missing stocktake session.");
      return;
    }
    if (session.status === "posted") {
      setError("This stocktake has already been posted.");
      return;
    }

    if (variances.hasMissingReasons) {
      setError("All variances must have a reason before posting.");
      return;
    }

    const confirm = window.confirm(
      "Posting will lock this stocktake. Variances will be recorded in this report, and any unrecorded rolls added here will be brought into store stock. Continue?",
    );
    if (!confirm) return;

    setIsPosting(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { user },
      } = await supabaseBrowserClient.auth.getUser();

      // Promote any unrecorded rolls (system_qty = 0, counted > 0) into store stock
      const unrecordedLines = lines.filter(
        (line) => (line.system_qty ?? 0) === 0 && (line.counted_qty ?? 0) > 0,
      );

      const rollUpdates = unrecordedLines.map((line) => ({
        id: line.finished_fabric_roll_id,
        status: STATUS_IN_STORE,
        current_location: LOCATION_STORE,
        received_store_at: new Date().toISOString(),
        received_store_by: user?.id ?? null,
      }));

      for (const update of rollUpdates) {
        const { id, ...updateData } = update;
        const { error: rollError } = await supabaseBrowserClient
          .from("finished_fabric_rolls")
          .update(updateData)
          .eq("id", id);
        if (rollError) {
          console.error("Failed to update finished roll status during posting", {
            rollId: id,
            error: rollError,
          });
        }
      }

      const { error: statusError } = await supabaseBrowserClient
        .from("finished_fabric_stocktake_sessions")
        .update({ status: "posted" })
        .eq("id", session.id);
      if (statusError) throw statusError;

      setSession({ ...session, status: "posted" });
      setSuccess("Stocktake marked as posted.");
    } catch (err: any) {
      console.error("Failed to post stocktake", err);
      setError(err.message || "Failed to post stocktake.");
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

      const templateName = "Finished Fabric Stocktake Report";

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

        doc.text(`Stocktake Date: ${stocktakeDate}`, leftX, rowY1);
        doc.text(`Generated: ${generatedAt}`, rightX, rowY1, {
          maxWidth: colWidth - 4,
        });

        doc.text(`Performed By: ${session.performed_by}`, leftX, rowY2);
        if (session.notes) {
          doc.text(`Notes: ${session.notes}`, rightX, rowY2, {
            maxWidth: colWidth - 4,
          });
        }

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
        doc.setTextColor(0, 0, 0);
        const sigTop = pageHeight - 35;
        const colWidth = (pageWidth - marginLeft - marginRight) / 4;

        const roles = [
          "Storekeeper",
          "Production / Dept Manager",
          "Accounts",
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

      // Split lines into Ripstop and PVC groups based on coating_type
      const ripstopLines = lines.filter((l) =>
        (l.finished_fabric_rolls?.coating_type || "")
          .toLowerCase()
          .includes("ripstop"),
      );
      const pvcLines = lines.filter((l) =>
        (l.finished_fabric_rolls?.coating_type || "")
          .toLowerCase()
          .includes("pvc"),
      );

      const summaryFor = (group: Line[]) => {
        const rolls = group.length;
        const systemTotal = group.reduce(
          (sum, l) => sum + (l.system_qty ?? 0),
          0,
        );
        const countedTotal = group.reduce(
          (sum, l) => sum + (l.counted_qty ?? 0),
          0,
        );
        const varianceTotal = countedTotal - systemTotal;
        return { rolls, systemTotal, countedTotal, varianceTotal };
      };

      const ripstopSummary = summaryFor(ripstopLines);
      const pvcSummary = summaryFor(pvcLines);

      // Summary page
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      let y = headerBottomY + 8;

      const addSummaryBlock = (
        title: string,
        summary: { rolls: number; systemTotal: number; countedTotal: number; varianceTotal: number },
      ) => {
        doc.setFont("helvetica", "bold");
        doc.text(title, marginLeft, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.text(
          `Rolls: ${summary.rolls}    System: ${summary.systemTotal.toFixed(
            3,
          )} m    Counted: ${summary.countedTotal.toFixed(
            3,
          )} m    Variance: ${summary.varianceTotal.toFixed(3)} m`,
          marginLeft,
          y,
        );
        y += 8;
      };

      if (ripstopLines.length > 0) {
        addSummaryBlock("Ripstop", ripstopSummary);
      }
      if (pvcLines.length > 0) {
        addSummaryBlock("PVC", pvcSummary);
      }

      addFooter(1);

      // Helper to render a group table on its own pages
      const renderGroupTable = (title: string, groupLines: Line[]) => {
        if (groupLines.length === 0) return;

        doc.addPage();
        const currentPage = (doc as any).internal.getNumberOfPages?.() ?? 1;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(title, marginLeft, 18);

        const body = groupLines.map((line) => {
          const roll = line.finished_fabric_rolls;
          const batchNo =
            roll?.coating_batches?.batch_no ??
            (roll?.batch_id ? String(roll.batch_id) : "-");
          return [
            roll?.roll_no || roll?.qr_code || "N/A",
            batchNo,
            roll?.color || "-",
            roll?.gsm != null ? String(roll.gsm) : "-",
            roll?.coating_type || "-",
            roll?.grade || "-",
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
              "Batch",
              "Colour",
              "GSM",
              "Coating",
              "Grade",
              "System (m)",
              "Counted (m)",
              "Variance (m)",
              "Reason",
            ],
          ],
          body,
          startY: 24,
          margin: {
            left: marginLeft,
            right: marginRight,
          },
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: {
            fillColor: [16, 185, 129],
            textColor: [255, 255, 255],
            fontStyle: "bold",
          },
          columnStyles: {
            6: { halign: "right" },
            7: { halign: "right" },
            8: { halign: "right" },
          },
          didDrawPage: (data: any) => {
            addFooter(data.pageNumber);
          },
        });
      };

      renderGroupTable("Ripstop – Roll Breakdown", ripstopLines);
      renderGroupTable("PVC – Roll Breakdown", pvcLines);

      const lastPageNumber = (doc as any).internal.getNumberOfPages?.() ?? 1;
      (doc as any).setPage(lastPageNumber);
      addSignatures();

      doc.save(
        `finished-fabric-stocktake-${session.stocktake_date}-${new Date()
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
            Finished Fabric Stocktake
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
          href="/toolbox/finished-fabric/stocktake"
          className="text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
        >
          ← Back to Finished Fabric Stocktakes
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
              Set the counted length (m) for each roll and capture a reason for
              any variance. Rolls awaiting receipt are included so you can count
              what is physically on hand.
            </p>
            <p className="text-slate-600 mt-0.5">
              Use <strong>Add unrecorded roll</strong> to capture finished rolls
              that exist physically but are not yet on the system.
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
              disabled={isPosting || isLoading || session?.status === "posted"}
            >
              {isPosting ? "Posting..." : "Post Stocktake"}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-600">Loading stocktake...</p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-slate-600">
            No rolls found for this stocktake. Ensure there are rolls available
            in store or awaiting receipt.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">
                    Roll
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">
                    Batch
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">
                    Colour / GSM / Coating / Grade
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-900">
                    System (m)
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-900">
                    Counted (m)
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
                  const roll = line.finished_fabric_rolls;
                  const batchNo =
                    roll?.coating_batches?.batch_no ??
                    (roll?.batch_id ? String(roll.batch_id) : "-");

                  const detailParts = [
                    roll?.color || null,
                    roll?.gsm != null ? `${roll.gsm} GSM` : null,
                    roll?.coating_type || null,
                    roll?.grade || null,
                  ].filter(Boolean);

                  return (
                    <tr
                      key={line.id}
                      className={`border-b border-slate-100 ${
                        hasVariance ? "bg-amber-50" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {roll?.roll_no || roll?.qr_code || "N/A"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {batchNo}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {detailParts.length > 0 ? detailParts.join(" • ") : "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {(line.system_qty ?? 0).toFixed(3)}
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
                        {variance.toFixed(3)}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={line.reason || ""}
                          onChange={(e) =>
                            updateLineLocal(line.id, { reason: e.target.value })
                          }
                          className={`w-full rounded-lg border px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent ${
                            missingReason ? "border-red-400" : "border-slate-200"
                          }`}
                          placeholder={
                            hasVariance ? "Reason for variance" : "Optional"
                          }
                          disabled={session?.status === "posted"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal: Add unrecorded finished roll */}
        {showAddRollModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
            onClick={() => !isAddingRoll && setShowAddRollModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-3 text-lg font-semibold text-slate-900">
                Add unrecorded finished roll
              </h3>
              <p className="mb-4 text-sm text-slate-600">
                Use this when a finished roll is physically in store but was never
                recorded (e.g. manufactured/outsourced without being logged, or for
                stock balancing). The roll will be added directly to the Finished
                Store and included in this stocktake.
              </p>
              <form onSubmit={addUnrecordedRoll} className="grid gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Fabric type <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={addRollForm.fabric_type_id}
                    onChange={(e) =>
                      setAddRollForm((prev) => ({
                        ...prev,
                        fabric_type_id: e.target.value,
                        color_option_id: "",
                        gsm_option_id: "",
                        width_option_id: "",
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    required
                  >
                    <option value="">Select fabric type</option>
                    {fabricTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Colour <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={addRollForm.color_option_id}
                      onChange={(e) =>
                        setAddRollForm((prev) => ({
                          ...prev,
                          color_option_id: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 disabled:bg-slate-50"
                      disabled={!addRollForm.fabric_type_id}
                      required
                    >
                      <option value="">Select colour</option>
                      {(colorOptions[addRollForm.fabric_type_id] || []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.color_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      GSM <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={addRollForm.gsm_option_id}
                      onChange={(e) =>
                        setAddRollForm((prev) => ({
                          ...prev,
                          gsm_option_id: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 disabled:bg-slate-50"
                      disabled={!addRollForm.fabric_type_id}
                      required
                    >
                      <option value="">Select GSM</option>
                      {(gsmOptions[addRollForm.fabric_type_id] || []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.gsm}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Width <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={addRollForm.width_option_id}
                    onChange={(e) =>
                      setAddRollForm((prev) => ({
                        ...prev,
                        width_option_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 disabled:bg-slate-50"
                    disabled={!addRollForm.fabric_type_id}
                    required
                  >
                    <option value="">Select width</option>
                    {(widthOptions[addRollForm.fabric_type_id] || []).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.width_mm} mm
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Roll length (m) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={addRollForm.length_m}
                    onChange={(e) =>
                      setAddRollForm((prev) => ({
                        ...prev,
                        length_m: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    placeholder="e.g. 50.000"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Grade
                  </label>
                  <select
                    value={addRollForm.grade}
                    onChange={(e) =>
                      setAddRollForm((prev) => ({
                        ...prev,
                        grade: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="">Select grade (optional)</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="SCRAP">Scrap</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Reason <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={addRollForm.reason}
                    onChange={(e) =>
                      setAddRollForm((prev) => ({
                        ...prev,
                        reason: e.target.value,
                      }))
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
                        setAddRollForm((prev) => ({
                          ...prev,
                          note: e.target.value,
                        }))
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
