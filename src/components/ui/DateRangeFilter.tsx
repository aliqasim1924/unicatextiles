"use client";

import { useId } from "react";

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

interface DateRangeFilterProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  label?: string;
  className?: string;
  /** If true, show helper text that leaving both empty means "all" */
  showAllHint?: boolean;
}

export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  label = "Date range",
  className = "",
  showAllHint = true,
}: DateRangeFilterProps) {
  const fromId = useId();
  const toId = useId();

  return (
    <div className={`flex flex-col lg:flex-row lg:items-end gap-3 ${className}`}>
      {label && (
        <label className="block text-sm font-semibold text-slate-900 whitespace-nowrap lg:pb-2.5">
          {label}
        </label>
      )}
      <div className="flex flex-col sm:flex-row gap-3 flex-1">
        <div className="flex-1 min-w-[140px]">
          <label htmlFor={fromId} className="block text-xs font-medium text-slate-600 mb-1">
            From
          </label>
          <input
            id={fromId}
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label htmlFor={toId} className="block text-xs font-medium text-slate-600 mb-1">
            To
          </label>
          <input
            id={toId}
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
          />
        </div>
      </div>
      {showAllHint && (
        <p className="text-xs text-slate-500 lg:pb-2.5 lg:whitespace-nowrap">
          Leave both empty for all dates.
        </p>
      )}
    </div>
  );
}

/** Return true if date (YYYY-MM-DD or ISO string) is within [from, to] (inclusive). Empty from/to means no bound. */
export function isDateInRange(
  dateStr: string,
  from: string,
  to: string
): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const t = d.getTime();
  if (from) {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    if (t < fromDate.getTime()) return false;
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    if (t > toDate.getTime()) return false;
  }
  return true;
}
