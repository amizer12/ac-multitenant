#!/bin/bash

set -e  # Exit on error

echo "🚀 Building and deploying Bedrock Agent Stack..."
echo ""

# Build frontend
echo "📦 Installing frontend dependencies..."
cd frontend
npm install

echo "🔨 Building React app..."
npm run build

cd ..

echo ""
echo "☁️  Deploying CDK stack..."
echo "   - Infrastructure (API Gateway, Lambda, DynamoDB, SQS)"
echo "   - Frontend (S3 + CloudFront)"
echo "   - Auto-generating config.js with API credentials"
echo ""

cdk deploy --require-approval never --app "python3 src/cdk_app.py"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Stack Outputs:"
echo "   Check the outputs above for:"
echo "   - Frontend URL (CloudFront)"
echo "   - API Endpoint"
echo "   - API Key ID"
echo ""
echo "💡 The config.js file has been automatically generated and deployed."
echo "   Your frontend is ready to use at the CloudFront URL above."
