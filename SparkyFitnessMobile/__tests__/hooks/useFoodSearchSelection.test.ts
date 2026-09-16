import { act, renderHook } from '@testing-library/react-native';
import { useFoodSearchSelection } from '../../src/hooks/useFoodSearchSelection';
import type { FoodItem } from '../../src/types/foods';

function makeFood(id: string, variantId?: string): FoodItem {
  return {
    id,
    name: `Food ${id}`,
    brand: null,
    is_custom: false,
    default_variant: {
      id: variantId,
      serving_size: 100,
      serving_unit: 'g',
      calories: 50,
      protein: 2,
      carbs: 8,
      fat: 1,
    },
  } as FoodItem;
}

describe('useFoodSearchSelection', () => {
  test('toggle adds then removes a food', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    const food = makeFood('f1', 'v1');

    act(() => {
      expect(result.current.toggle(food)).toBe(true);
    });
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected(food)).toBe(true);
    expect(result.current.selectedFoods).toEqual([food]);

    act(() => {
      expect(result.current.toggle(food)).toBe(true);
    });
    expect(result.current.count).toBe(0);
    expect(result.current.isSelected(food)).toBe(false);
  });

  test('the same food from different sections collapses to one row', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    const recent = makeFood('f1', 'v1');
    const favorite = makeFood('f1', 'v1');

    act(() => {
      result.current.toggle(recent);
    });
    act(() => {
      result.current.toggle(favorite);
    });

    // Second toggle of the same key removes it; it can never double-add.
    expect(result.current.count).toBe(0);
  });

  test('different variants of one food stay distinct', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    const grams = makeFood('f1', 'v1');
    const ounces = makeFood('f1', 'v2');

    act(() => {
      result.current.toggle(grams);
      result.current.toggle(ounces);
    });

    expect(result.current.count).toBe(2);
  });

  test('toggle rejects adds once the cap is reached', () => {
    const { result } = renderHook(() => useFoodSearchSelection(2));

    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
      result.current.toggle(makeFood('f2', 'v1'));
    });
    expect(result.current.isAtCapacity).toBe(true);

    let changed = false;
    act(() => {
      changed = result.current.toggle(makeFood('f3', 'v1'));
    });
    expect(changed).toBe(false);
    expect(result.current.count).toBe(2);
  });

  test('addMany deduplicates and truncates at the cap, reporting additions', () => {
    const { result } = renderHook(() => useFoodSearchSelection(3));

    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
    });

    let added = 0;
    act(() => {
      added = result.current.addMany([
        makeFood('f1', 'v1'), // duplicate of what is already selected
        makeFood('f2', 'v1'),
        makeFood('f3', 'v1'),
        makeFood('f4', 'v1'), // exceeds the cap
      ]);
    });

    expect(added).toBe(2);
    expect(result.current.count).toBe(3);
    expect(result.current.selectedFoods.map((food) => food.id)).toEqual([
      'f1',
      'f2',
      'f3',
    ]);
  });

  test('removeKeys drops submitted rows and keeps the rest of the basket', () => {
    const { result } = renderHook(() => useFoodSearchSelection());

    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
      result.current.toggle(makeFood('f2', 'v1'));
      result.current.toggle(makeFood('f3', 'v1'));
    });
    act(() => {
      result.current.removeKeys(['f1:v1', 'f3:v1']);
    });

    expect(result.current.count).toBe(1);
    expect(result.current.selectedFoods.map((food) => food.id)).toEqual(['f2']);
  });

  test('clear empties the basket', () => {
    const { result } = renderHook(() => useFoodSearchSelection());
    act(() => {
      result.current.toggle(makeFood('f1', 'v1'));
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.count).toBe(0);
  });
});
