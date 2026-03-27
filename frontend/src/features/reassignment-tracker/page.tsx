import React, { useState, useCallback } from "react";
import { ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/page-header";
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
    <div className="flex h-full flex-col">
      {/* Page header */}
      <PageHeader
        icon={ArrowDataTransferHorizontalIcon}
        title="Reassignment Tracker"
        subtitle="Track contract reassignments across synchronizers"
      />

      {/* Scrollable content */}
      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
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
    </div>
  );
}
