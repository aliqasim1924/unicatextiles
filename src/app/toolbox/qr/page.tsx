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
  // For finished fabric rolls - order matching data
  fabric_type_id?: string | null;
  color_option_id?: string | null;
  gsm_option_id?: string | null;
  width_option_id?: string | null;
  color?: string | null;
  coating_type?: string | null;
  gsm?: number | null;
}

interface CustomerOrder {
  id: string;
  order_ref: string;
  status: string;
  customer_id: string;
  customers?: {
    id: string;
    name: string;
  } | null;
}

interface OrderRequirement {
  key: string;
  fabric_type_id: string | null;
  color_option_id: string | null;
  gsm_option_id: string | null;
  width_option_id: string | null;
  coating_type: string;
  color: string;
  gsm: string | null;
  ordered_m: number;
  issued_m: number;
  selected_m: number;
  remaining_m: number;
  isLegacyMatch: boolean;
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
  
  // Customer order selection state
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [orderRequirements, setOrderRequirements] = useState<OrderRequirement[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanAreaRef = useRef<HTMLDivElement>(null);
  const lastScannedRef = useRef<Map<string, number>>(new Map()); // Track last scan time for each QR code
  const SCAN_DEBOUNCE_MS = 2000; // 2 seconds between scans of the same QR code

  // Function to play beep sound on successful scan
  function playBeep() {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Configure beep sound (800Hz frequency, 0.1 second duration)
      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (err) {
      // Silently fail if audio context is not available (e.g., user hasn't interacted with page)
      console.debug("Could not play beep sound:", err);
    }
  }

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

  // Fetch customer orders when issue_finished_to_customer action is selected
  useEffect(() => {
    if (selectedAction === "issue_finished_to_customer") {
      fetchCustomerOrders();
    } else {
      setCustomerOrders([]);
      setSelectedOrderId("");
      setOrderRequirements([]);
    }
  }, [selectedAction]);

  // Fetch order requirements when order is selected
  useEffect(() => {
    if (selectedAction === "issue_finished_to_customer" && selectedOrderId) {
      fetchOrderRequirements();
    } else {
      setOrderRequirements([]);
    }
  }, [selectedAction, selectedOrderId]);

  async function fetchCustomerOrders() {
    try {
      setIsLoadingOrders(true);
      const { data, error: orderError } = await supabaseBrowserClient
        .from("customer_orders")
        .select(
          `
          id,
          order_ref,
          status,
          customer_id,
          customers:customer_id (
            id,
            name
          )
        `
        )
        .in("status", ["OPEN", "PARTIALLY_FULFILLED"])
        .order("order_ref", { ascending: false });

      if (orderError) throw orderError;

      // Normalize customers from array to single object
      const normalized = (data || []).map((item: any) => ({
        ...item,
        customers: Array.isArray(item.customers)
          ? item.customers[0] || null
          : item.customers,
      }));

      setCustomerOrders(normalized as CustomerOrder[]);
    } catch (err: any) {
      console.error("Failed to load customer orders", err);
      setError(err?.message || "Failed to load customer orders.");
    } finally {
      setIsLoadingOrders(false);
    }
  }

  async function fetchOrderRequirements() {
    if (!selectedOrderId) return;

    try {
      // Fetch order lines
      const { data: linesData, error: linesError } = await supabaseBrowserClient
        .from("customer_order_lines")
        .select("id, fabric_type_id, color_option_id, gsm_option_id, width_option_id, coating_type, color, gsm, quantity_m")
        .eq("order_id", selectedOrderId);

      if (linesError) throw linesError;

      // Build match key helper
      const buildMatchKey = (line: any): string => {
        if (line.fabric_type_id && line.color_option_id) {
          const parts = [
            line.fabric_type_id,
            line.color_option_id,
            line.gsm_option_id || "",
            line.width_option_id || "",
          ];
          return parts.join("|");
        }
        // Fallback: use text matching for legacy data
        const normalizedCoating = (line.coating_type || "").trim().toLowerCase().replace(/\s+/g, " ");
        const normalizedColor = (line.color || "").trim().toLowerCase().replace(/\s+/g, " ");
        const normalizedGsm = line.gsm ? line.gsm.toString().trim().toLowerCase() : "";
        return `TEXT|${normalizedCoating}|${normalizedColor}|${normalizedGsm}`;
      };

      // Group by match key
      const requiredMap: Record<
        string,
        {
          ordered_m: number;
          coating_type: string;
          color: string;
          gsm: string | null;
          fabric_type_id: string | null;
          color_option_id: string | null;
          gsm_option_id: string | null;
          width_option_id: string | null;
        }
      > = {};

      (linesData || []).forEach((line: any) => {
        const key = buildMatchKey(line);
        if (!requiredMap[key]) {
          requiredMap[key] = {
            ordered_m: 0,
            coating_type: line.coating_type,
            color: line.color,
            gsm: line.gsm?.toString() || null,
            fabric_type_id: line.fabric_type_id,
            color_option_id: line.color_option_id,
            gsm_option_id: line.gsm_option_id,
            width_option_id: line.width_option_id,
          };
        }
        requiredMap[key].ordered_m += Number(line.quantity_m || 0);
      });

      // Fetch already-issued meters
      const { data: issuesData, error: issuesError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .select(
          `
          id,
          finished_fabric_store_issue_items (
            roll_id,
            finished_fabric_rolls:roll_id (
              fabric_type_id,
              color_option_id,
              gsm_option_id,
              width_option_id,
              color,
              coating_type,
              gsm,
              length_m
            )
          )
        `
        )
        .eq("order_id", selectedOrderId)
        .eq("destination", "CUSTOMER");

      if (issuesError) throw issuesError;

      // Build roll match key helper
      const buildRollMatchKey = (roll: any): string | null => {
        if (roll.fabric_type_id && roll.color_option_id) {
          const parts = [
            roll.fabric_type_id,
            roll.color_option_id,
            roll.gsm_option_id || "",
            roll.width_option_id || "",
          ];
          return parts.join("|");
        }
        // Fallback: use text matching for legacy data
        if (roll.coating_type && roll.color) {
          const normalizedCoating = (roll.coating_type || "").trim().toLowerCase().replace(/\s+/g, " ");
          const normalizedColor = (roll.color || "").trim().toLowerCase().replace(/\s+/g, " ");
          const normalizedGsm = roll.gsm ? roll.gsm.toString().trim().toLowerCase() : "";
          return `TEXT|${normalizedCoating}|${normalizedColor}|${normalizedGsm}`;
        }
        return null;
      };

      const issuedMap: Record<string, number> = {};
      (issuesData || []).forEach((issue: any) => {
        (issue.finished_fabric_store_issue_items || []).forEach((item: any) => {
          const roll = Array.isArray(item.finished_fabric_rolls)
            ? item.finished_fabric_rolls[0]
            : item.finished_fabric_rolls;
          if (roll) {
            const key = buildRollMatchKey(roll);
            if (key) {
              issuedMap[key] = (issuedMap[key] || 0) + Number(roll.length_m || 0);
            }
          }
        });
      });

      // Build requirements array
      const requirements: OrderRequirement[] = Object.entries(requiredMap).map(([key, data]) => {
        const isLegacyMatch = key.startsWith("TEXT|");
        const issued_m = issuedMap[key] || 0;
        return {
          key,
          fabric_type_id: data.fabric_type_id,
          color_option_id: data.color_option_id,
          gsm_option_id: data.gsm_option_id,
          width_option_id: data.width_option_id,
          coating_type: data.coating_type,
          color: data.color,
          gsm: data.gsm,
          ordered_m: data.ordered_m,
          issued_m,
          selected_m: 0, // Will be computed from scanned rolls
          remaining_m: data.ordered_m - issued_m,
          isLegacyMatch,
        };
      });

      setOrderRequirements(requirements);
    } catch (err: any) {
      console.error("Failed to load order requirements", err);
      setError(err?.message || "Failed to load order requirements.");
    }
  }

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
        // Play beep sound on successful scan
        playBeep();
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
          coating_type,
          gsm,
          fabric_type_id,
          color_option_id,
          gsm_option_id,
          width_option_id
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
            coating_type,
            gsm,
            fabric_type_id,
            color_option_id,
            gsm_option_id,
            width_option_id
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
          fabric_type_id: finishedRoll.fabric_type_id || null,
          color_option_id: finishedRoll.color_option_id || null,
          gsm_option_id: finishedRoll.gsm_option_id || null,
          width_option_id: finishedRoll.width_option_id || null,
          color: finishedRoll.color || null,
          coating_type: finishedRoll.coating_type || null,
          gsm: finishedRoll.gsm ? Number(finishedRoll.gsm) : null,
        };

        setScannedRolls((prev) => [...prev, scannedRoll]);
        setError(null); // Clear any previous errors on successful scan
        // Play beep sound on successful scan
        playBeep();
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

  // Helper function to build match key from roll
  function buildRollKey(roll: ScannedRoll): string | null {
    if (roll.fabric_type_id && roll.color_option_id) {
      const parts = [
        roll.fabric_type_id,
        roll.color_option_id,
        roll.gsm_option_id || "",
        roll.width_option_id || "",
      ];
      return parts.join("|");
    }
    // Fallback for legacy data
    if (roll.coating_type && roll.color) {
      const normalizedCoating = (roll.coating_type || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedColor = (roll.color || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedGsm = roll.gsm ? roll.gsm.toString().trim().toLowerCase() : "";
      return `TEXT|${normalizedCoating}|${normalizedColor}|${normalizedGsm}`;
    }
    return null;
  }

  // Helper function to check if a roll matches a requirement
  function rollMatchesRequirement(roll: ScannedRoll, req: OrderRequirement): boolean {
    // Primary matching: Use catalog IDs
    if (roll.fabric_type_id && roll.color_option_id && req.fabric_type_id && req.color_option_id) {
      // Must match fabric_type_id and color_option_id
      if (roll.fabric_type_id !== req.fabric_type_id || roll.color_option_id !== req.color_option_id) {
        return false;
      }
      // If gsm_option_id exists on both, they must match
      if (req.gsm_option_id && roll.gsm_option_id && roll.gsm_option_id !== req.gsm_option_id) {
        return false;
      }
      // If width_option_id exists on both, they must match
      if (req.width_option_id && roll.width_option_id && roll.width_option_id !== req.width_option_id) {
        return false;
      }
      return true;
    }

    // Fallback: Text matching for legacy data
    if (req.isLegacyMatch && roll.coating_type && roll.color) {
      const normalizedRollCoating = (roll.coating_type || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedRollColor = (roll.color || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedRollGsm = roll.gsm ? roll.gsm.toString().trim().toLowerCase() : "";
      const normalizedReqCoating = (req.coating_type || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedReqColor = (req.color || "").trim().toLowerCase().replace(/\s+/g, " ");

      return (
        normalizedRollCoating === normalizedReqCoating &&
        normalizedRollColor === normalizedReqColor &&
        (!req.gsm_option_id || normalizedRollGsm === (req.gsm || "").trim().toLowerCase())
      );
    }

    return false;
  }

  // Validate scanned rolls against order requirements
  function validateScannedRollsAgainstOrder(): { valid: boolean; error?: string } {
    if (selectedAction !== "issue_finished_to_customer" || !selectedOrderId) {
      return { valid: true };
    }

    if (orderRequirements.length === 0) {
      return { valid: true }; // No requirements to validate against
    }

    // Compute selected meters per requirement key
    const selectedMetersByKey: Record<string, number> = {};
    scannedRolls.forEach((roll) => {
      const key = buildRollKey(roll);
      if (key) {
        selectedMetersByKey[key] = (selectedMetersByKey[key] || 0) + (roll.length_m || 0);
      }
    });

    // Check each requirement
    for (const req of orderRequirements) {
      const selected_m = selectedMetersByKey[req.key] || 0;
      const newRemaining = req.ordered_m - req.issued_m - selected_m;

      if (newRemaining < 0) {
        return {
          valid: false,
          error: `Cannot allocate: Selected quantity (${selected_m.toFixed(2)} m) exceeds remaining ordered amount (${(req.ordered_m - req.issued_m).toFixed(2)} m) for ${req.color} (${req.coating_type})`,
        };
      }
    }

    return { valid: true };
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

    // Validate customer order selection for issue_finished_to_customer
    if (selectedAction === "issue_finished_to_customer" && !selectedOrderId) {
      setError("Please select a customer order before processing.");
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
        }
      }

      // Handle issue_finished_to_customer - create store issue with order
      if (selectedAction === "issue_finished_to_customer") {
        // Validate against order requirements
        const validation = validateScannedRollsAgainstOrder();
        if (!validation.valid) {
          throw new Error(validation.error || "Validation failed");
        }

        // Get selected order details
        const selectedOrder = customerOrders.find((o) => o.id === selectedOrderId);
        if (!selectedOrder) {
          throw new Error("Selected customer order not found.");
        }

        // Create store issue
        const { data: issue, error: issueError } = await supabaseBrowserClient
          .from("finished_fabric_store_issues")
          .insert({
            issued_by: userData?.user?.id || null,
            destination: "CUSTOMER",
            reference: selectedOrder.order_ref || null,
            notes: null,
            order_id: selectedOrderId,
          })
          .select("id, issue_no")
          .single();

        if (issueError) throw issueError;

        // Create issue items
        const lineRows = scannedRolls.map((roll) => ({
          issue_id: issue.id,
          roll_id: roll.roll_id,
          roll_no: roll.roll_no,
          length_m: roll.length_m || 0,
          grade: null, // Grade not available from scanned roll
        }));

        const { error: lineError } = await supabaseBrowserClient
          .from("finished_fabric_store_issue_items")
          .insert(lineRows);
        if (lineError) throw lineError;

        // Update roll statuses
        const { error: updateError } = await supabaseBrowserClient
          .from("finished_fabric_rolls")
          .update({
            status: "ISSUED",
            current_location: "DISPATCHED",
            issued_store_at: new Date().toISOString(),
            issued_store_by: userData?.user?.id || null,
          })
          .in("id", scannedRolls.map((r) => r.roll_id));
        if (updateError) throw updateError;

        setSuccess(`Successfully issued ${scannedRolls.length} roll(s) to customer order ${selectedOrder.order_ref || selectedOrderId}.`);
        setScannedRolls([]);
        setSelectedOrderId("");
        await stopScanning();
        return;
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
    <div className="grid gap-4 sm:gap-6 md:gap-8 max-w-full overflow-x-hidden">
      <BackButton href="/toolbox" />

      {/* Header */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
      >
      <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Scan QR Code</h1>
      <p className="mt-2 text-sm sm:text-base text-slate-600">
          Select an action, then scan QR codes to update roll statuses.
        </p>
      </motion.section>

      {/* Action Selection */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
      >
        <h2 className="mb-4 text-base sm:text-lg font-semibold text-slate-900">Select Action</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => {
              setSelectedAction("receive_base_at_coating");
              setScannedRolls([]);
              lastScannedRef.current.clear();
            }}
            className={`rounded-lg border-2 p-3 sm:p-4 text-left transition min-h-[60px] sm:min-h-[80px] ${
              selectedAction === "receive_base_at_coating"
                ? "border-teal-700 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-sm sm:text-base text-slate-900">Receive Base Fabric at Coating</div>
            <div className="mt-1 text-xs sm:text-sm text-slate-600">
              Mark base fabric rolls as received at coating department
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedAction("issue_base_to_coating");
              setScannedRolls([]);
              lastScannedRef.current.clear();
            }}
            className={`rounded-lg border-2 p-3 sm:p-4 text-left transition min-h-[60px] sm:min-h-[80px] ${
              selectedAction === "issue_base_to_coating"
                ? "border-teal-700 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-sm sm:text-base text-slate-900">Issue Base Fabric to Coating</div>
            <div className="mt-1 text-xs sm:text-sm text-slate-600">
              Scan base fabric rolls at weaving to create issue slip
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedAction("receive_finished_at_store");
              setScannedRolls([]);
              lastScannedRef.current.clear();
            }}
            className={`rounded-lg border-2 p-3 sm:p-4 text-left transition min-h-[60px] sm:min-h-[80px] ${
              selectedAction === "receive_finished_at_store"
                ? "border-teal-700 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-sm sm:text-base text-slate-900">Receive Finished Fabric at Store</div>
            <div className="mt-1 text-xs sm:text-sm text-slate-600">
              Mark finished fabric rolls as received in store
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedAction("issue_finished_to_customer");
              setScannedRolls([]);
              lastScannedRef.current.clear();
            }}
            className={`rounded-lg border-2 p-3 sm:p-4 text-left transition min-h-[60px] sm:min-h-[80px] ${
              selectedAction === "issue_finished_to_customer"
                ? "border-teal-700 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-sm sm:text-base text-slate-900">Issue Finished Fabric to Customer</div>
            <div className="mt-1 text-xs sm:text-sm text-slate-600">
              Mark finished fabric rolls as issued/dispatched
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedAction("view_roll_details");
              setScannedRolls([]);
              lastScannedRef.current.clear();
            }}
            className={`rounded-lg border-2 p-3 sm:p-4 text-left transition min-h-[60px] sm:min-h-[80px] ${
              selectedAction === "view_roll_details"
                ? "border-teal-700 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="font-semibold text-sm sm:text-base text-slate-900">View Roll Details</div>
            <div className="mt-1 text-xs sm:text-sm text-slate-600">Scan to view roll information only</div>
          </button>
        </div>
      </motion.section>

      {/* Customer Order Selection - for issue_finished_to_customer */}
      {selectedAction === "issue_finished_to_customer" && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
        >
          <h2 className="mb-4 text-base sm:text-lg font-semibold text-slate-900">Select Customer Order</h2>
          
          {isLoadingOrders ? (
            <p className="text-sm text-slate-600">Loading customer orders...</p>
          ) : customerOrders.length === 0 ? (
            <p className="text-sm text-slate-600">No open or partially fulfilled customer orders available.</p>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Customer Order <span className="text-red-600">*</span>
                </label>
                <select
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 sm:px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent min-h-[44px]"
                >
                  <option value="">-- Select Order --</option>
                  {customerOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.order_ref} - {order.customers?.name || "Unknown Customer"} ({order.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Order Requirements Summary */}
              {selectedOrderId && orderRequirements.length > 0 && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">Order Requirements</h3>
                  <div className="space-y-2 max-h-48 sm:max-h-64 overflow-y-auto">
                    {orderRequirements.map((req) => {
                      // Calculate selected meters for this requirement
                      const selectedMeters = scannedRolls
                        .filter((roll) => {
                          const key = buildRollKey(roll);
                          return key === req.key && rollMatchesRequirement(roll, req);
                        })
                        .reduce((sum, roll) => sum + (roll.length_m || 0), 0);
                      
                      const remaining = req.ordered_m - req.issued_m - selectedMeters;
                      const isExceeding = remaining < 0;

                      return (
                        <div
                          key={req.key}
                          className={`rounded border p-2.5 sm:p-3 text-xs sm:text-sm ${
                            isExceeding
                              ? "border-red-300 bg-red-50"
                              : remaining < 1
                              ? "border-yellow-300 bg-yellow-50"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="font-medium text-slate-900 break-words">
                            {req.color} ({req.coating_type})
                            {req.gsm && ` - ${req.gsm} GSM`}
                          </div>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                            <div className="break-words">
                              <span className="font-medium">Ordered:</span> {req.ordered_m.toFixed(2)} m
                            </div>
                            <div className="break-words">
                              <span className="font-medium">Issued:</span> {req.issued_m.toFixed(2)} m
                            </div>
                            <div className="break-words">
                              <span className="font-medium">Scanned:</span> {selectedMeters.toFixed(2)} m
                            </div>
                            <div className={`break-words ${isExceeding ? "text-red-700 font-semibold" : "text-slate-700"}`}>
                              <span className="font-medium">Remaining:</span> {remaining.toFixed(2)} m
                            </div>
                          </div>
                          {isExceeding && (
                            <div className="mt-1.5 text-xs text-red-700 font-medium">
                              ⚠ Exceeds order requirement
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedOrderId && orderRequirements.length === 0 && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs sm:text-sm text-blue-800">
                  Loading order requirements...
                </div>
              )}
            </>
          )}
        </motion.section>
      )}

      {/* Scanner */}
      {selectedAction && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
        >
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">QR Code Scanner</h2>
            {isScanning ? (
              <Button variant="primary" onClick={stopScanning} className="w-full sm:w-auto min-h-[44px]">
                Stop Scanning
              </Button>
            ) : (
              <Button variant="primary" onClick={startScanning} className="w-full sm:w-auto min-h-[44px]">
                Start Scanning
              </Button>
            )}
          </div>

          <div 
            id="qr-reader" 
            ref={scanAreaRef} 
            className="mb-4 w-full overflow-hidden"
            style={{ 
              minHeight: '250px',
              width: '100%'
            }}
          ></div>

          {/* iOS Safari Help Text */}
          {/iPhone|iPad|iPod/i.test(navigator.userAgent) && !isScanning && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs sm:text-sm text-blue-800">
                <strong>iOS Safari Tip:</strong> If camera access is denied, go to{" "}
                <strong>Settings → Safari → Camera</strong> and ensure this website has permission.
                You may need to refresh the page after granting permission.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs sm:text-sm text-red-800 whitespace-pre-line break-words">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-xs sm:text-sm text-green-800 break-words">{success}</p>
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
          className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
        >
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">
              Scanned Rolls ({scannedRolls.length})
            </h2>
            {selectedAction !== "view_roll_details" && (
              <Button 
                variant="primary" 
                onClick={processScannedRolls} 
                disabled={isProcessing}
                className="w-full sm:w-auto min-h-[44px]"
              >
                {isProcessing ? "Processing..." : "Process All"}
              </Button>
            )}
          </div>

          <div className="space-y-2 max-h-[400px] sm:max-h-[500px] overflow-y-auto pr-1">
            {scannedRolls.map((roll) => {
              // Check if roll matches order requirement (for issue_finished_to_customer)
              let matchesOrder = false;
              let orderMatchInfo = null;
              if (selectedAction === "issue_finished_to_customer" && selectedOrderId && orderRequirements.length > 0) {
                const matchingReq = orderRequirements.find((req) => rollMatchesRequirement(roll, req));
                if (matchingReq) {
                  matchesOrder = true;
                  const selectedMeters = scannedRolls
                    .filter((r) => {
                      const key = buildRollKey(r);
                      return key === matchingReq.key && rollMatchesRequirement(r, matchingReq);
                    })
                    .reduce((sum, r) => sum + (r.length_m || 0), 0);
                  const remaining = matchingReq.ordered_m - matchingReq.issued_m - selectedMeters;
                  orderMatchInfo = {
                    requirement: matchingReq,
                    remaining,
                    isExceeding: remaining < 0,
                  };
                }
              }

              return (
                <div
                  key={roll.qr_code}
                  className={`flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3 gap-3 ${
                    selectedAction === "issue_finished_to_customer" && selectedOrderId
                      ? matchesOrder
                        ? orderMatchInfo?.isExceeding
                          ? "border-red-300 bg-red-50"
                          : "border-green-300 bg-green-50"
                        : "border-yellow-300 bg-yellow-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm sm:text-base text-slate-900 break-words">
                      {roll.roll_no || roll.qr_code} ({roll.type === "base_fabric" ? "Base" : "Finished"})
                    </div>
                    <div className="text-xs sm:text-sm text-slate-600 mt-1 space-y-0.5">
                      <div className="break-words">QR: {roll.qr_code}</div>
                      <div className="break-words">Status: {roll.current_status}</div>
                      <div className="break-words">Location: {roll.current_location}</div>
                    </div>
                    {roll.length_m && (
                      <div className="text-xs text-slate-500 mt-1">Length: {roll.length_m.toFixed(2)} m</div>
                    )}
                    {selectedAction === "issue_finished_to_customer" && selectedOrderId && (
                      <div className="mt-2 text-xs break-words">
                        {matchesOrder ? (
                          orderMatchInfo?.isExceeding ? (
                            <span className="text-red-700 font-medium">
                              ⚠ Exceeds order: {orderMatchInfo.remaining.toFixed(2)} m over
                            </span>
                          ) : (
                            <span className="text-green-700">
                              ✓ Matches order ({orderMatchInfo?.requirement.color} - {orderMatchInfo?.requirement.coating_type})
                            </span>
                          )
                        ) : (
                          <span className="text-yellow-700">
                            ⚠ Does not match any order requirement
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeScannedRoll(roll.qr_code)}
                    className="rounded-lg border border-red-300 bg-red-50 px-3 sm:px-4 py-2 text-xs sm:text-sm text-red-700 hover:bg-red-100 min-h-[44px] sm:min-h-auto sm:ml-4 flex-shrink-0"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
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
