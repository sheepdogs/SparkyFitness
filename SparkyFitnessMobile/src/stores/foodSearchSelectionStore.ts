import { create } from 'zustand';
import type { FoodItem } from '../types/foods';
import { multiAddKeyForFood } from '../utils/multiAddFoodEntries';

export interface FoodDraftFields {
  /** Raw quantity text from the review row; parsed with parseDecimalInput. */
  quantityText: string;
  mealTypeId: string;
}

/**
 * A row's outcome from the last batch attempt. `confirmed_rejected` covers
 * any parsed 4xx, including an auth failure (401) — that row's own request
 * did receive a definite rejection, even though the auth failure separately
 * halts the rest of the batch. `unknown` covers timeout/network/5xx, where
 * the request may have committed; those rows are never auto-retried. A row
 * with no entry here has not been attempted yet (fresh, or a batch left it
 * unstarted after an auth halt) and is retried normally.
 */
export type RowOutcomeStatus = 'succeeded' | 'confirmed_rejected' | 'unknown';

export interface AddManyResult {
  added: number;
  /**
   * True when at least one distinct (not already-selected) food was dropped
   * because the basket hit its cap. Duplicates never set this — a smaller
   * `added` alone can mean nothing but duplicates.
   */
  truncated: boolean;
}

const DEFAULT_QUANTITY_TEXT = '1';

function dropKeys<T>(
  map: Map<string, T>,
  keys: readonly string[]
): Map<string, T> {
  if (!keys.some((key) => map.has(key))) return map;
  const next = new Map(map);
  for (const key of keys) next.delete(key);
  return next;
}

interface FoodSearchSelectionState {
  selectedByKey: Map<string, FoodItem>;
  drafts: Map<string, FoodDraftFields>;
  outcomes: Map<string, RowOutcomeStatus>;
  toggle: (
    food: FoodItem,
    maxItems: number,
    initialMealTypeId: string | undefined
  ) => boolean;
  addMany: (
    foods: FoodItem[],
    maxItems: number,
    initialMealTypeId: string | undefined
  ) => AddManyResult;
  removeKeys: (keys: readonly string[]) => void;
  clear: () => void;
  updateDraft: (key: string, patch: Partial<FoodDraftFields>) => void;
  applyMealTypeToAll: (mealTypeId: string) => void;
  setOutcomes: (entries: { key: string; status: RowOutcomeStatus }[]) => void;
}

/**
 * Multi-select food-logging basket (#1980), shared across FoodSearchScreen
 * (where items are selected) and FoodEntryMultiAddScreen (the review screen
 * pushed on top of it). A store rather than screen-local hook state: the
 * review screen edits drafts and records batch outcomes, and FoodSearchScreen
 * must see those changes when the user navigates back mid-batch (the basket
 * bar's count, an "Add anyway" retry) — a plain hook instance is private to
 * whichever screen calls it, and a route param would freeze a snapshot of it
 * at the moment of navigation rather than staying live. `get()` inside each
 * action is always the current committed state (no React-batching staleness
 * to guard against, unlike a ref shadowing useState), so capacity checks stay
 * correct across calls made in the same tick. Not persisted: this basket is
 * session-scoped like the search screen it lives on, gone on app restart.
 */
export const useFoodSearchSelectionStore = create<FoodSearchSelectionState>(
  (set, get) => ({
    selectedByKey: new Map(),
    drafts: new Map(),
    outcomes: new Map(),

    toggle: (food, maxItems, initialMealTypeId) => {
      const { selectedByKey, drafts, outcomes } = get();
      const key = multiAddKeyForFood(food);
      if (selectedByKey.has(key)) {
        const nextSelected = new Map(selectedByKey);
        nextSelected.delete(key);
        set({
          selectedByKey: nextSelected,
          drafts: dropKeys(drafts, [key]),
          outcomes: dropKeys(outcomes, [key]),
        });
        return true;
      }
      if (selectedByKey.size >= maxItems) return false;
      const nextSelected = new Map(selectedByKey);
      nextSelected.set(key, food);
      const nextDrafts = new Map(drafts);
      nextDrafts.set(key, {
        quantityText: DEFAULT_QUANTITY_TEXT,
        mealTypeId: initialMealTypeId ?? '',
      });
      set({ selectedByKey: nextSelected, drafts: nextDrafts });
      return true;
    },

    addMany: (foods, maxItems, initialMealTypeId) => {
      const { selectedByKey, drafts } = get();
      const nextSelected = new Map(selectedByKey);
      const nextDrafts = new Map(drafts);
      let added = 0;
      let truncated = false;
      for (const food of foods) {
        const key = multiAddKeyForFood(food);
        if (nextSelected.has(key)) continue;
        if (nextSelected.size >= maxItems) {
          truncated = true;
          break;
        }
        nextSelected.set(key, food);
        nextDrafts.set(key, {
          quantityText: DEFAULT_QUANTITY_TEXT,
          mealTypeId: initialMealTypeId ?? '',
        });
        added++;
      }
      if (added === 0) return { added: 0, truncated };
      set({ selectedByKey: nextSelected, drafts: nextDrafts });
      return { added, truncated };
    },

    removeKeys: (keys) => {
      if (keys.length === 0) return;
      const { selectedByKey, drafts, outcomes } = get();
      if (!keys.some((key) => selectedByKey.has(key))) return;
      set({
        selectedByKey: dropKeys(selectedByKey, keys),
        drafts: dropKeys(drafts, keys),
        outcomes: dropKeys(outcomes, keys),
      });
    },

    clear: () => {
      if (get().selectedByKey.size === 0) return;
      set({
        selectedByKey: new Map(),
        drafts: new Map(),
        outcomes: new Map(),
      });
    },

    updateDraft: (key, patch) => {
      const { drafts } = get();
      const current = drafts.get(key);
      if (!current) return;
      const next = new Map(drafts);
      next.set(key, { ...current, ...patch });
      set({ drafts: next });
    },

    applyMealTypeToAll: (mealTypeId) => {
      const { drafts } = get();
      if (drafts.size === 0) return;
      const next = new Map<string, FoodDraftFields>();
      for (const [key, draft] of drafts) {
        next.set(key, { ...draft, mealTypeId });
      }
      set({ drafts: next });
    },

    setOutcomes: (entries) => {
      if (entries.length === 0) return;
      const { selectedByKey, outcomes } = get();
      const next = new Map(outcomes);
      for (const entry of entries) {
        // A row can be removed (manually, or by a fresh toggle) while its
        // own request from an earlier batch is still in flight; dropping the
        // outcome here stops it resurfacing if the same food is re-selected
        // later, which would otherwise wrongly show a stale failure badge.
        if (!selectedByKey.has(entry.key)) continue;
        next.set(entry.key, entry.status);
      }
      set({ outcomes: next });
    },
  })
);

export function __resetFoodSearchSelectionStoreForTests(): void {
  useFoodSearchSelectionStore.setState({
    selectedByKey: new Map(),
    drafts: new Map(),
    outcomes: new Map(),
  });
}
