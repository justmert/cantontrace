import { create } from "zustand";
import type { EventStreamFilter, LedgerUpdate } from "@/lib/types";

const MAX_EVENTS = 1000;

interface EventStreamState {
  events: LedgerUpdate[];
  isStreaming: boolean;
  filter: EventStreamFilter;
  lastOffset: string | null;
  addEvent: (event: LedgerUpdate) => void;
  setFilter: (filter: Partial<EventStreamFilter>) => void;
  startStream: () => void;
  stopStream: () => void;
  clearEvents: () => void;
}

export const useEventStreamStore = create<EventStreamState>((set) => ({
  events: [],
  isStreaming: false,
  filter: {},
  lastOffset: null,

  addEvent: (event: LedgerUpdate) =>
    set((state) => {
      const newEvents = [event, ...state.events].slice(0, MAX_EVENTS);
      return {
        events: newEvents,
        lastOffset: event.offset,
      };
    }),

  setFilter: (filter: Partial<EventStreamFilter>) =>
    set((state) => ({
      filter: { ...state.filter, ...filter },
    })),

  startStream: () => set({ isStreaming: true }),

  stopStream: () => set({ isStreaming: false }),

  clearEvents: () => set({ events: [], lastOffset: null }),
}));
