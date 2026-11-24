"use client";
/**
 * Client interaction state (Zustand). Only UI state lives here — never business data.
 * - Ask Sparq panel mode (closed / open / minimized) and width.
 * - Compare tray selection (max 3), kept per browser tab in sessionStorage so it survives navigation.
 * Business data (shortlists, passport edits) goes through server actions → repositories.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const COMPARE_LIMIT = 3;

type AssistantMode = "closed" | "open" | "min";

type UiState = {
  assistant: AssistantMode;
  wide: boolean;
  compare: string[];
  openAssistant: () => void;
  closeAssistant: () => void;
  minimizeAssistant: () => void;
  toggleWide: () => void;
  toggleCompare: (personId: string) => void;
  clearCompare: () => void;
};

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      assistant: "closed",
      wide: false,
      compare: [],
      openAssistant: () => set({ assistant: "open" }),
      closeAssistant: () => set({ assistant: "closed" }),
      minimizeAssistant: () => set({ assistant: "min" }),
      toggleWide: () => set({ wide: !get().wide }),
      toggleCompare: (id) => {
        const cur = get().compare;
        if (cur.includes(id)) set({ compare: cur.filter((x) => x !== id) });
        else if (cur.length < COMPARE_LIMIT) set({ compare: [...cur, id] });
      },
      clearCompare: () => set({ compare: [] }),
    }),
    {
      name: "sparq-ui",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ compare: s.compare }),
    },
  ),
);
