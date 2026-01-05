# Implementation Plan: Tenant Token Limits

## Overview

This implementation adds per-tenant token limits to the Bedrock Agent Dashboard. The work is organized into backend changes first (Lambda functions, API), followed by frontend updates. Property-based tests are included as optional sub-tasks to validate correctness properties.

## Tasks

- [x] 1. Create set_tenant_limit Lambda function
  - [x] 1.1 Create handler.py with validation and DynamoDB update logic
    - Validate tenantId is provided
    - Validate tokenLimit is a positive integer > 0
    - Update aggregation table with token_limit field using update_item
    - Return success response with tenant ID and limit
    - _Requirements: 2.1, 6.1, 6.3, 6.4_
  - [x] 1.2 Write property test for token limit validation
    - **Property 2: Token Limit Validation (Backend)**
    - Generate random values, verify only positive integers accepted
    - **Validates: Requirements 6.4**

- [x] 2. Add API Gateway endpoint for token limits
  - [x] 2.1 Update api.py stack to add POST /tenant-limit endpoint
    - Create Lambda integration for set_tenant_limit
    - Add CORS configuration
    - _Requirements: 6.1_

- [x] 3. Modify invoke_agent Lambda for limit enforcement
  - [x] 3.1 Add token limit check function to handler.py
    - Query aggregation table for tenant's usage and limit
    - Compare total_tokens against token_limit
    - Return 429 with detailed error when limit exceeded
    - Allow request when no limit set
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 3.2 Write property test for limit enforcement logic
    - **Property 6: Token Limit Enforcement**
    - Generate random usage/limit combinations
    - Verify enforcement decision matches comparison logic
    - **Validates: Requirements 4.2, 4.3**

- [x] 4. Update token_usage Lambda to include token_limit
  - [x] 4.1 Modify handler.py to return token_limit field in response
    - Ensure token_limit is included when present in aggregation record
    - _Requirements: 2.3, 6.2_

- [x] 5. Checkpoint - Backend complete
  - Ensure all Lambda functions deploy successfully
  - Test API endpoints manually or via curl
  - Ask the user if questions arise

- [x] 6. Update frontend deploy modal for new tenant detection
  - [x] 6.1 Add state and logic to check if tenant exists
    - Add tenantExists state variable
    - Add tokenLimit state variable
    - Call usage API when tenant ID changes (debounced)
    - Check if tenant exists in response data
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 6.2 Add token limit input field (conditional)
    - Show input only when tenant does not exist
    - Add validation for positive integer
    - Include tokenLimit in deploy payload
    - _Requirements: 1.2, 1.4, 1.5_
  - [x] 6.3 Write property test for frontend validation
    - **Property 1: Token Limit Validation (Frontend)**
    - Generate random inputs, verify validation logic
    - **Validates: Requirements 1.4**

- [x] 7. Add Usage % column to token usage table
  - [x] 7.1 Add column header and data cell
    - Add "Usage %" column after "Total Cost"
    - Calculate percentage: (total_tokens / token_limit) * 100
    - Display "No Limit" when token_limit is undefined
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 7.2 Add color coding based on percentage thresholds
    - Default styling for < 80%
    - Warning color (yellow/orange) for >= 80% and < 100%
    - Danger color (red) for >= 100%
    - _Requirements: 3.4, 3.5_
  - [x] 7.3 Write property test for percentage calculation
    - **Property 4: Usage Percentage Calculation**
    - Generate random usage/limit pairs
    - Verify calculation matches formula
    - **Validates: Requirements 3.2**
  - [x] 7.4 Write property test for color coding
    - **Property 5: Usage Percentage Color Coding**
    - Generate random percentages
    - Verify correct color assignment
    - **Validates: Requirements 3.4, 3.5**

- [x] 8. Verify auto-refresh functionality
  - [x] 8.1 Confirm existing auto-refresh works silently
    - Verify 10-second interval is configured
    - Ensure no loading spinners during background refresh
    - Test manual refresh still works
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 9. Update CDK stack for new Lambda
  - [x] 9.1 Add set_tenant_limit Lambda to lambdas.py
    - Create Lambda function with aggregation table access
    - Grant DynamoDB read/write permissions
    - _Requirements: 2.1_

- [x] 10. Final checkpoint - Full integration
  - Deploy full stack with `cdk deploy`
  - Test end-to-end: create tenant with limit → invoke until limit → verify 429
  - Verify usage % displays correctly in table
  - Ensure all tests pass, ask the user if questions arise

## Notes

- All tasks including property tests are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- The existing auto-refresh (10s interval) is already implemented; task 8 verifies it works correctly
