"use client";

import { useSyncExternalStore } from "react";
import { SEED_ISSUES, formatIssueNumber, resolveQuip, setStatus, type Issue, type Status } from "./issues";
import { launchBug, prefersReducedMotion } from "./bug-flight";

/**
 * The prototype's one shared store: the issues, which rows are mid-celebration,
 * and the latest announcement. Kept in sessionStorage so the list and the issue
 * page agree across navigation and reloads, and so nothing leaks between people.
 */

/** flying: the bug is on its way out; leaving: the row folds away (when it no longer fits the tab). */
export type CelebrationPhase = "flying" | "leaving";

export type Announcement = { id: number; text: string; undo: { number: number; status: Status } | null };

type State = {
  issues: Issue[];
  celebrating: ReadonlyMap<number, CelebrationPhase>;
  announcement: Announcement | null;
};

const KEY = "ziki-proposals:issues";
const FLIGHT_MS = 2000;
const LEAVE_MS = 380;

const initial: State = { issues: SEED_ISSUES, celebrating: new Map(), announcement: null };
let state: State = initial;
let loaded = false;
let announcementId = 0;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) state = { ...state, issues: JSON.parse(raw) as Issue[] };
  } catch {
    // Private windows and blocked storage: start from the seed data.
  }
}

function save() {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state.issues));
  } catch {
    // Not fatal: the change still shows for this page view.
  }
}

function emit(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): State {
  load();
  return state;
}

function getServerSnapshot(): State {
  return initial;
}

export function useIssuesStore(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function setPhase(number: number, phase: CelebrationPhase | null) {
  const celebrating = new Map(state.celebrating);
  if (phase) celebrating.set(number, phase);
  else celebrating.delete(number);
  emit({ ...state, celebrating });
}

/**
 * Where the bug takes off: among the elements marked for this issue, the one
 * on screen with the lowest data-bug-priority (the Status chip beats the
 * title on the issue page; on a phone the title wins while the Status box is
 * scrolled out of view).
 */
function originFor(number: number): DOMRect | null {
  const nodes = [...document.querySelectorAll<HTMLElement>(`[data-bug-origin="${number}"]`)];
  const visible = nodes
    .map((node) => ({ rect: node.getBoundingClientRect(), priority: Number(node.dataset.bugPriority ?? 1) }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.priority - b.priority);
  const onScreen = visible.find(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight);
  return (onScreen ?? visible[0])?.rect ?? null;
}

/**
 * Changes an issue's status, from a person or an agent. Going to resolved
 * sets the bug free: it grows wings and flutters off, and the row settles.
 */
export function changeStatus(number: number, status: Status, by: string = "You") {
  load();
  const before = state.issues.find((issue) => issue.number === number);
  const result = setStatus(state.issues, number, status, by);
  if (result.issues === state.issues || !before) return;
  emit({ ...state, issues: result.issues });
  save();

  if (!result.celebrate) return;
  const reduced = prefersReducedMotion();
  const text = `${formatIssueNumber(number)} resolved by ${by}. ${resolveQuip(number)}`;
  emit({ ...state, announcement: { id: ++announcementId, text, undo: { number, status: before.status } } });

  setPhase(number, "flying");
  const origin = originFor(number);
  if (origin && !reduced) launchBug(origin, { duration: FLIGHT_MS, seed: number });
  const settle = reduced ? 600 : FLIGHT_MS;
  window.setTimeout(() => {
    setPhase(number, "leaving");
    window.setTimeout(() => setPhase(number, null), LEAVE_MS);
  }, settle);
}

/** Give a freshly opened page a moment to lay out before reading where the bug sits. */
const REPLAY_DELAY_MS = 350;

/**
 * Replays the bug flying off for an issue that is already resolved, when its
 * page is opened or reloaded. Nothing changed, so there's no toast or Undo;
 * with reduced motion it does nothing, since the check mark already shows.
 * Returns a cancel function for effect cleanup.
 */
export function replayResolved(number: number): () => void {
  load();
  const issue = state.issues.find((item) => item.number === number);
  if (issue?.status !== "resolved" || prefersReducedMotion()) return () => {};
  let settle: number | undefined;
  const start = window.setTimeout(() => {
    setPhase(number, "flying");
    const origin = originFor(number);
    if (origin) launchBug(origin, { duration: FLIGHT_MS, seed: number });
    settle = window.setTimeout(() => {
      settle = undefined;
      setPhase(number, null);
    }, FLIGHT_MS);
  }, REPLAY_DELAY_MS);
  return () => {
    window.clearTimeout(start);
    if (settle !== undefined) {
      window.clearTimeout(settle);
      setPhase(number, null);
    }
  };
}

export function undoAnnouncement() {
  const undo = state.announcement?.undo;
  dismissAnnouncement();
  if (!undo) return;
  setPhase(undo.number, null);
  const result = setStatus(state.issues, undo.number, undo.status);
  emit({ ...state, issues: result.issues });
  save();
}

export function dismissAnnouncement() {
  if (state.announcement) emit({ ...state, announcement: null });
}

/** Back to the seed data, for demos. */
export function resetDemo() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Ignore: the in-memory reset below is what matters.
  }
  emit({ ...initial, celebrating: new Map() });
}
