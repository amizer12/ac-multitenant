#!/bin/bash

echo "🚀 Building and deploying frontend..."

# Build frontend
cd frontend
echo "📦 Installing dependencies..."
npm install

echo "🔨 Building React app..."
npm run build

cd ..

echo "☁️  Deploying CDK stack with frontend..."
cdk deploy --require-approval never --app "python3 src/cdk_app.py"

echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Get your API key: aws apigateway get-api-key --api-key <API_KEY_ID> --include-value --region us-west-2"
echo "2. Update frontend/src/App.js with your API endpoint and key"
echo "3. Rebuild and redeploy if needed"
