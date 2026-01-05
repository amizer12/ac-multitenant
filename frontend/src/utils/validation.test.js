/**
 * Property-based tests for frontend validation utilities.
 * 
 * Feature: tenant-token-limits
 * Property 1: Token Limit Validation (Frontend)
 * Property 4: Usage Percentage Calculation
 * Property 5: Usage Percentage Color Coding
 * Validates: Requirements 1.4, 3.2, 3.4, 3.5
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateTokenLimit, calculateUsagePercentage, getUsageColor } from './validation.js';

describe('Token Limit Validation (Property 1)', () => {
  /**
   * Property 1: Token Limit Validation (Frontend)
   * For any positive integer, validation should return valid: true.
   * Validates: Requirements 1.4
   */
  it('should accept any positive integer', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 ** 12 }), (value) => {
        const result = validateTokenLimit(value);
        expect(result.valid).toBe(true);
        expect(result.error).toBe('');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1: Token Limit Validation (Frontend)
   * For any zero or negative integer, validation should return valid: false.
   * Validates: Requirements 1.4
   */
  it('should reject zero and negative integers', () => {
    fc.assert(
      fc.property(fc.integer({ max: 0 }), (value) => {
        const result = validateTokenLimit(value);
        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1: Token Limit Validation (Frontend)
   * For any string representation of a positive integer, validation should return valid: true.
   * Validates: Requirements 1.4
   */
  it('should accept string representations of positive integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 ** 12 }), (value) => {
        const result = validateTokenLimit(String(value));
        expect(result.valid).toBe(true);
        expect(result.error).toBe('');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1: Token Limit Validation (Frontend)
   * For any non-integer decimal, validation should return valid: false.
   * Validates: Requirements 1.4
   */
  it('should reject decimal numbers', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 10 ** 6, noNaN: true }).filter(x => !Number.isInteger(x)),
        (value) => {
          const result = validateTokenLimit(String(value));
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Edge case tests
  it('should reject null', () => {
    const result = validateTokenLimit(null);
    expect(result.valid).toBe(false);
  });

  it('should reject undefined', () => {
    const result = validateTokenLimit(undefined);
    expect(result.valid).toBe(false);
  });

  it('should reject empty string', () => {
    const result = validateTokenLimit('');
    expect(result.valid).toBe(false);
  });

  it('should accept minimum valid value (1)', () => {
    const result = validateTokenLimit(1);
    expect(result.valid).toBe(true);
  });
});

describe('Usage Percentage Calculation (Property 4)', () => {
  /**
   * Property 4: Usage Percentage Calculation
   * For any valid usage and limit, percentage should equal (usage / limit) * 100.
   * Validates: Requirements 3.2
   */
  it('should calculate percentage correctly for any valid inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 ** 9 }),
        fc.integer({ min: 1, max: 10 ** 9 }),
        (totalTokens, tokenLimit) => {
          const result = calculateUsagePercentage(totalTokens, tokenLimit);
          const expected = (totalTokens / tokenLimit) * 100;
          expect(result).toBeCloseTo(expected, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: Usage Percentage Calculation
   * When limit is null/undefined/0, should return null.
   * Validates: Requirements 3.3
   */
  it('should return null when no limit is set', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 ** 9 }), (totalTokens) => {
        expect(calculateUsagePercentage(totalTokens, null)).toBe(null);
        expect(calculateUsagePercentage(totalTokens, undefined)).toBe(null);
        expect(calculateUsagePercentage(totalTokens, 0)).toBe(null);
      }),
      { numRuns: 100 }
    );
  });

  // Edge cases
  it('should return 0% when usage is 0', () => {
    expect(calculateUsagePercentage(0, 1000)).toBe(0);
  });

  it('should return 100% when usage equals limit', () => {
    expect(calculateUsagePercentage(1000, 1000)).toBe(100);
  });

  it('should return >100% when usage exceeds limit', () => {
    expect(calculateUsagePercentage(1500, 1000)).toBe(150);
  });
});

describe('Usage Percentage Color Coding (Property 5)', () => {
  /**
   * Property 5: Usage Percentage Color Coding
   * For any percentage < 80, should return 'success'.
   * Validates: Requirements 3.4, 3.5
   */
  it('should return success for percentages below 80', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 79.99, noNaN: true }), (percentage) => {
        expect(getUsageColor(percentage)).toBe('success');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Usage Percentage Color Coding
   * For any percentage >= 80 and < 100, should return 'warning'.
   * Validates: Requirements 3.4
   */
  it('should return warning for percentages between 80 and 99.99', () => {
    fc.assert(
      fc.property(fc.double({ min: 80, max: 99.99, noNaN: true }), (percentage) => {
        expect(getUsageColor(percentage)).toBe('warning');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Usage Percentage Color Coding
   * For any percentage >= 100, should return 'danger'.
   * Validates: Requirements 3.5
   */
  it('should return danger for percentages at or above 100', () => {
    fc.assert(
      fc.property(fc.double({ min: 100, max: 1000, noNaN: true }), (percentage) => {
        expect(getUsageColor(percentage)).toBe('danger');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Usage Percentage Color Coding
   * For null percentage, should return 'default'.
   * Validates: Requirements 3.3
   */
  it('should return default for null percentage', () => {
    expect(getUsageColor(null)).toBe('default');
  });

  // Boundary tests
  it('should return success at 79.9%', () => {
    expect(getUsageColor(79.9)).toBe('success');
  });

  it('should return warning at exactly 80%', () => {
    expect(getUsageColor(80)).toBe('warning');
  });

  it('should return warning at 99.9%', () => {
    expect(getUsageColor(99.9)).toBe('warning');
  });

  it('should return danger at exactly 100%', () => {
    expect(getUsageColor(100)).toBe('danger');
  });
});
