# Bedrock Agent Dashboard

A React-based dashboard for deploying and managing AWS Bedrock agents with token usage tracking.

## Features

- 🚀 Deploy agents with tenant isolation
- 📊 View token usage by tenant in real-time
- 💬 Invoke agents directly from the UI
- 📈 Track input/output tokens and request counts

## Setup

### Prerequisites
- Node.js 16+ and npm
- AWS credentials configured (for DynamoDB access)

### Installation

```bash
cd frontend
npm install
```

### Configuration

Update the following values in `src/App.js`:
- `API_ENDPOINT`: Your API Gateway endpoint
- `API_KEY`: Your API Gateway API key
- `AWS_REGION`: Your AWS region

### Development

```bash
npm start
```

Opens at http://localhost:3000

### Build for Production

```bash
npm run build
```

Creates optimized build in `build/` directory.

## AWS SDK Setup

The app requires AWS SDK for JavaScript to access DynamoDB. Add this to `public/index.html`:

```html
<script src="https://sdk.amazonaws.com/js/aws-sdk-2.1000.0.min.js"></script>
```

## Usage

1. **Deploy Agent**: Enter a tenant ID and click "Deploy Agent"
2. **View Usage**: Token usage table updates automatically every 10 seconds
3. **Invoke Agent**: Send messages to your deployed agent

## Architecture

- Frontend: React 18
- API: AWS API Gateway with API Key authentication
- Backend: AWS Lambda (build-deploy-bedrock-agent)
- Data: DynamoDB (token-usage, token-aggregation)
- Streaming: DynamoDB Streams for real-time aggregation
