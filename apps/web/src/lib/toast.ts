import { useSyncExternalStore } from "react";

/** Tiny global toast store (D2-I4-01). `<Toaster />` renders it; anything may call `toast()`. */
export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: "error" | "default";
}

const MAX_VISIBLE = 3;
let items: readonly ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: Omit<ToastItem, "id" | "tone"> & { tone?: ToastItem["tone"] }): void {
  // The same failure from several queries at once shows once.
  if (items.some((i) => i.title === t.title && i.description === t.description)) return;
  const item: ToastItem = {
    id: ++seq,
    title: t.title,
    description: t.description,
    tone: t.tone ?? "default",
  };
  items = [...items, item].slice(-MAX_VISIBLE);
  emit();
}

export function dismissToast(id: number): void {
  items = items.filter((i) => i.id !== id);
  emit();
}

const EMPTY: readonly ToastItem[] = [];
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getToasts = (): readonly ToastItem[] => items;

export function useToasts(): readonly ToastItem[] {
  return useSyncExternalStore(subscribe, getToasts, () => EMPTY);
}

/** Test helper. */
export function resetToasts(): void {
  items = [];
  emit();
}
