import { useCallback, useMemo, useState } from 'react';
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
export function useFoodSearchSelection(maxItems: number = MULTI_ADD_MAX_ITEMS) {
  const [selectedByKey, setSelectedByKey] = useState<Map<string, FoodItem>>(
    () => new Map()
  );

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
   * add was rejected because the basket is at capacity. Decided against
   * current state rather than inside the state updater — React defers
   * updater execution to render, so an updater side-channel cannot report
   * the outcome synchronously.
   */
  const toggle = useCallback(
    (food: FoodItem): boolean => {
      const key = multiAddKeyForFood(food);
      if (selectedByKey.has(key)) {
        setSelectedByKey((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        return true;
      }
      if (selectedByKey.size >= maxItems) {
        return false;
      }
      setSelectedByKey((prev) => {
        if (prev.has(key) || prev.size >= maxItems) return prev;
        const next = new Map(prev);
        next.set(key, food);
        return next;
      });
      return true;
    },
    [maxItems, selectedByKey]
  );

  /**
   * Adds many foods (select-all). Deduplicates against the basket and stops
   * at the cap. Returns how many foods were actually added so the caller can
   * report a truncated selection.
   */
  const addMany = useCallback(
    (foods: FoodItem[]): number => {
      const keys = new Set(selectedByKey.keys());
      const additions = new Map<string, FoodItem>();
      for (const food of foods) {
        if (selectedByKey.size + additions.size >= maxItems) break;
        const key = multiAddKeyForFood(food);
        if (keys.has(key)) continue;
        keys.add(key);
        additions.set(key, food);
      }
      if (additions.size === 0) return 0;
      setSelectedByKey((prev) => {
        const next = new Map(prev);
        for (const [key, food] of additions) {
          next.set(key, food);
        }
        return next;
      });
      return additions.size;
    },
    [maxItems, selectedByKey]
  );

  /** Removes basket rows by key, e.g. confirmed successes after a batch. */
  const removeKeys = useCallback((keys: readonly string[]) => {
    if (keys.length === 0) return;
    setSelectedByKey((prev) => {
      const next = new Map(prev);
      for (const key of keys) {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedByKey((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

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
