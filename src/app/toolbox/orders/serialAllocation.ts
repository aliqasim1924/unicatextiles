import { supabaseBrowserClient } from "@/lib/supabase/browserClient";

/**
 * Re-indexes all rolls linked to a specific Store Issue / Dispatch
 * ensuring serial numbers are 100% contiguous (1, 2, 3...) with no gaps.
 */
export async function refreshIssueRollSerials(issueId: string) {
  // 1. Fetch all items assigned to this store issue ordered by scan/creation time
  const { data: items, error: fetchError } = await supabaseBrowserClient
    .from("finished_fabric_store_issue_items")
    .select("id, roll_id, created_at")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: true });

  if (fetchError || !items) throw fetchError;

  // 2. Update finished_fabric_rolls serial_no column for each roll
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item.roll_id) {
      await supabaseBrowserClient
        .from("finished_fabric_rolls")
        .update({ serial_no: index + 1 })
        .eq("id", item.roll_id);
    }
  }
}

/**
 * Adds a roll to an issue and updates serial sequence
 */
export async function addRollToIssue(issueId: string, rollId: string, lengthM: number) {
  // Insert issue item
  const { error } = await supabaseBrowserClient
    .from("finished_fabric_store_issue_items")
    .insert({
      issue_id: issueId,
      roll_id: rollId,
      length_m: lengthM,
    });

  if (error) throw error;

  // Refresh serial numbers
  await refreshIssueRollSerials(issueId);
}

/**
 * Removes a roll from an issue and auto-heals serial sequence
 */
export async function removeRollFromIssue(issueId: string, itemId: string, rollId: string) {
  // Delete issue item
  const { error } = await supabaseBrowserClient
    .from("finished_fabric_store_issue_items")
    .delete()
    .eq("id", itemId);

  if (error) throw error;

  // Clear serial on unassigned roll
  if (rollId) {
    await supabaseBrowserClient
      .from("finished_fabric_rolls")
      .update({ serial_no: null })
      .eq("id", rollId);
  }

  // Auto-heal remaining sequence
  await refreshIssueRollSerials(issueId);
}