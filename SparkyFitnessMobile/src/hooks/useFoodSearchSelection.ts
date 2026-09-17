import { useCallback, useMemo, useRef, useState } from 'react';
import type { FoodItem } from '../types/foods';
import {
  MULTI_ADD_MAX_ITEMS,
  multiAddKeyForFood,
} from '../utils/multiAddFoodEntries';

/**
 * Basket state for multi-select food logging on the food search screen.
 *
 * The basket is keyed by multiAddKeyForFood so the same food appearing in
 * several landing sections (Recently Logged / Top / Favorites) collapses to
 * one row, while different variants stay distinct. Enforces a hard item cap;
 * callers decide how to surface a rejected add (e.g. a toast) using the
 * returned counts so this hook stays free of presentation concerns.
 */
export interface AddManyResult {
  added: number;
  /**
   * True when at least one distinct (not already-selected) food was dropped
   * because the basket hit its cap. Duplicates never set this — a smaller
   * `added` alone can mean nothing but duplicates.
   */
  truncated: boolean;
}

export function useFoodSearchSelection(maxItems: number = MULTI_ADD_MAX_ITEMS) {
  // The ref is the synchronous source of truth; the state is only its
  // render-time projection. Capacity decisions must hold across several
  // calls inside one React batch, where a state closure is stale — the same
  // stale-state-under-batched-updates shape utils/duplicatePress.ts guards
  // against (#2191). Every mutation updates the ref first, then publishes an
  // immutable copy to state.
  const basketRef = useRef<Map<string, FoodItem>>(new Map());
  const [selectedByKey, setSelectedByKey] = useState<Map<string, FoodItem>>(
    () => new Map()
  );

  const commit = useCallback((next: Map<string, FoodItem>) => {
    basketRef.current = next;
    setSelectedByKey(next);
  }, []);

  const selectedFoods = useMemo(
    () => Array.from(selectedByKey.values()),
    [selectedByKey]
  );

  const count = selectedByKey.size;
  const isAtCapacity = count >= maxItems;

  const isSelected = useCallback(
    (food: FoodItem) => selectedByKey.has(multiAddKeyForFood(food)),
    [selectedByKey]
  );

  /**
   * Toggles one food. Returns true when the basket changed; false when the
   * add was rejected because the basket is at capacity. The outcome is
   * accurate even when several toggles run inside one React batch.
   */
  const toggle = useCallback(
    (food: FoodItem): boolean => {
      const current = basketRef.current;
      const key = multiAddKeyForFood(food);
      if (current.has(key)) {
        const next = new Map(current);
        next.delete(key);
        commit(next);
        return true;
      }
      if (current.size >= maxItems) {
        return false;
      }
      const next = new Map(current);
      next.set(key, food);
      commit(next);
      return true;
    },
    [commit, maxItems]
  );

  /**
   * Adds many foods (select-all). Deduplicates against the basket and stops
   * at the cap. Returns what actually happened — computed against the live
   * basket ref, so back-to-back calls inside one React batch still report
   * truncation correctly.
   */
  const addMany = useCallback(
    (foods: FoodItem[]): AddManyResult => {
      const next = new Map(basketRef.current);
      let added = 0;
      let truncated = false;
      for (const food of foods) {
        const key = multiAddKeyForFood(food);
        if (next.has(key)) continue;
        if (next.size >= maxItems) {
          truncated = true;
          break;
        }
        next.set(key, food);
        added++;
      }
      if (added === 0) return { added: 0, truncated };
      commit(next);
      return { added, truncated };
    },
    [commit, maxItems]
  );

  /** Removes basket rows by key, e.g. confirmed successes after a batch. */
  const removeKeys = useCallback(
    (keys: readonly string[]) => {
      if (keys.length === 0) return;
      const current = basketRef.current;
      if (!keys.some((key) => current.has(key))) return;
      const next = new Map(current);
      for (const key of keys) {
        next.delete(key);
      }
      commit(next);
    },
    [commit]
  );

  const clear = useCallback(() => {
    if (basketRef.current.size === 0) return;
    commit(new Map());
  }, [commit]);

  return {
    selectedFoods,
    count,
    isAtCapacity,
    maxItems,
    isSelected,
    toggle,
    addMany,
    removeKeys,
    clear,
  };
}

export type FoodSearchSelection = ReturnType<typeof useFoodSearchSelection>;
