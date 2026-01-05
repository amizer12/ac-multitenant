/**
 * Token limit validation utilities.
 * Extracted for testability.
 */

/**
 * Validate that a token limit value is a positive integer.
 * @param {string|number} value - The value to validate
 * @returns {{ valid: boolean, error: string }} Validation result
 */
export function validateTokenLimit(value) {
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: 'Token limit is required for new tenants' };
  }
  
  const strValue = String(value).trim();
  
  // Check for decimal point
  if (strValue.includes('.')) {
    return { valid: false, error: 'Token limit must be a whole number' };
  }
  
  const num = parseInt(strValue, 10);
  
  if (isNaN(num)) {
    return { valid: false, error: 'Token limit must be a positive number' };
  }
  
  if (num <= 0) {
    return { valid: false, error: 'Token limit must be a positive number' };
  }
  
  return { valid: true, error: '' };
}

/**
 * Calculate usage percentage from total tokens and limit.
 * @param {number} totalTokens - Current total tokens used
 * @param {number|null} tokenLimit - Token limit (null means no limit)
 * @returns {number|null} Percentage or null if no limit
 */
export function calculateUsagePercentage(totalTokens, tokenLimit) {
  if (tokenLimit === null || tokenLimit === undefined || tokenLimit <= 0) {
    return null;
  }
  return (totalTokens / tokenLimit) * 100;
}

/**
 * Get color indicator for usage percentage.
 * @param {number|null} percentage - Usage percentage
 * @returns {string} Color name: 'danger', 'warning', 'success', or 'default'
 */
export function getUsageColor(percentage) {
  if (percentage === null) return 'default';
  if (percentage >= 100) return 'danger';
  if (percentage >= 80) return 'warning';
  return 'success';
}
