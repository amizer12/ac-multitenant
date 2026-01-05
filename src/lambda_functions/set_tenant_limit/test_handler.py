"""
Property-based tests for set_tenant_limit Lambda function.

Feature: tenant-token-limits, Property 2: Token Limit Validation (Backend)
Validates: Requirements 6.4
"""
import pytest
from hypothesis import given, strategies as st, settings

# Import the validation function from the handler
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from handler import validate_token_limit


class TestTokenLimitValidation:
    """Property-based tests for token limit validation."""
    
    @given(st.integers(min_value=1, max_value=10**12))
    @settings(max_examples=100)
    def test_positive_integers_are_valid(self, value):
        """
        Property 2: Token Limit Validation (Backend)
        For any positive integer, validation should return True.
        Validates: Requirements 6.4
        """
        is_valid, error = validate_token_limit(value)
        assert is_valid is True, f"Expected {value} to be valid, got error: {error}"
        assert error is None
    
    @given(st.integers(max_value=0))
    @settings(max_examples=100)
    def test_zero_and_negative_integers_are_invalid(self, value):
        """
        Property 2: Token Limit Validation (Backend)
        For any integer <= 0, validation should return False.
        Validates: Requirements 6.4
        """
        is_valid, error = validate_token_limit(value)
        assert is_valid is False, f"Expected {value} to be invalid"
        assert error is not None
    
    @given(st.floats(allow_nan=False, allow_infinity=False).filter(lambda x: not float(x).is_integer()))
    @settings(max_examples=100)
    def test_non_integer_floats_are_invalid(self, value):
        """
        Property 2: Token Limit Validation (Backend)
        For any non-integer float, validation should return False.
        Validates: Requirements 6.4
        """
        is_valid, error = validate_token_limit(value)
        assert is_valid is False, f"Expected {value} to be invalid"
        assert error is not None
    
    @given(st.text())
    @settings(max_examples=100)
    def test_strings_are_invalid(self, value):
        """
        Property 2: Token Limit Validation (Backend)
        For any string that's not a valid positive integer, validation should return False.
        Validates: Requirements 6.4
        """
        # Skip strings that represent valid positive integers
        try:
            int_val = int(value)
            if int_val > 0:
                return  # Skip valid integer strings
        except (ValueError, TypeError):
            pass
        
        is_valid, error = validate_token_limit(value)
        assert is_valid is False, f"Expected '{value}' to be invalid"
        assert error is not None
    
    @given(st.none())
    @settings(max_examples=1)
    def test_none_is_invalid(self, value):
        """
        Property 2: Token Limit Validation (Backend)
        None should be invalid.
        Validates: Requirements 6.4
        """
        is_valid, error = validate_token_limit(value)
        assert is_valid is False
        assert error is not None
    
    @given(st.booleans())
    @settings(max_examples=2)
    def test_booleans_are_invalid(self, value):
        """
        Property 2: Token Limit Validation (Backend)
        Booleans should be invalid (even though True == 1 in Python).
        Validates: Requirements 6.4
        """
        is_valid, error = validate_token_limit(value)
        assert is_valid is False
        assert error is not None


# Unit tests for specific edge cases
class TestTokenLimitValidationEdgeCases:
    """Unit tests for specific edge cases."""
    
    def test_valid_small_limit(self):
        """Smallest valid limit is 1."""
        is_valid, error = validate_token_limit(1)
        assert is_valid is True
        assert error is None
    
    def test_valid_large_limit(self):
        """Large limits should be valid."""
        is_valid, error = validate_token_limit(1_000_000_000)
        assert is_valid is True
        assert error is None
    
    def test_zero_is_invalid(self):
        """Zero is not a valid limit."""
        is_valid, error = validate_token_limit(0)
        assert is_valid is False
        assert "greater than zero" in error.lower()
    
    def test_negative_is_invalid(self):
        """Negative numbers are not valid."""
        is_valid, error = validate_token_limit(-100)
        assert is_valid is False
    
    def test_float_with_decimal_is_invalid(self):
        """Floats with decimal parts are invalid."""
        is_valid, error = validate_token_limit(100.5)
        assert is_valid is False
        assert "decimal" in error.lower() or "integer" in error.lower()
    
    def test_integer_as_string_is_valid(self):
        """String representation of positive integer should be valid."""
        is_valid, error = validate_token_limit("1000")
        assert is_valid is True
        assert error is None
    
    def test_negative_string_is_invalid(self):
        """String representation of negative number should be invalid."""
        is_valid, error = validate_token_limit("-100")
        assert is_valid is False
