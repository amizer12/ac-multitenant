# AWS Bedrock Agent Core Full-Stack Web Application

A multi-tenant SaaS platform for deploying, managing, and invoking AI agents powered by AWS Bedrock Agent Core.

## Features

- **Deploy Custom AI Agents**: Configure agents with custom models (Claude Sonnet 4.5), system prompts, and modular tools
- **Modular Tool Composition**: Select from 6+ tools (web search, calculator, database query, email, web crawler, etc.)
- **Multi-Tenant Isolation**: Each agent tagged with tenant ID for cost tracking
- **Token Limits per Tenant**: Set and enforce token usage limits with automatic 429 responses when exceeded
- **Real-Time Token Usage Tracking**: Monitor inference costs per tenant with aggregated metrics and usage percentages
- **Infrastructure Cost Tracking**: Track AWS infrastructure costs per tenant using cost allocation tags via AWS Cost Explorer
- **Total Cost Dashboard**: View combined inference + infrastructure costs per tenant with detailed breakdowns
- **Agent Management**: List, invoke, update, and delete agents via REST API
- **Interactive Dashboard**: React-based UI with dark mode, charts, auto-refresh, and real-time updates

## Architecture

![Architecture Diagram](docs/architecture.drawio.png)

The system architecture consists of the following components:


### Component Overview

| Component | Service | Purpose |
|-----------|---------|---------|
| Frontend | CloudFront + S3 | React dashboard with HeroUI v3 |
| API | API Gateway | REST API with 9 endpoints |
| Agent Ops | Lambda (5) | Deploy, invoke, list, get, delete agents |
| Token Tracking | Lambda (3) + SQS | Real-time usage aggregation |
| Cost Tracking | Lambda (1) + Cost Explorer | Infrastructure cost per tenant |
| Storage | DynamoDB (4) | Agents, tokens, config, aggregates |
| AI | Bedrock Agent Core | Claude Sonnet 4.5 model |

### Data Flow

**Agent Deployment**:
```
Frontend → API Gateway → async_deploy → build_deploy → S3 + Bedrock → DynamoDB
```

**Agent Invocation with Token Limits**:
```
Frontend → API Gateway → invoke_agent → Check Limit → Bedrock → SQS → Aggregate
```

**Token Tracking Pipeline**:
```
SQS → sqs_to_dynamodb → DynamoDB → Stream → Aggregation → Dashboard
```

**Infrastructure Cost Tracking**:
```
Frontend → API Gateway → infrastructure_costs → Cost Explorer (tenantId tag) → Dashboard
```

## Project Structure

```
.
├── agent-tools-repo/         # Modular tool repository for agent composition
├── docs/                     # Architecture diagrams and documentation
├── frontend/                 # React dashboard application
├── src/                      # Backend infrastructure and Lambda functions
│   ├── lambda_functions/     # Lambda function handlers
│   ├── stacks/               # CDK stack definitions
│   └── cdk_app.py           # CDK application entry point
├── deploy.sh                 # One-command deployment script
└── README.md                # This file
```

### agent-tools-repo/
Modular tool repository for composing AI agents with various capabilities. Serves as a reference implementation for the agent deployment system.

**Purpose:**
- Provides a catalog of reusable tools (web search, calculator, database query, email sender, etc.)
- Demonstrates the tool composition pattern for agent deployment
- Serves as a template for creating custom tool repositories

**Structure:**
```
agent-tools-repo/ac_tools/
├── catalog.json              # Tool catalog with metadata
├── templates/                # Base agent templates
└── tools/                    # Individual tool implementations
    ├── web-search/
    ├── calculator/
    ├── database-query/
    └── email-sender/
```

**Usage:**
When deploying an agent through the dashboard, you can reference this repository (or your own fork) to load and select tools for your agent. The deployment system fetches the `catalog.json`, displays available tools, and bundles selected tools with your agent code.

> **Note:** This directory is excluded from deployment via `.gitignore` and serves as a development reference only.

### docs/
Contains architecture diagrams and documentation.

**Files:**
- `architecture.drawio` - Draw.io diagram showing the complete system architecture with multi-provider support

### frontend/
React-based dashboard application built with Vite, HeroUI v3, and Tailwind CSS.

**Structure:**
```
frontend/
├── src/
│   ├── App.jsx              # Main application component
│   ├── App.css              # Application styles
│   ├── main.jsx             # Application entry point
│   └── utils/               # Utility functions (validation, etc.)
├── public/
│   └── config.js            # Auto-generated API configuration
├── dist/                    # Build output (deployed to S3)
├── package.json             # Dependencies and scripts
└── vite.config.js           # Vite configuration
```

**Features:**
- Dark/light mode toggle
- Real-time token usage tracking with charts
- Infrastructure cost monitoring
- Agent deployment and management UI
- Auto-refresh every 10 seconds

### src/
Backend infrastructure defined using AWS CDK (Python).

**Structure:**
```
src/
├── lambda_functions/        # Lambda function implementations
│   ├── async_deploy_agent/  # Async agent deployment handler
│   ├── build_deploy_agent/  # Agent build and deployment
│   ├── config_injector/     # Auto-inject API config to frontend
│   ├── delete_agent/        # Delete agent handler
│   ├── dynamodb_stream_processor/ # Token aggregation
│   ├── get_agent_details/   # Get agent info
│   ├── infrastructure_costs/ # Cost Explorer integration
│   ├── invoke_agent/        # Agent invocation with limit checks
│   ├── list_agents/         # List all agents
│   ├── set_tenant_limit/    # Set token limits per tenant
│   ├── sqs_to_dynamodb/     # Token usage processor
│   ├── token_usage/         # Get usage statistics
│   └── update_agent_config/ # Update agent configuration
├── stacks/                  # CDK stack definitions
│   ├── agent_runtime.py     # Bedrock Agent Core resources
│   ├── api.py               # API Gateway configuration
│   ├── database.py          # DynamoDB tables
│   ├── frontend.py          # S3 + CloudFront setup
│   ├── lambdas.py           # Lambda function definitions
│   └── messaging.py         # SQS queue configuration
├── cdk_app.py              # CDK application entry point
└── cdk.json                # CDK configuration
```

**Key Components:**
- **Lambda Functions**: 12 functions handling agent lifecycle, invocation, and cost tracking
- **CDK Stacks**: Modular infrastructure definitions for API, database, frontend, and messaging
- **Auto-Configuration**: Automatic injection of API credentials into frontend config

## Prerequisites

- AWS CLI configured with credentials
- Node.js 18+ and npm
- Python 3.10+
- AWS CDK CLI (`npm install -g aws-cdk`)
- CDK bootstrapped in your AWS account/region

## Deployment

### One-Command Deployment

```bash
./deploy.sh
```

This script will:
1. Install frontend dependencies
2. Build the React application
3. Deploy the entire CDK stack (infrastructure + frontend)
4. **Automatically generate config.js** with API endpoint and key
5. Deploy frontend to S3 and CloudFront
6. Invalidate CloudFront cache

### What Gets Deployed

- **API Gateway**: REST API with 7 endpoints
- **Lambda Functions**: 12 functions for agent operations
- **DynamoDB Tables**: 4 tables for agents, config, and token tracking
- **SQS Queue**: For asynchronous token usage processing
- **S3 Buckets**: For agent code and frontend hosting
- **CloudFront**: CDN for frontend distribution
- **IAM Roles**: With least-privilege permissions

### Automatic Configuration Injection

The deployment automatically:
- Retrieves the API Gateway endpoint URL
- Retrieves the API key value
- Generates `config.js` with these credentials
- Uploads it to S3
- Invalidates CloudFront cache

**No manual configuration needed!** The frontend is ready to use immediately after deployment.

## Stack Outputs

After deployment, you'll see outputs including:

- `FrontendUrl`: CloudFront URL for the dashboard
- `ApiEndpoint`: API Gateway endpoint
- `ApiKeyId`: API key ID (value is auto-injected into frontend)
- `CodeBucket`: S3 bucket for agent code
- `QueueUrl`: SQS queue for token tracking

## Usage

1. Visit the CloudFront URL from the stack outputs
2. Enter a tenant ID
3. Configure your agent (model, system prompt, tools)
4. Click "Deploy Agent"
5. Once deployed, invoke the agent from the dashboard
6. Monitor token usage and costs in real-time

## API Endpoints

- `POST /deploy` - Deploy new agent (requires API key)
- `POST /invoke` - Invoke deployed agent
- `GET /agents` - List all agents
- `GET /agent` - Get agent details
- `DELETE /agent` - Delete agent
- `GET /usage` - Get token usage statistics
- `GET /infrastructure-costs` - Get infrastructure costs per tenant
- `PUT/GET /config` - Update/get agent configuration

## Development

### Local Frontend Development

```bash
cd frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:3000` and use the deployed API.

### Redeploy After Changes

```bash
./deploy.sh
```

The config.js will be automatically regenerated with the latest API credentials.

## Cost Tracking

The platform provides comprehensive cost tracking with two components:

### Inference Costs
- Tracks token usage per agent invocation
- Calculates costs based on input/output token pricing
- Aggregates costs by tenant ID
- Displays usage percentages against token limits

### Infrastructure Costs
- Queries AWS Cost Explorer for infrastructure costs
- Filters by `tenantId` cost allocation tag
- Retrieves current month costs per tenant
- Only tracks costs for currently configured tenants

### Dashboard Display
- **Inference Cost**: Token-based costs from Bedrock usage
- **Infra Cost**: AWS infrastructure costs (Lambda, DynamoDB, etc.)
- **Total Cost**: Combined inference + infrastructure costs
- **Cost Chart**: Visual breakdown with detailed tooltips
- **Auto-refresh**: Updates every 10 seconds

> **Note**: Infrastructure costs from AWS Cost Explorer may be delayed up to 24 hours for new resources.

## Cleanup

To delete all resources:

```bash
cdk destroy --app "python3 src/cdk_app.py"
```

## Creating Custom Agent Tools (Optional)

To deploy agents with your own custom tools, you can create a custom tool repository based on the included `agent-tools-repo` template.

### 1. Clone the Agent Tools Repository

```bash
# Create a new repository from the agent-tools-repo template
cp -r agent-tools-repo/ac_tools my-custom-tools
cd my-custom-tools

# Initialize as a new git repository
git init
git add .
git commit -m "Initial commit: Custom agent tools"

# Push to your GitHub repository
git remote add origin https://github.com/YOUR_USERNAME/my-custom-tools.git
git push -u origin main
```

### 2. Add Your Custom Tools

Create a new tool in the `tools/` directory:

```bash
mkdir tools/my-custom-tool
```

Create `tools/my-custom-tool/tool.py`:
```python
from strands import tool

@tool
def my_custom_tool(input: str) -> str:
    """Description of what your tool does"""
    # Your tool implementation
    return f"Processed: {input}"
```

Create `tools/my-custom-tool/config.json`:
```json
{
  "id": "my-custom-tool",
  "name": "My Custom Tool",
  "description": "Description of your custom tool",
  "category": "utility",
  "version": "1.0.0"
}
```

### 3. Update the Tool Catalog

Edit `catalog.json` to include your new tool:
```json
{
  "tools": [
    {
      "id": "my-custom-tool",
      "name": "My Custom Tool",
      "description": "Description of your custom tool",
      "category": "utility",
      "path": "tools/my-custom-tool"
    }
  ]
}
```

### 4. Push Changes to GitHub

```bash
git add .
git commit -m "Add custom tool"
git push
```

### 5. Use Your Custom Tools in Agent Deployment

When deploying an agent through the dashboard:

1. Click "Deploy New Agent"
2. Expand "Advanced Configuration"
3. Check "Use Custom Template from GitHub"
4. Enter your repository: `YOUR_USERNAME/my-custom-tools`
5. Click "Load Available Tools"
6. Select your custom tools
7. Deploy the agent

The deployment system will fetch your `catalog.json`, display your custom tools, and bundle them with the agent code.

> **Tip**: You can make your repository private and provide a GitHub Personal Access Token in the deployment form for private tool repositories.

## License

MIT
