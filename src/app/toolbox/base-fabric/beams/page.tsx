"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

interface Beam {
  id: string;
  beam_no: string;
  tare_weight_kg: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const defaultForm = {
  id: "",
  beam_no: "",
  tare_weight_kg: "",
  is_active: true,
};

export default function BeamsPage() {
  const [beams, setBeams] = useState<Beam[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchBeams();
  }, []);

  async function fetchBeams() {
    try {
      setIsLoading(true);
      const { data, error } = await supabaseBrowserClient
        .from("weaving_beams")
        .select("id, beam_no, tare_weight_kg, is_active, created_at, updated_at")
        .order("beam_no", { ascending: true });
      if (error) throw error;
      setBeams((data as Beam[]) || []);
    } catch (err: any) {
      setError(err.message || "Failed to load beams.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value, type } = e.target;
    const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : undefined;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function startEdit(beam: Beam) {
    setIsEditing(true);
    setForm({
      id: beam.id,
      beam_no: beam.beam_no,
      tare_weight_kg: String(beam.tare_weight_kg),
      is_active: beam.is_active,
    });
    setError(null);
    setSuccess(null);
  }

  function resetForm() {
    setForm(defaultForm);
    setIsEditing(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const beamNo = form.beam_no.trim();
    const tare = form.tare_weight_kg ? parseFloat(form.tare_weight_kg) : NaN;

    if (!beamNo) {
      setError("Beam number is required.");
      return;
    }
    if (isNaN(tare) || tare < 0) {
      setError("Tare weight (kg) must be a non-negative number.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && form.id) {
        const { error: updateError } = await supabaseBrowserClient
          .from("weaving_beams")
          .update({
            beam_no: beamNo,
            tare_weight_kg: tare,
            is_active: form.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", form.id);
        if (updateError) throw updateError;
        setSuccess("Beam updated.");
      } else {
        const { error: insertError } = await supabaseBrowserClient
          .from("weaving_beams")
          .insert({
            beam_no: beamNo,
            tare_weight_kg: tare,
            is_active: form.is_active,
          });
        if (insertError) throw insertError;
        setSuccess("Beam added.");
      }
      resetForm();
      fetchBeams();
    } catch (err: any) {
      setError(err.message || "Save failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Weaving Beams</h1>
          <p className="mt-1 text-slate-600">
            Master list of steel beams (beam number and empty weight) for warp tracking.
          </p>
        </div>
        <BackButton href="/toolbox/base-fabric" label="Back to Base Fabric" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          {isEditing ? "Edit beam" : "Add beam"}
        </h2>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {success && <p className="mb-3 text-sm text-green-700">{success}</p>}
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              Beam number <span className="text-red-600">*</span>
            </label>
            <input
              name="beam_no"
              type="text"
              value={form.beam_no}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. B-01"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              Tare weight (kg) <span className="text-red-600">*</span>
            </label>
            <input
              name="tare_weight_kg"
              type="number"
              min="0"
              step="0.001"
              value={form.tare_weight_kg}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-transparent"
              placeholder="e.g. 45.5"
            />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <input
                name="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={handleChange}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              Active
            </label>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEditing ? "Update" : "Add beam"}
            </Button>
            {isEditing && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Beam list</h2>
        {isLoading ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : beams.length === 0 ? (
          <p className="text-sm text-slate-600">No beams defined yet. Add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Beam no</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Tare (kg)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {beams.map((beam) => (
                  <tr key={beam.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{beam.beam_no}</td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {Number(beam.tare_weight_kg).toFixed(3)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                          beam.is_active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {beam.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => startEdit(beam)}
                        className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </div>
  );
}
