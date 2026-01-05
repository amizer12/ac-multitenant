# Requirements Document

## Introduction

This feature adds token usage limits per tenant to the Bedrock Agent Dashboard. When creating an agent for a new tenant, users will be prompted to set a token limit (total sum of input and output tokens). The system will actively track token usage against this limit, display usage percentage in the cost by tenant table, and block inference requests when the limit is reached. Additionally, the frontend tables will auto-refresh to show real-time data without manual refresh clicks.

## Glossary

- **Tenant**: A unique identifier representing a customer or organization using the agent platform
- **Token_Limit**: The maximum total number of tokens (input + output combined) allowed for a tenant
- **Token_Usage_Percentage**: The ratio of current total tokens used to the token limit, expressed as a percentage
- **Aggregation_Table**: DynamoDB table storing aggregated token usage per tenant
- **Frontend_App**: The React-based dashboard application for managing agents
- **Inference_Request**: A request to invoke an agent with a message, which consumes tokens

## Requirements

### Requirement 1: Token Limit Input for New Tenants

**User Story:** As a user, I want to set a token limit when creating an agent for a new tenant, so that I can control token consumption for that tenant.

#### Acceptance Criteria

1. WHEN a user enters a tenant ID in the deploy agent modal, THE Frontend_App SHALL check if the tenant already exists in the system
2. WHEN the tenant does not exist, THE Frontend_App SHALL display a token limit input field prompting the user to enter a limit
3. WHEN the tenant already exists, THE Frontend_App SHALL NOT display the token limit input field
4. WHEN a token limit is entered, THE Frontend_App SHALL validate that the value is a positive integer greater than zero
5. IF an invalid token limit is entered, THEN THE Frontend_App SHALL display an error message and prevent deployment

### Requirement 2: Token Limit Storage

**User Story:** As a system administrator, I want token limits stored persistently, so that they survive system restarts and are available for enforcement.

#### Acceptance Criteria

1. WHEN a new tenant is created with a token limit, THE System SHALL store the token limit in the Aggregation_Table
2. THE Aggregation_Table SHALL store the token_limit field alongside existing aggregation data for each tenant
3. WHEN retrieving tenant usage data, THE Token_Usage_Lambda SHALL return the token_limit field if it exists

### Requirement 3: Token Usage Percentage Display

**User Story:** As a user, I want to see what percentage of the token limit each tenant has used, so that I can monitor consumption at a glance.

#### Acceptance Criteria

1. THE Frontend_App SHALL display a "Usage %" column in the Token Usage by Tenant table
2. WHEN a tenant has a token limit set, THE Frontend_App SHALL calculate and display the usage percentage as (total_tokens / token_limit) * 100
3. WHEN a tenant has no token limit set, THE Frontend_App SHALL display "No Limit" in the Usage % column
4. WHEN usage percentage exceeds 80%, THE Frontend_App SHALL display the value with a warning color indicator
5. WHEN usage percentage reaches 100% or above, THE Frontend_App SHALL display the value with a danger color indicator

### Requirement 4: Token Limit Enforcement

**User Story:** As a system administrator, I want inference requests blocked when a tenant exceeds their token limit, so that costs are controlled.

#### Acceptance Criteria

1. WHEN an inference request is received, THE Invoke_Agent_Lambda SHALL retrieve the tenant's current token usage and limit
2. IF the tenant's total_tokens equals or exceeds their token_limit, THEN THE Invoke_Agent_Lambda SHALL reject the request with a 429 status code
3. WHEN a request is rejected due to token limit, THE Invoke_Agent_Lambda SHALL return an error message indicating the limit has been reached
4. WHEN a tenant has no token limit set, THE Invoke_Agent_Lambda SHALL allow the request to proceed

### Requirement 5: Frontend Auto-Refresh

**User Story:** As a user, I want the dashboard tables to automatically update, so that I can see the latest data without clicking refresh.

#### Acceptance Criteria

1. THE Frontend_App SHALL automatically refresh the Active Agents table at a configurable interval
2. THE Frontend_App SHALL automatically refresh the Token Usage by Tenant table at a configurable interval
3. THE Frontend_App SHALL use a default refresh interval of 10 seconds
4. WHEN data is being refreshed, THE Frontend_App SHALL NOT display loading spinners to avoid UI disruption
5. WHEN a manual refresh button is clicked, THE Frontend_App SHALL immediately fetch the latest data

### Requirement 6: Token Limit API Endpoint

**User Story:** As a developer, I want an API endpoint to set and retrieve token limits, so that limits can be managed programmatically.

#### Acceptance Criteria

1. WHEN a POST request is made to set a token limit, THE API SHALL update the token_limit field for the specified tenant
2. WHEN a GET request is made for usage data, THE API SHALL include the token_limit field in the response
3. IF a tenant does not exist when setting a token limit, THEN THE API SHALL create the tenant record with the specified limit
4. THE API SHALL validate that token_limit is a positive integer before storing
