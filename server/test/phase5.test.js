import { describe, expect, it } from 'vitest';
import { baselineForecast, calculateMetrics, fallbackPrediction, getExpectedCustomerCount, quantile, roundUpToBatch } from '../src/analytics/forecastRoutes.js';

describe('tomorrow plan calculations', () => {
  it('rounds recommendations up to the configured batch size', () => {
    expect(roundUpToBatch(81, 10)).toBe(90);
    expect(roundUpToBatch(80, 10)).toBe(80);
    expect(roundUpToBatch(0, 10)).toBe(0);
  });

  it('uses only prior uncensored demand for a baseline and excludes plate waste by construction', () => {
    const history = [
      { date: '2025-07-04', prepared: 100, unservedLeftover: 10, soldOut: false },
      { date: '2025-07-11', prepared: 90, unservedLeftover: 20, soldOut: false },
      { date: '2025-07-18', prepared: 120, unservedLeftover: 0, soldOut: true },
      { date: '2025-07-25', prepared: 500, unservedLeftover: 0, soldOut: false }
    ];
    expect(baselineForecast(history, '2025-07-18')).toMatchObject({ center: 70, method: 'last_same_weekday' });
    expect(baselineForecast(history, '2025-07-18').p90).toBe(88);
  });

  it('keeps cold-start plans manual and labels confidence none', () => {
    const result = fallbackPrediction([], { center: null, p80: null, p90: null, method: 'no_history' }, null, 0);
    expect(result).toMatchObject({ p50: null, confidence: 'none', method: 'manual_estimate' });
  });

  it('uses only earlier attendance for the expected customer feature', () => {
    const history = [
      { date: '2025-07-04', meal: 'lunch', count: 100 },
      { date: '2025-07-11', meal: 'lunch', count: 120 },
      { date: '2025-07-18', meal: 'lunch', count: 999 }
    ];
    expect(getExpectedCustomerCount(history, '2025-07-18', 'lunch')).toBe(110);
    expect(getExpectedCustomerCount(history, '2025-07-18', 'dinner')).toBeNull();
  });

  it('calculates demand error and baseline quantiles', () => {
    const scored = [{ predicted: 12, actual: 10 }, { predicted: 9, actual: 10 }];
    expect(calculateMetrics(scored)).toMatchObject({ count: 2, mae: 1.5, wape: 0.15, bias: 0.5 });
    expect(quantile([10, 20], 0.8)).toBe(18);
  });
});
