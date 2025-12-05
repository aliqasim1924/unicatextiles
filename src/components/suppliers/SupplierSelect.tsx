"use client";

import { useEffect, useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";

interface Supplier {
  id: string;
  name: string;
  code: string | null;
}

interface SupplierSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  allowNone?: boolean;
}

export function SupplierSelect({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  allowNone = true,
}: SupplierSelectProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSuppliers() {
      try {
        const { data, error: fetchError } = await supabaseBrowserClient
          .from("suppliers")
          .select("id, name, code")
          .eq("is_active", true)
          .order("name");

        if (fetchError) throw fetchError;
        setSuppliers(data || []);
      } catch (err) {
        console.error("Error fetching suppliers:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSuppliers();
  }, []);

  return (
    <div className="w-full">
      <label
        htmlFor="supplier"
        className="block text-sm font-semibold text-slate-900 mb-1.5"
      >
        Supplier {required && <span className="text-red-600">*</span>}
      </label>
      <select
        id="supplier"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled || isLoading}
        className={`
          w-full rounded-lg border px-4 py-2.5 text-sm
          text-slate-900 bg-white
          focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent
          transition
          ${error 
            ? "border-red-600 focus:ring-red-600" 
            : "border-slate-200"
          }
          ${disabled || isLoading ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        {allowNone && <option value="">{isLoading ? "Loading..." : "Select supplier (optional)"}</option>}
        {!allowNone && isLoading && <option value="">Loading...</option>}
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
            {supplier.code && ` (${supplier.code})`}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1.5 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

