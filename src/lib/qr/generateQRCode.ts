/**
 * Generates a unique QR code for a roll
 * Format: TYPE-{timestamp}-{random}
 * Examples: BFR-20240101-ABC123, FFR-20240101-XYZ789
 */
export function generateQRCode(type: "base_fabric" | "finished_fabric"): string {
  const prefix = type === "base_fabric" ? "BFR" : "FFR";
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generates a QR code based on roll ID (for existing rolls without QR codes)
 */
export function generateQRCodeFromId(
  type: "base_fabric" | "finished_fabric",
  rollId: string
): string {
  const prefix = type === "base_fabric" ? "BFR" : "FFR";
  const shortId = rollId.slice(0, 8).toUpperCase();
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${timestamp}-${shortId}`;
}

