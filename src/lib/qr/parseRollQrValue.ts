
const TRACEABILITY_HOST = "unicatextilemills.netlify.app";

export function parseRollQrValue(value: string): string {
  const scannedValue = value.trim();

  // Existing QR codes contain only the roll identifier.
  if (!/^https?:\/\//i.test(scannedValue)) {
    return scannedValue;
  }

  // New QR codes contain a customer traceability URL.
  try {
    const url = new URL(scannedValue);

    if (
      url.protocol !== "https:" ||
      url.hostname !== TRACEABILITY_HOST ||
      url.port ||
      url.search ||
      url.hash
    ) {
      throw new Error("Invalid QR code URL");
    }

    const match = url.pathname.match(
      /^\/traceability\/(FFR-[A-Za-z0-9_-]+)\/?$/
    );

    if (!match) {
      throw new Error("Invalid traceability URL");
    }

    return match[1];
  } catch {
    throw new Error("Unrecognised QR code format.");
  }
}
