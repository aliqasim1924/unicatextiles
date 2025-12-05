"use client";

import { useEffect, useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";

interface YarnItem {
  id: string;
  name: string;
  denier: number | null;
  material: string | null;
}

interface YarnItemSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}

export function YarnItemSelect({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
}: YarnItemSelectProps) {
  const [items, setItems] = useState<YarnItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchItems() {
      try {
        const { data, error: fetchError } = await supabaseBrowserClient
          .from("yarn_items")
          .select("id, name, denier, material")
          .eq("is_active", true)
          .order("name");

        if (fetchError) throw fetchError;
        setItems(data || []);
      } catch (err) {
        console.error("Error fetching yarn items:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchItems();
  }, []);

  return (
    <div className="w-full">
      <label
        htmlFor="yarn-item"
        className="block text-sm font-semibold text-slate-900 mb-1.5"
      >
        Yarn Item {required && <span className="text-red-600">*</span>}
      </label>
      <select
        id="yarn-item"
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
        <option value="">{isLoading ? "Loading..." : "Select yarn item"}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.denier && ` (${item.denier}D)`}
            {item.material && ` - ${item.material}`}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1.5 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

