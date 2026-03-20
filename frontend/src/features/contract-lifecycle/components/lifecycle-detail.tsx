// ---------------------------------------------------------------------------
// This module is kept as a thin re-export so existing imports don't break.
// All detail rendering is now inline in lifecycle-timeline.tsx.
// ---------------------------------------------------------------------------

export type SelectedEvent =
  | { type: "creation" }
  | { type: "exercise"; index: number }
  | { type: "archival" };
