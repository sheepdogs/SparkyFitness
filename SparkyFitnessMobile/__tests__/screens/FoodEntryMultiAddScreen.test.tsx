import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodEntryMultiAddScreen from '../../src/screens/FoodEntryMultiAddScreen';
import { useMealTypes } from '../../src/hooks/useMealTypes';
import { useAddFoodEntriesBatch } from '../../src/hooks/useAddFoodEntriesBatch';
import {
  useFoodSearchSelectionStore,
  __resetFoodSearchSelectionStoreForTests,
} from '../../src/stores/foodSearchSelectionStore';
import type { FoodItem } from '../../src/types/foods';
import type { BatchSubmitResult } from '../../src/hooks/useAddFoodEntriesBatch';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/hooks/useMealTypes', () => ({
  useMealTypes: jest.fn(),
}));

jest.mock('../../src/hooks/useAddFoodEntriesBatch', () => ({
  useAddFoodEntriesBatch: jest.fn(),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  // Reached via BottomSheetPicker's sheet chrome when the meal-type picker
  // renders; matches the FoodSearchScreen test's mock.
  useUniwind: () => ({ theme: 'light' }),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name, accessibilityLabel }: any) => (
      <View testID={`icon-${name}`} accessibilityLabel={accessibilityLabel} />
    ),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // FooterSaveBar's busy label uses i18next's shorthand form (a plain
    // string as the second argument, e.g. t('common.saving', 'Saving…')),
    // not the {defaultValue} object every call in this screen uses — handle
    // both, matching real i18next's own behavior.
    t: (
      key: string,
      optionsOrDefault?:
        string | { defaultValue?: string; [name: string]: unknown }
    ) => {
      if (typeof optionsOrDefault === 'string') return optionsOrDefault;
      const template = optionsOrDefault?.defaultValue ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (match: string, name: string) =>
        String(optionsOrDefault?.[name] ?? match)
      );
    },
    i18n: { resolvedLanguage: 'en-US', language: 'en-US' },
  }),
}));

const mockMealTypes = useMealTypes as jest.MockedFunction<typeof useMealTypes>;
const mockUseAddFoodEntriesBatch =
  useAddFoodEntriesBatch as jest.MockedFunction<typeof useAddFoodEntriesBatch>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function makeFood(id: string, overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id,
    name: `Food ${id}`,
    brand: `Brand ${id}`,
    is_custom: false,
    default_variant: {
      id: `variant-${id}`,
      serving_size: 100,
      serving_unit: 'g',
      calories: 50,
      protein: 2,
      carbs: 8,
      fat: 1,
    },
    ...overrides,
  } as FoodItem;
}

function seedBasket(foods: FoodItem[], mealTypeId = 'meal-1') {
  const { toggle } = useFoodSearchSelectionStore.getState();
  for (const food of foods) {
    toggle(food, 50, mealTypeId);
  }
}

function keyFor(id: string) {
  return `${id}:variant-${id}`;
}

const beforeRemoveHandlers: ((event: {
  preventDefault: () => void;
}) => void)[] = [];

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
  setOptions: jest.fn(),
  addListener: (
    event: string,
    handler: (e: { preventDefault: () => void }) => void
  ) => {
    if (event === 'beforeRemove') beforeRemoveHandlers.push(handler);
    return () => {};
  },
} as any;

function renderScreen(routeParams: Record<string, unknown> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <FoodEntryMultiAddScreen
        navigation={navigation}
        route={{
          key: 'multi-add',
          name: 'FoodEntryMultiAdd',
          params: { date: '2026-09-16', mealTypeId: 'meal-1', ...routeParams },
        }}
      />
    </SafeAreaProvider>
  );
}

describe('FoodEntryMultiAddScreen', () => {
  let submitBatch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetFoodSearchSelectionStoreForTests();
    mockMealTypes.mockReturnValue({
      mealTypes: [
        { id: 'meal-1', name: 'Breakfast', is_visible: true, sort_order: 1 },
        { id: 'meal-2', name: 'Dinner', is_visible: true, sort_order: 2 },
      ] as never,
      defaultMealTypeId: 'meal-1',
      isLoading: false,
      isError: false,
    } as never);
    submitBatch = jest.fn();
    mockUseAddFoodEntriesBatch.mockReturnValue({
      submitBatch,
      isSubmitting: false,
    });
  });

  afterEach(() => {});

  test('shows an empty state when nothing is selected', () => {
    const screen = renderScreen();
    expect(screen.getByText('No foods selected')).toBeTruthy();
  });

  test('renders each basket row with its name, brand, and default one-serving quantity', () => {
    seedBasket([makeFood('f0'), makeFood('f1')]);
    const screen = renderScreen();

    expect(screen.getByText('Food f0')).toBeTruthy();
    expect(screen.getByText('Brand f0')).toBeTruthy();
    expect(screen.getByText('Food f1')).toBeTruthy();
    // Both rows default to one serving (quantityText '1').
    expect(screen.getAllByDisplayValue('100')).toHaveLength(2);
  });

  test('removing a row drops it from the screen and the shared basket', () => {
    seedBasket([makeFood('f0'), makeFood('f1')]);
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Remove Food f0'));

    expect(screen.queryByText('Food f0')).toBeNull();
    expect(screen.getByText('Food f1')).toBeTruthy();
    expect(
      useFoodSearchSelectionStore.getState().selectedByKey.has(keyFor('f0'))
    ).toBe(false);
  });

  test('Add all is disabled once the only row has an invalid quantity', () => {
    seedBasket([makeFood('f0')]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByDisplayValue('100'), '0');

    expect(
      screen.getByText('Enter a quantity greater than zero.')
    ).toBeTruthy();
    // Still labeled for the one row (count reflects the basket, not
    // validity), but the button itself is disabled.
    expect(
      screen.getByRole('button', { name: 'Add all (1)' }).props
        .accessibilityState
    ).toMatchObject({ disabled: true });
  });

  test('Add all carries an accessible busy label, stays disabled while submitting, and hardware back is blocked', () => {
    seedBasket([makeFood('f0')]);
    mockUseAddFoodEntriesBatch.mockReturnValue({
      submitBatch,
      isSubmitting: true,
    });
    beforeRemoveHandlers.length = 0;
    const screen = renderScreen();

    // FooterSaveBar's Button swaps its label for a spinner while busy, but
    // the action now carries an explicit accessible name; it must stay
    // disabled for the whole submission, and the screen must refuse removal
    // (hardware back / gestures) mid-flight.
    const busyButton = screen.getByRole('button', { name: 'Saving…' });
    expect(busyButton.props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.queryByText('Add all (1)')).toBeNull();

    expect(beforeRemoveHandlers.length).toBeGreaterThan(0);
    const preventDefault = jest.fn();
    beforeRemoveHandlers.forEach((handler) => handler({ preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
  });

  test('Add all submits every row as a draft, removes successes, and pops to top once the basket is empty', async () => {
    seedBasket([makeFood('f0')]);
    const result: BatchSubmitResult = {
      succeededKeys: [keyFor('f0')],
      outcomes: [],
      invalidKeys: [],
      authHalted: false,
    };
    submitBatch.mockResolvedValue(result);
    const screen = renderScreen({ date: '2026-09-16', mealTypeId: 'meal-1' });

    fireEvent.press(screen.getByText('Add all (1)'));

    await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
    expect(submitBatch).toHaveBeenCalledWith([
      {
        food: expect.objectContaining({ id: 'f0' }),
        quantityText: '100',
        mealTypeId: 'meal-1',
        entryDate: '2026-09-16',
      },
    ]);
    expect(
      useFoodSearchSelectionStore.getState().selectedByKey.has(keyFor('f0'))
    ).toBe(false);
  });

  test('a partial failure keeps the review open, shows the unknown-outcome banner, and excludes that row from a plain retry', async () => {
    seedBasket([makeFood('f0'), makeFood('f1')]);
    submitBatch.mockResolvedValueOnce({
      succeededKeys: [keyFor('f1')],
      outcomes: [{ key: keyFor('f0'), status: 'unknown' }],
      invalidKeys: [],
      authHalted: false,
    } satisfies BatchSubmitResult);
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Add all (2)'));

    // f1 succeeded and is gone; f0 remains with its unknown outcome surfaced.
    await waitFor(() => expect(screen.queryByText('Food f1')).toBeNull());
    expect(screen.getByText('Food f0')).toBeTruthy();
    expect(
      screen.getByText(
        "Some items couldn't be added and may already be in your diary"
      )
    ).toBeTruthy();
    expect(navigation.dispatch).not.toHaveBeenCalled();

    // f0 is the only row left and it is excluded from a plain retry: the
    // count reads zero and the button is disabled, so it cannot resubmit f0
    // blindly.
    expect(
      screen.getByRole('button', { name: 'Add all (0)' }).props
        .accessibilityState
    ).toMatchObject({ disabled: true });

    // "Add anyway" resubmits just that row and, once it succeeds, the basket
    // is empty and the screen pops.
    submitBatch.mockResolvedValueOnce({
      succeededKeys: [keyFor('f0')],
      outcomes: [],
      invalidKeys: [],
      authHalted: false,
    } satisfies BatchSubmitResult);
    fireEvent.press(screen.getByText('Add anyway'));

    await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
    expect(submitBatch).toHaveBeenLastCalledWith([
      expect.objectContaining({
        food: expect.objectContaining({ id: 'f0' }),
      }),
    ]);
  });

  test('a confirmed-rejected row shows an inline error and stays included in a plain retry', async () => {
    seedBasket([makeFood('f0')]);
    submitBatch.mockResolvedValueOnce({
      succeededKeys: [],
      outcomes: [{ key: keyFor('f0'), status: 'confirmed_rejected' }],
      invalidKeys: [],
      authHalted: false,
    } satisfies BatchSubmitResult);
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Add all (1)'));

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't add this item. Check it and try again.")
      ).toBeTruthy()
    );
    // Still included (not excluded like an unknown outcome): the button
    // reflects one retryable row, not zero.
    expect(screen.getByText('Add all (1)')).toBeTruthy();
  });
});
