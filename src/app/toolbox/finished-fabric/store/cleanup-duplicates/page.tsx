"use client";

import { useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/navigation/BackButton";

const STATUS_IN_STORE = "IN_STORE";
const LOCATION_STORE = "FINISHED_STORE";
const STATUS_ISSUED = "ISSUED";
const LOCATION_DISPATCHED = "DISPATCHED";

export default function CleanupDuplicatesPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<{
    duplicateIssues: any[];
    duplicateItems: any[];
    fixedRolls: any[];
    errors: string[];
  } | null>(null);

  async function findAndCleanDuplicates() {
    setIsRunning(true);
    setResults(null);

    const errors: string[] = [];
    const duplicateIssues: any[] = [];
    const duplicateItems: any[] = [];
    const fixedRolls: any[] = [];

    try {
      // Step 1: Find duplicate issues (same order_id, same rolls, created within short time)
      const { data: allIssues, error: issuesError } = await supabaseBrowserClient
        .from("finished_fabric_store_issues")
        .select("id, issue_no, order_id, issue_time, destination")
        .eq("destination", "CUSTOMER")
        .not("order_id", "is", null)
        .order("issue_time", { ascending: false });

      if (issuesError) throw issuesError;

      // Group issues by order_id and find duplicates
      const issuesByOrder: Record<string, any[]> = {};
      (allIssues || []).forEach((issue: any) => {
        if (issue.order_id) {
          if (!issuesByOrder[issue.order_id]) {
            issuesByOrder[issue.order_id] = [];
          }
          issuesByOrder[issue.order_id].push(issue);
        }
      });

      // Find duplicate issues (same order, created within 5 minutes of each other)
      const duplicateIssueGroups: any[][] = [];
      Object.values(issuesByOrder).forEach((orderIssues) => {
        if (orderIssues.length > 1) {
          // Sort by time
          orderIssues.sort((a, b) => new Date(a.issue_time).getTime() - new Date(b.issue_time).getTime());
          
          // Group by time proximity (within 5 minutes)
          const groups: any[][] = [];
          orderIssues.forEach((issue) => {
            let added = false;
            for (const group of groups) {
              const lastIssue = group[group.length - 1];
              const timeDiff = Math.abs(
                new Date(issue.issue_time).getTime() - new Date(lastIssue.issue_time).getTime()
              );
              if (timeDiff < 5 * 60 * 1000) {
                // Within 5 minutes
                group.push(issue);
                added = true;
                break;
              }
            }
            if (!added) {
              groups.push([issue]);
            }
          });
          
          // Find groups with duplicates
          groups.forEach((group) => {
            if (group.length > 1) {
              duplicateIssueGroups.push(group);
            }
          });
        }
      });

      // Step 2: For each duplicate group, check if they have overlapping rolls
      for (const group of duplicateIssueGroups) {
        const issueIds = group.map((i) => i.id);
        
        // Get all items for these issues
        const { data: allItems, error: itemsError } = await supabaseBrowserClient
          .from("finished_fabric_store_issue_items")
          .select("id, issue_id, roll_id, roll_no, length_m")
          .in("issue_id", issueIds);

        if (itemsError) {
          errors.push(`Error fetching items for issues ${issueIds.join(", ")}: ${itemsError.message}`);
          continue;
        }

        // Group items by issue_id
        const itemsByIssue: Record<string, any[]> = {};
        (allItems || []).forEach((item: any) => {
          if (!itemsByIssue[item.issue_id]) {
            itemsByIssue[item.issue_id] = [];
          }
          itemsByIssue[item.issue_id].push(item);
        });

        // Find issues that have overlapping roll_ids (true duplicates). Keep oldest of each "unique" set of rolls.
        const sortedGroup = [...group].sort(
          (a, b) => new Date(a.issue_time).getTime() - new Date(b.issue_time).getTime()
        );
        const keptRollIds = new Set<string>(); // Rolls already accounted for by issues we're keeping
        const duplicateIssuesToDelete: any[] = [];
        const duplicateRollIds: string[] = [];

        for (let i = 0; i < sortedGroup.length; i++) {
          const checkIssue = sortedGroup[i];
          const checkIssueRollIds = (itemsByIssue[checkIssue.id] || []).map((item: any) => item.roll_id);
          const overlappingRolls = checkIssueRollIds.filter((rollId: string) => keptRollIds.has(rollId));

          if (overlappingRolls.length > 0) {
            // This issue repeats rolls we already kept → treat as duplicate and delete it
            duplicateIssuesToDelete.push(checkIssue);
            duplicateRollIds.push(...overlappingRolls);
            duplicateItems.push(...(itemsByIssue[checkIssue.id] || []).filter((item: any) =>
              overlappingRolls.includes(item.roll_id)
            ));
          } else {
            // No overlap with kept issues → keep this issue and add its rolls to kept set
            checkIssueRollIds.forEach((rollId: string) => keptRollIds.add(rollId));
          }
        }

        if (duplicateIssuesToDelete.length > 0) {
          // Delete duplicate issues: first delete items (don't rely on CASCADE in case RLS or schema differs), then the issue
          for (const dupIssue of duplicateIssuesToDelete) {
            const { error: deleteItemsError } = await supabaseBrowserClient
              .from("finished_fabric_store_issue_items")
              .delete()
              .eq("issue_id", dupIssue.id);

            if (deleteItemsError) {
              errors.push(`Error deleting items for issue ${dupIssue.issue_no}: ${deleteItemsError.message}`);
              continue;
            }

            const { error: deleteIssueError } = await supabaseBrowserClient
              .from("finished_fabric_store_issues")
              .delete()
              .eq("id", dupIssue.id);

            if (deleteIssueError) {
              errors.push(`Error deleting duplicate issue ${dupIssue.issue_no}: ${deleteIssueError.message}`);
              continue;
            }

            // Verify delete persisted (RLS or other policies can cause silent no-op)
            const { data: stillThere } = await supabaseBrowserClient
              .from("finished_fabric_store_issues")
              .select("id")
              .eq("id", dupIssue.id)
              .maybeSingle();

            if (stillThere) {
              errors.push(
                `Delete did not persist for issue ${dupIssue.issue_no} (likely RLS). Run the migration "add_rls_policies_finished_fabric_store_issues.sql" in Supabase SQL Editor.`
              );
            } else {
              duplicateIssues.push(dupIssue);
            }
          }

          // Step 3: Fix roll statuses - restore rolls that have no valid issue items
          const uniqueDuplicateRollIds = [...new Set(duplicateRollIds)];
          const { data: rollStatuses, error: rollStatusError } = await supabaseBrowserClient
            .from("finished_fabric_rolls")
            .select("id, roll_no, status, current_location")
            .in("id", uniqueDuplicateRollIds);

          if (rollStatusError) {
            errors.push(`Error checking roll statuses: ${rollStatusError.message}`);
          } else {
            // Check if rolls have any remaining valid issue items after cleanup
            const { data: remainingItems, error: remainingItemsError } = await supabaseBrowserClient
              .from("finished_fabric_store_issue_items")
              .select("roll_id")
              .in("roll_id", uniqueDuplicateRollIds);

            if (!remainingItemsError && remainingItems) {
              const rollsWithValidIssues = new Set(remainingItems.map((item: any) => item.roll_id));
              
              // Rolls that don't have any valid issue items should be restored to IN_STORE
              const rollsToRestore = (rollStatuses || []).filter(
                (roll) => !rollsWithValidIssues.has(roll.id) && roll.status === STATUS_ISSUED
              );

              if (rollsToRestore.length > 0) {
                const restoreRollIds = rollsToRestore.map((r) => r.id);
                const { error: restoreError } = await supabaseBrowserClient
                  .from("finished_fabric_rolls")
                  .update({
                    status: STATUS_IN_STORE,
                    current_location: LOCATION_STORE,
                    issued_store_at: null,
                    issued_store_by: null,
                  })
                  .in("id", restoreRollIds);

                if (restoreError) {
                  errors.push(`Error restoring rolls to store: ${restoreError.message}`);
                } else {
                  fixedRolls.push(...rollsToRestore);
                }
              }
            }
          }
        }
      }

      setResults({
        duplicateIssues,
        duplicateItems,
        fixedRolls,
        errors,
      });
    } catch (err: any) {
      errors.push(err.message || "Unknown error occurred");
      setResults({
        duplicateIssues: [],
        duplicateItems: [],
        fixedRolls: [],
        errors,
      });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <BackButton href="/toolbox/finished-fabric/store" />
        <h1 className="mt-4 text-3xl font-semibold text-slate-900">Cleanup Duplicate Issues</h1>
        <p className="mt-2 text-slate-600">
          This utility finds and removes duplicate finished fabric store issues and restores stock figures.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <p className="text-sm text-slate-700">
            This will:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-slate-600">
            <li>Find duplicate issues for the same order created within 5 minutes</li>
            <li>Keep the first (oldest) issue and delete duplicates</li>
            <li>Restore rolls to IN_STORE status if they have no valid issue items</li>
          </ul>
          <p className="mt-3 text-sm text-slate-600">
            If you run this and the same duplicates keep appearing, deletes are not persisting (often due to RLS).
            Run <code className="rounded bg-slate-200 px-1">migrations/add_rls_policies_finished_fabric_store_issues.sql</code> in
            Supabase → SQL Editor, then run cleanup again.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={findAndCleanDuplicates}
          disabled={isRunning}
          className="w-full md:w-auto"
        >
          {isRunning ? "Running Cleanup..." : "Find and Clean Duplicates"}
        </Button>

        {results && (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Results</h3>
              <div className="space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-semibold">Duplicate Issues Deleted:</span> {results.duplicateIssues.length}
                </p>
                <p>
                  <span className="font-semibold">Duplicate Items Removed:</span> {results.duplicateItems.length}
                </p>
                <p>
                  <span className="font-semibold">Rolls Restored to Store:</span> {results.fixedRolls.length}
                </p>
                {results.duplicateIssues.length > 0 && results.errors.length === 0 && (
                  <p className="mt-2 text-green-700 font-medium">Cleanup applied. Run again to confirm no duplicates remain.</p>
                )}
                {results.errors.length > 0 && (
                  <div className="mt-4">
                    <p className="font-semibold text-red-700">Errors (some deletes may not have been applied):</p>
                    <ul className="mt-1 list-disc list-inside space-y-1 text-red-600">
                      {results.errors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm text-slate-600">
                      Run the migration <code className="rounded bg-slate-200 px-1">migrations/add_rls_policies_finished_fabric_store_issues.sql</code> in
                      Supabase (Dashboard → SQL Editor) for your project so deletes can persist.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {results.duplicateIssues.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-amber-900">Deleted Duplicate Issues</h3>
                <div className="space-y-1 text-xs text-amber-800">
                  {results.duplicateIssues.map((issue: any) => (
                    <p key={issue.id}>
                      Issue #{issue.issue_no} (Order: {issue.order_id?.slice(0, 8)}...) - Deleted
                    </p>
                  ))}
                </div>
              </div>
            )}

            {results.fixedRolls.length > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-green-900">Rolls Restored to Store</h3>
                <div className="space-y-1 text-xs text-green-800">
                  {results.fixedRolls.map((roll: any) => (
                    <p key={roll.id}>
                      Roll {roll.roll_no || roll.id.slice(0, 8)} - Restored to IN_STORE
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
