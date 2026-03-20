import React, { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons";
import { ReassignmentList } from "./components/reassignment-list";
import { ReassignmentDetail } from "./components/reassignment-detail";
import { useReassignments, type ReassignmentFilter } from "./hooks";
import type { Reassignment } from "@/lib/types";

// ---------------------------------------------------------------------------
// Reassignment Tracker Page
// ---------------------------------------------------------------------------

export default function ReassignmentTrackerPage() {
  const [filter, setFilter] = useState<ReassignmentFilter>({});
  const [selectedReassignment, setSelectedReassignment] =
    useState<Reassignment | null>(null);

  const {
    data: reassignments,
    isLoading,
    error,
  } = useReassignments(filter);

  const handleSelect = useCallback((reassignment: Reassignment) => {
    setSelectedReassignment(reassignment);
  }, []);

  const handleFilterChange = useCallback((newFilter: ReassignmentFilter) => {
    setFilter(newFilter);
  }, []);

  // Keep selection in sync with refreshed data
  const selectedId = selectedReassignment?.reassignmentId ?? null;
  React.useEffect(() => {
    if (selectedId && reassignments) {
      const updated = reassignments.find(
        (r) => r.reassignmentId === selectedId
      );
      if (updated) {
        setSelectedReassignment(updated);
      }
    }
  }, [reassignments, selectedId]);

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
          <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Reassignment Tracker
          </h1>
          <p className="text-sm text-muted-foreground">
            Track contract reassignments across synchronizers
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Failed to load reassignments</p>
          <p className="mt-1 text-xs">
            {error instanceof Error
              ? error.message
              : "An unexpected error occurred"}
          </p>
        </div>
      )}

      {/* Reassignment list with filters */}
      <ReassignmentList
        reassignments={reassignments}
        isLoading={isLoading}
        filter={filter}
        onFilterChange={handleFilterChange}
        selectedReassignmentId={selectedReassignment?.reassignmentId ?? null}
        onSelect={handleSelect}
      />

      {/* Detail panel */}
      {selectedReassignment && (
        <ReassignmentDetail reassignment={selectedReassignment} />
      )}
    </div>
  );
}
