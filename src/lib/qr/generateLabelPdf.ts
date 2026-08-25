"use client";

import { createRoot } from "react-dom/client";
import { QRCodeCanvas } from "qrcode.react";
import { createElement } from "react";
import jsPDF from "jspdf";

export const LABEL_SIZE_MM = 100;

export interface LabelPdfRow {
  qr_code: string;
  roll_no: string | null;
  type: "base_fabric" | "finished_fabric";
  length_m?: number;
  order_no?: string | null;
  fabric_name?: string | null;
  gsm?: number | null;
  loom_no?: number | string | null;
  grade?: string | null;
  color?: string | null;
  coating_type?: string | null;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return Promise.race([
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }),
    new Promise<HTMLImageElement | null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
}

function qrCodePngDataUrl(value: string, sizePx = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      createElement(QRCodeCanvas, {
        value,
        size: sizePx,
        level: "M",
        includeMargin: false,
        fgColor: "#0F172A",
        bgColor: "#FFFFFF",
      })
    );

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const canvas = host.querySelector("canvas");
        if (!canvas) {
          root.unmount();
          host.remove();
          reject(new Error("Could not render QR code."));
          return;
        }
        const dataUrl = canvas.toDataURL("image/png");
        root.unmount();
        host.remove();
        resolve(dataUrl);
      });
    });
  });
}

function drawLabel(
  doc: jsPDF,
  data: LabelPdfRow,
  logo: HTMLImageElement | null,
  qrDataUrl: string
) {
  const size = LABEL_SIZE_MM;
  const pad = 6;
  const content = size - pad * 2;

  let y = pad;

  if (logo && logo.width > 0) {
    const maxW = 42;
    const maxH = 16;
    const ratio = logo.height / logo.width || 1;
    let w = maxW;
    let h = w * ratio;
    if (h > maxH) {
      h = maxH;
      w = h / ratio;
    }
    doc.addImage(logo, "PNG", (size - w) / 2, y, w, h);
    y += h + 3;
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("UNICA TEXTILES", size / 2, y + 5, { align: "center" });
    y += 10;
  }

  const qrMm = 48;
  const qrX = (size - qrMm) / 2;
  doc.addImage(qrDataUrl, "PNG", qrX, y, qrMm, qrMm);
  y += qrMm + 3.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  const title = data.roll_no || data.qr_code;
  doc.text(title, size / 2, y, { align: "center", maxWidth: content });
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  const lines: string[] = [];
  if (data.type === "base_fabric") {
    if (data.loom_no != null && data.loom_no !== "") lines.push(`Loom ${String(data.loom_no)}`);
    if (data.fabric_name) lines.push(data.fabric_name);
    if (data.order_no) lines.push(`Order ${data.order_no}`);
  } else {
    if (data.coating_type) lines.push(data.coating_type);
    if (data.color) lines.push(data.color);
    if (data.grade) lines.push(`Grade ${data.grade}`);
  }
  const meta: string[] = [];
  if (data.length_m != null) meta.push(`${Number(data.length_m).toFixed(2)} m`);
  if (data.gsm != null) meta.push(`${Number(data.gsm).toFixed(0)} GSM`);
  if (meta.length) lines.push(meta.join("   "));

  lines.forEach((line) => {
    if (y > size - pad) return;
    doc.text(line, size / 2, y, { align: "center", maxWidth: content });
    y += 4.2;
  });
}

export async function generateLabelPdf(
  rows: LabelPdfRow[],
  kind: "base_fabric" | "finished_fabric"
): Promise<void> {
  if (rows.length === 0) return;

  const logo = await loadImage("/Logo.png");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [LABEL_SIZE_MM, LABEL_SIZE_MM],
  });

  for (let i = 0; i < rows.length; i++) {
    if (i > 0) doc.addPage([LABEL_SIZE_MM, LABEL_SIZE_MM], "portrait");
    const qrDataUrl = await qrCodePngDataUrl(rows[i].qr_code);
    drawLabel(doc, rows[i], logo, qrDataUrl);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const prefix = kind === "base_fabric" ? "base-fabric" : "finished-fabric";
  doc.save(`${prefix}-labels-${stamp}.pdf`);
}
