"use client";

import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";
import { motion } from "framer-motion";
import Link from "next/link";

type ActionType =
  | "receive_base_at_coating"
  | "issue_base_to_coating"
  | "receive_finished_at_store"
  | "issue_finished_to_customer"
  | "view_roll_details";

interface ScannedRoll {
  qr_code: string;
  roll_id: string;
  roll_no: string | null;
  type: "base_fabric" | "finished_fabric";
  current_status: string;
  current_location: string;
  length_m?: number;
  order_no?: string | null;
  fabric_name?: string | null;
}

interface SlipPopupData {
  slipId: string;
  slipNo: string | null;
  issueDate: string;
  fromLocation: string;
  toLocation: string;
  rollCount: number;
}

export default function QRPage() {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedRolls, setScannedRolls] = useState<ScannedRoll[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [slipPopup, setSlipPopup] = useState<SlipPopupData | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanAreaRef = useRef<HTMLDivElement>(null);
  const lastScannedRef = useRef<Map<string, number>>(new Map()); // Track last scan time for each QR code
  const SCAN_DEBOUNCE_MS = 2000; // 2 seconds between scans of the same QR code

  useEffect(() => {
    // Cleanup scanner on unmount
    return () => {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => {
            scannerRef.current = null;
          })
          .catch(() => {
            scannerRef.current = null;
          });
      }
    };
  }, []);

  async function startScanning() {
    if (!selectedAction) {
      setError("Please select an action first.");
      return;
    }

    // Check if we're in a secure context (HTTPS or localhost)
    // For development: allow localhost, 127.0.0.1, and local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    const isLocalNetwork = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(location.hostname);
    const isSecureContext = window.isSecureContext || location.protocol === "https:" || isLocalhost;
    
    // For production, require HTTPS. For local network development, warn but allow
    if (!isSecureContext && !isLocalNetwork) {
      setError("Camera access requires HTTPS. Please access this page over HTTPS or use localhost.");
      return;
    }
    
    // Warn about local network access (iOS Safari may still block)
    if (isLocalNetwork && location.protocol !== "https:") {
      console.warn("Using HTTP on local network. iOS Safari may require HTTPS for camera access.");
    }

    try {
      setError(null);
      setIsScanning(true);

      // Ensure the element exists
      const qrReaderElement = document.getElementById("qr-reader");
      if (!qrReaderElement) {
        throw new Error("QR scanner element not found. Please refresh the page.");
      }

      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      // Detect if we're on iOS/mobile
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

      // Responsive QR box size for mobile
      const qrboxSize = isMobile ? Math.min(250, window.innerWidth * 0.8) : 250;

      // Simplified config - html5-qrcode doesn't support videoConstraints
      const config = {
        fps: 10,
        qrbox: { width: qrboxSize, height: qrboxSize },
        aspectRatio: 1.0,
        disableFlip: false,
      };

      // Try facingMode first (simplest approach)
      let cameraConfig: string | { facingMode: string } = { facingMode: "environment" };
      let startSuccess = false;

      try {
        // First try with facingMode
        await scanner.start(
          cameraConfig,
          config,
          (decodedText) => {
            handleScannedCode(decodedText);
          },
          (errorMessage) => {
            // Ignore scanning errors (they're frequent during scanning)
            if (errorMessage.includes("NotAllowedError") || errorMessage.includes("Permission")) {
              setError("Camera permission denied. Please allow camera access in your browser settings.");
              setIsScanning(false);
              if (scannerRef.current) {
                scannerRef.current.stop().catch(() => {});
                scannerRef.current = null;
              }
            }
          }
        );
        startSuccess = true;
      } catch (facingModeError: any) {
        console.log("facingMode failed, trying camera enumeration:", facingModeError);
        
        // If facingMode fails, try enumerating cameras (especially for iOS)
        try {
          const devices = await Html5Qrcode.getCameras();
          console.log("Available cameras:", devices);
          
          if (devices.length > 0) {
            if (isIOS) {
              // iOS: Usually the last camera is the back camera
              const backCamera = devices.find(
                (device) => 
                  device.label.toLowerCase().includes("back") || 
                  device.label.toLowerCase().includes("rear") ||
                  device.label.toLowerCase().includes("environment")
              );
              
              if (backCamera) {
                cameraConfig = backCamera.id;
                console.log("Using back camera:", backCamera.label);
              } else {
                // Use the last camera (usually back on iOS)
                cameraConfig = devices[devices.length - 1].id;
                console.log("Using camera:", devices[devices.length - 1].label);
              }
            } else {
              // For Android/other browsers, prefer back camera
              const backCamera = devices.find(
                (device) => 
                  device.label.toLowerCase().includes("back") || 
                  device.label.toLowerCase().includes("rear") ||
                  device.label.toLowerCase().includes("environment")
              );
              
              if (backCamera) {
                cameraConfig = backCamera.id;
              } else {
                cameraConfig = devices[0].id; // Use first available
              }
            }

            // Try again with device ID
            await scanner.start(
              cameraConfig,
              config,
              (decodedText) => {
                handleScannedCode(decodedText);
              },
              (errorMessage) => {
                if (errorMessage.includes("NotAllowedError") || errorMessage.includes("Permission")) {
                  setError("Camera permission denied. Please allow camera access in your browser settings.");
                  setIsScanning(false);
                  if (scannerRef.current) {
                    scannerRef.current.stop().catch(() => {});
                    scannerRef.current = null;
                  }
                }
              }
            );
            startSuccess = true;
          } else {
            throw new Error("No cameras found");
          }
        } catch (enumError: any) {
          console.error("Camera enumeration also failed:", enumError);
          throw facingModeError; // Throw the original error
        }
      }

      if (!startSuccess) {
        throw new Error("Failed to start camera");
      }
    } catch (err: any) {
      console.error("Camera start error:", err);
      let errorMessage = err.message || "Failed to start camera.";
      
      // Provide more helpful error messages
      if (err.name === "NotAllowedError" || err.message?.includes("permission") || err.message?.includes("Permission")) {
        errorMessage = "Camera permission denied. Please:\n1. Go to Safari Settings > Privacy & Security > Camera\n2. Allow access for this website\n3. Refresh the page and try again";
      } else if (err.name === "NotFoundError" || err.message?.includes("camera") || err.message?.includes("No camera")) {
        errorMessage = "No camera found. Please ensure your device has a camera and try again.";
      } else if (err.message?.includes("NotReadableError")) {
        errorMessage = "Camera is already in use by another application. Please close other apps using the camera.";
      } else if (err.message?.includes("streaming not supported")) {
        errorMessage = "Camera streaming not supported. Please:\n1. Ensure you're using HTTPS (not HTTP)\n2. Try opening in standard Safari (not PWA/home screen mode)\n3. Check that camera permissions are granted";
      }
      
      setError(errorMessage);
      setIsScanning(false);
      scannerRef.current = null;
    }
  }

  async function stopScanning() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        // Ignore stop errors
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
    // Clear scan history when stopping
    lastScannedRef.current.clear();
  }

  // Validate if roll type matches selected action
  function validateRollType(rollType: "base_fabric" | "finished_fabric", qrCode: string): boolean {
    if (!selectedAction) {
      return true; // No action selected, allow any type
    }

    if (selectedAction === "view_roll_details") {
      return true; // View mode allows both types
    }

    // Check if roll type matches the action requirements
    if (selectedAction === "receive_base_at_coating" || selectedAction === "issue_base_to_coating") {
      if (rollType !== "base_fabric") {
        setError(
          `❌ Incorrect QR Code Type!\n\n` +
          `Scanned: ${rollType === "finished_fabric" ? "Finished Fabric" : "Unknown"} roll\n` +
          `Expected: Base Fabric roll\n\n` +
          `You selected "${selectedAction === "receive_base_at_coating" ? "Receive Base Fabric at Coating" : "Issue Base Fabric to Coating"}". Please scan a base fabric roll QR code.`
        );
        return false;
      }
    } else if (selectedAction === "receive_finished_at_store" || selectedAction === "issue_finished_to_customer") {
      if (rollType !== "finished_fabric") {
        setError(
          `❌ Incorrect QR Code Type!\n\n` +
          `Scanned: ${rollType === "base_fabric" ? "Base Fabric" : "Unknown"} roll\n` +
          `Expected: Finished Fabric roll\n\n` +
          `You selected "${selectedAction === "receive_finished_at_store" ? "Receive Finished Fabric at Store" : "Issue Finished Fabric to Customer"}". Please scan a finished fabric roll QR code.`
        );
        return false;
      }
    }

    return true;
  }

  async function handleScannedCode(qrCode: string) {
    const now = Date.now();
    const lastScanTime = lastScannedRef.current.get(qrCode);
    
    // Prevent rapid duplicate scans (debounce)
    if (lastScanTime && now - lastScanTime < SCAN_DEBOUNCE_MS) {
      return; // Ignore if scanned within the debounce window
    }
    
    // Update last scan time
    lastScannedRef.current.set(qrCode, now);
    
    // Prevent duplicate scans in the scanned rolls list
    if (scannedRolls.some((r) => r.qr_code === qrCode || r.roll_no === qrCode)) {
      setError(`Roll ${qrCode} has already been scanned.`);
      return;
    }

    // Clear previous errors when starting a new scan (but keep validation errors)
    // Only clear if it's not a validation error
    setError((prev) => {
      if (prev && prev.includes("Incorrect QR Code Type")) {
        return prev; // Keep validation errors
      }
      return null; // Clear other errors
    });

    try {
      // Try to find base fabric roll first - check qr_code, then roll_no as fallback
      let { data: baseRoll, error: baseError } = await supabaseBrowserClient
        .from("base_fabric_rolls")
        .select(
          `
          id,
          qr_code,
          roll_no,
          length_m,
          status,
          current_location,
          base_fabric_orders:base_fabric_order_id (
            order_no,
            base_fabric_items:base_fabric_item_id (
              name
            )
          )
        `
        )
        .eq("qr_code", qrCode)
        .maybeSingle();

      // If not found by qr_code, try roll_no
      if (!baseRoll || baseError) {
        const { data: baseRollByRollNo, error: baseErrorByRollNo } = await supabaseBrowserClient
          .from("base_fabric_rolls")
          .select(
            `
            id,
            qr_code,
            roll_no,
            length_m,
            status,
            current_location,
            base_fabric_orders:base_fabric_order_id (
              order_no,
              base_fabric_items:base_fabric_item_id (
                name
              )
            )
          `
          )
          .eq("roll_no", qrCode)
          .maybeSingle();
        
        if (baseRollByRollNo && !baseErrorByRollNo) {
          baseRoll = baseRollByRollNo;
          baseError = null;
        }
      }

      if (baseRoll && !baseError) {
        // Validate roll type matches selected action
        if (!validateRollType("base_fabric", qrCode)) {
          console.warn(`Validation failed: Base fabric roll scanned but action requires different type. Action: ${selectedAction}`);
          return; // Error already set by validateRollType - do NOT add roll to list
        }

        const order = Array.isArray(baseRoll.base_fabric_orders)
          ? baseRoll.base_fabric_orders[0]
          : baseRoll.base_fabric_orders;
        const item = order?.base_fabric_items
          ? Array.isArray(order.base_fabric_items)
            ? order.base_fabric_items[0]
            : order.base_fabric_items
          : null;

        const scannedRoll: ScannedRoll = {
          qr_code: baseRoll.qr_code || qrCode,
          roll_id: baseRoll.id,
          roll_no: baseRoll.roll_no,
          type: "base_fabric",
          current_status: baseRoll.status || "UNKNOWN",
          current_location: baseRoll.current_location || "UNKNOWN",
          length_m: baseRoll.length_m,
          order_no: order?.order_no || null,
          fabric_name: item?.name || null,
        };

        setScannedRolls((prev) => [...prev, scannedRoll]);
        setError(null); // Clear any previous errors on successful scan
        // Show brief success feedback
        setSuccess(`✓ Scanned: ${baseRoll.roll_no || qrCode} (Base Fabric)`);
        setTimeout(() => setSuccess(null), 2000); // Clear after 2 seconds
        return;
      }

      // Try finished fabric roll - check qr_code, then roll_no as fallback
      let { data: finishedRoll, error: finishedError } = await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .select(
          `
          id,
          qr_code,
          roll_no,
          length_m,
          status,
          current_location,
          grade,
          color,
          coating_type
        `
        )
        .eq("qr_code", qrCode)
        .maybeSingle();

      // If not found by qr_code, try roll_no
      if (!finishedRoll || finishedError) {
        const { data: finishedRollByRollNo, error: finishedErrorByRollNo } = await supabaseBrowserClient
          .from("finished_fabric_rolls")
          .select(
            `
            id,
            qr_code,
            roll_no,
            length_m,
            status,
            current_location,
            grade,
            color,
            coating_type
          `
          )
          .eq("roll_no", qrCode)
          .maybeSingle();
        
        if (finishedRollByRollNo && !finishedErrorByRollNo) {
          finishedRoll = finishedRollByRollNo;
          finishedError = null;
        }
      }

      if (finishedRoll && !finishedError) {
        // Validate roll type matches selected action
        if (!validateRollType("finished_fabric", qrCode)) {
          console.warn(`Validation failed: Finished fabric roll scanned but action requires different type. Action: ${selectedAction}`);
          return; // Error already set by validateRollType - do NOT add roll to list
        }

        const scannedRoll: ScannedRoll = {
          qr_code: finishedRoll.qr_code || qrCode,
          roll_id: finishedRoll.id,
          roll_no: finishedRoll.roll_no,
          type: "finished_fabric",
          current_status: finishedRoll.status || "UNKNOWN",
          current_location: finishedRoll.current_location || "UNKNOWN",
          length_m: finishedRoll.length_m,
        };

        setScannedRolls((prev) => [...prev, scannedRoll]);
        setError(null); // Clear any previous errors on successful scan
        // Show brief success feedback
        setSuccess(`✓ Scanned: ${finishedRoll.roll_no || qrCode} (Finished Fabric)`);
        setTimeout(() => setSuccess(null), 2000); // Clear after 2 seconds
        return;
      }

      setError(`QR code "${qrCode}" not found in database. Please ensure the roll exists and has a QR code or roll number.`);
    } catch (err: any) {
      setError(err.message || "Failed to lookup QR code.");
    }
  }

  async function processScannedRolls() {
    if (scannedRolls.length === 0) {
      setError("No rolls scanned yet.");
      return;
    }

    if (!selectedAction) {
      setError("Please select an action.");
      return;
    }

    // Pre-validate all rolls before processing any
    const invalidRolls: string[] = [];
    for (const roll of scannedRolls) {
      if ((selectedAction === "receive_base_at_coating" || selectedAction === "issue_base_to_coating") && roll.type !== "base_fabric") {
        invalidRolls.push(`${roll.roll_no || roll.qr_code} (Expected: Base Fabric, Found: ${roll.type === "finished_fabric" ? "Finished Fabric" : "Unknown"})`);
      } else if (
        (selectedAction === "receive_finished_at_store" || selectedAction === "issue_finished_to_customer") &&
        roll.type !== "finished_fabric"
      ) {
        invalidRolls.push(`${roll.roll_no || roll.qr_code} (Expected: Finished Fabric, Found: ${roll.type === "base_fabric" ? "Base Fabric" : "Unknown"})`);
      }
    }

    if (invalidRolls.length > 0) {
      const actionNames: Record<string, string> = {
        receive_base_at_coating: "Receive Base Fabric at Coating",
        issue_base_to_coating: "Issue Base Fabric to Coating",
        receive_finished_at_store: "Receive Finished Fabric at Store",
        issue_finished_to_customer: "Issue Finished Fabric to Customer",
      };
      setError(
        `❌ Cannot process: Incorrect roll types detected!\n\n` +
        `Selected action: "${actionNames[selectedAction] || selectedAction}"\n\n` +
        `Invalid rolls:\n${invalidRolls.map((r) => `  • ${r}`).join("\n")}\n\n` +
        `Please remove these rolls from the list before processing.`
      );
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setSlipPopup(null);

    try {
      const { data: userData } = await supabaseBrowserClient.auth.getUser();

      // Handle issue_base_to_coating - create issue slip
      if (selectedAction === "issue_base_to_coating") {
        // Validate all rolls first
        for (const roll of scannedRolls) {
          if (roll.type !== "base_fabric") {
            throw new Error(`Roll ${roll.qr_code} is not a base fabric roll.`);
          }
          if (roll.current_status !== "AVAILABLE" || roll.current_location !== "WEAVING") {
            throw new Error(
              `Roll ${roll.qr_code} is not available at weaving. Current: ${roll.current_status} at ${roll.current_location}`
            );
          }
        }

        // Create issue slip
        const issueDateIso = new Date().toISOString();
        const { data: slip, error: slipError } = await supabaseBrowserClient
          .from("base_fabric_issue_slips")
          .insert({
            issue_date: issueDateIso,
            notes: null,
            from_location: "WEAVING",
            to_location: "COATING",
            created_by: userData?.user?.id || null,
          })
          .select("id, slip_no")
          .single();

        if (slipError) throw slipError;

        // Create issue lines
        const lines = scannedRolls.map((roll) => ({
          slip_id: slip.id,
          base_fabric_roll_id: roll.roll_id,
          length_m: roll.length_m || 0,
          notes: null,
        }));

        const { error: lineError } = await supabaseBrowserClient
          .from("base_fabric_issue_lines")
          .insert(lines);
        if (lineError) throw lineError;

        // Update roll statuses
        const { error: updateError } = await supabaseBrowserClient
          .from("base_fabric_rolls")
          .update({
            current_location: "COATING",
            status: "IN_TRANSIT",
          })
          .in("id", scannedRolls.map((r) => r.roll_id));
        if (updateError) throw updateError;

        // Set slip popup data for mobile display
        setSlipPopup({
          slipId: slip.id,
          slipNo: slip.slip_no,
          issueDate: issueDateIso,
          fromLocation: "WEAVING",
          toLocation: "COATING",
          rollCount: scannedRolls.length,
        });

        setSuccess(`Successfully created issue slip ${slip.slip_no || slip.id} with ${scannedRolls.length} roll(s).`);
        setScannedRolls([]);
        await stopScanning();
        return;
      }

      // Handle other actions (existing logic)
      for (const roll of scannedRolls) {
        if (selectedAction === "receive_base_at_coating") {
          if (roll.type !== "base_fabric") {
            throw new Error(`Roll ${roll.qr_code} is not a base fabric roll.`);
          }
          if (roll.current_status !== "IN_TRANSIT" || roll.current_location !== "COATING") {
            throw new Error(
              `Roll ${roll.qr_code} is not in transit to coating. Current: ${roll.current_status} at ${roll.current_location}`
            );
          }

          await supabaseBrowserClient
            .from("base_fabric_rolls")
            .update({
              status: "READY_FOR_COATING",
              current_location: "COATING",
            })
            .eq("id", roll.roll_id);
        } else if (selectedAction === "receive_finished_at_store") {
          if (roll.type !== "finished_fabric") {
            throw new Error(`Roll ${roll.qr_code} is not a finished fabric roll.`);
          }
          if (roll.current_status !== "AWAITING_RECEIPT" || roll.current_location !== "COATING") {
            throw new Error(
              `Roll ${roll.qr_code} is not awaiting receipt at store. Current: ${roll.current_status} at ${roll.current_location}`
            );
          }

          await supabaseBrowserClient
            .from("finished_fabric_rolls")
            .update({
              status: "IN_STORE",
              current_location: "FINISHED_STORE",
              received_store_at: new Date().toISOString(),
              received_store_by: userData?.user?.id || null,
            })
            .eq("id", roll.roll_id);
        } else if (selectedAction === "issue_finished_to_customer") {
          if (roll.type !== "finished_fabric") {
            throw new Error(`Roll ${roll.qr_code} is not a finished fabric roll.`);
          }
          if (roll.current_status !== "IN_STORE" || roll.current_location !== "FINISHED_STORE") {
            throw new Error(
              `Roll ${roll.qr_code} is not in store. Current: ${roll.current_status} at ${roll.current_location}`
            );
          }

          await supabaseBrowserClient
            .from("finished_fabric_rolls")
            .update({
              status: "ISSUED",
              current_location: "DISPATCHED",
              issued_store_at: new Date().toISOString(),
              issued_store_by: userData?.user?.id || null,
            })
            .eq("id", roll.roll_id);
        }
      }

      setSuccess(`Successfully processed ${scannedRolls.length} roll(s).`);
      setScannedRolls([]);
      await stopScanning();
    } catch (err: any) {
      setError(err.message || "Failed to process rolls.");
    } finally {
      setIsProcessing(false);
    }
  }

  function removeScannedRoll(qrCode: string) {
    setScannedRolls((prev) => prev.filter((r) => r.qr_code !== qrCode));
  }

  return (
    <div className="grid gap-8">
      <BackButton href="/toolbox" />

      {/* Header */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
      <h1 className="text-2xl font-semibold text-slate-900">Scan QR Code</h1>
      <p className="mt-2 text-slate-600">
          Select an action, then scan QR codes to update roll statuses.
        </p>
      </motion.section>

      {/* Action Selection */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Select Action</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => {
              setSelectedAction("receive_base_at_coating");
              setScannedRolls([]);
              lastScannedRef.current.clear();
            }}
            className={`rounded-lg border-2 p-4 text-left transition ${
              selectedAction === "receive_base_at_coating"
                ? "border-teal-700 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-slate-900">Receive Base Fabric at Coating</div>
            <div className="mt-1 text-sm text-slate-600">
              Mark base fabric rolls as received at coating department
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedAction("issue_base_to_coating");
              setScannedRolls([]);
              lastScannedRef.current.clear();
            }}
            className={`rounded-lg border-2 p-4 text-left transition ${
              selectedAction === "issue_base_to_coating"
                ? "border-teal-700 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-slate-900">Issue Base Fabric to Coating</div>
            <div className="mt-1 text-sm text-slate-600">
              Scan base fabric rolls at weaving to create issue slip
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedAction("receive_finished_at_store");
              setScannedRolls([]);
              lastScannedRef.current.clear();
            }}
            className={`rounded-lg border-2 p-4 text-left transition ${
              selectedAction === "receive_finished_at_store"
                ? "border-teal-700 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-slate-900">Receive Finished Fabric at Store</div>
            <div className="mt-1 text-sm text-slate-600">
              Mark finished fabric rolls as received in store
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedAction("issue_finished_to_customer");
              setScannedRolls([]);
              lastScannedRef.current.clear();
            }}
            className={`rounded-lg border-2 p-4 text-left transition ${
              selectedAction === "issue_finished_to_customer"
                ? "border-teal-700 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-slate-900">Issue Finished Fabric to Customer</div>
            <div className="mt-1 text-sm text-slate-600">
              Mark finished fabric rolls as issued/dispatched
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedAction("view_roll_details");
              setScannedRolls([]);
              lastScannedRef.current.clear();
            }}
            className={`rounded-lg border-2 p-4 text-left transition ${
              selectedAction === "view_roll_details"
                ? "border-teal-700 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-slate-900">View Roll Details</div>
            <div className="mt-1 text-sm text-slate-600">Scan to view roll information only</div>
          </button>
        </div>
      </motion.section>

      {/* Scanner */}
      {selectedAction && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">QR Code Scanner</h2>
            {isScanning ? (
              <Button variant="primary" onClick={stopScanning}>
                Stop Scanning
              </Button>
            ) : (
              <Button variant="primary" onClick={startScanning}>
                Start Scanning
              </Button>
            )}
          </div>

          <div 
            id="qr-reader" 
            ref={scanAreaRef} 
            className="mb-4"
            style={{ 
              minHeight: '300px',
              width: '100%'
            }}
          ></div>

          {/* iOS Safari Help Text */}
          {/iPhone|iPad|iPod/i.test(navigator.userAgent) && !isScanning && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm text-blue-800">
                <strong>iOS Safari Tip:</strong> If camera access is denied, go to{" "}
                <strong>Settings → Safari → Camera</strong> and ensure this website has permission.
                You may need to refresh the page after granting permission.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800 whitespace-pre-line">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}
        </motion.section>
      )}

      {/* Scanned Rolls */}
      {scannedRolls.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Scanned Rolls ({scannedRolls.length})
            </h2>
            {selectedAction !== "view_roll_details" && (
              <Button variant="primary" onClick={processScannedRolls} disabled={isProcessing}>
                {isProcessing ? "Processing..." : "Process All"}
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {scannedRolls.map((roll) => (
              <div
                key={roll.qr_code}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">
                    {roll.roll_no || roll.qr_code} ({roll.type === "base_fabric" ? "Base" : "Finished"})
                  </div>
                  <div className="text-sm text-slate-600">
                    QR: {roll.qr_code} | Status: {roll.current_status} | Location: {roll.current_location}
                  </div>
                  {roll.length_m && (
                    <div className="text-xs text-slate-500">Length: {roll.length_m.toFixed(2)} m</div>
                  )}
                </div>
                <button
                  onClick={() => removeScannedRoll(roll.qr_code)}
                  className="ml-4 rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-sm text-red-700 hover:bg-red-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Mobile Slip Popup */}
      {slipPopup && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={() => setSlipPopup(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Issue Slip Created</h3>
              <button
                onClick={() => setSlipPopup(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <div>
                <span className="text-sm font-semibold text-slate-700">Slip No:</span>
                <span className="ml-2 text-slate-900">{slipPopup.slipNo || "N/A"}</span>
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-700">Date:</span>
                <span className="ml-2 text-slate-900">
                  {new Date(slipPopup.issueDate).toLocaleString("en-ZA")}
                </span>
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-700">From:</span>
                <span className="ml-2 text-slate-900">{slipPopup.fromLocation}</span>
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-700">To:</span>
                <span className="ml-2 text-slate-900">{slipPopup.toLocation}</span>
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-700">Rolls:</span>
                <span className="ml-2 text-slate-900">{slipPopup.rollCount} roll(s)</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                href={`/toolbox/base-fabric/issuing/${slipPopup.slipId}`}
                className="flex-1"
                onClick={() => setSlipPopup(null)}
              >
                <Button variant="primary" className="w-full">
                  View Full Slip
                </Button>
              </Link>
              <Button
                variant="secondary"
                onClick={() => setSlipPopup(null)}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
