#!/usr/bin/env python3
"""
Agent Load Test Script

Sends random questions to the deployed Bedrock agent every 5 seconds.
Usage: python test_agent.py --api-endpoint <API_URL> --agent-arn <AGENT_ARN>
"""

import argparse
import random
import time
import requests
import json
from datetime import datetime

# 20 Auto-generated questions for testing
QUESTIONS = [
    "What is the capital of France?",
    "Explain quantum computing in simple terms.",
    "What are the benefits of cloud computing?",
    "How does machine learning differ from traditional programming?",
    "What is the best programming language for beginners?",
    "Can you explain what an API is?",
    "What are microservices and why are they popular?",
    "How does encryption protect data?",
    "What is the difference between SQL and NoSQL databases?",
    "Explain the concept of containerization.",
    "What are the main principles of DevOps?",
    "How does a neural network work?",
    "What is serverless computing?",
    "Explain the CAP theorem in distributed systems.",
    "What are the advantages of using TypeScript over JavaScript?",
    "How do you handle errors in production systems?",
    "What is the purpose of a load balancer?",
    "Explain the difference between REST and GraphQL.",
    "What are design patterns and why are they useful?",
    "How do you ensure code quality in a team?",
]


def send_question(api_endpoint: str, agent_arn: str, question: str, api_key: str = None) -> dict:
    """Send a question to the agent and return the response."""
    url = f"{api_endpoint.rstrip('/')}/invoke"
    
    payload = {
        "agentId": agent_arn,
        "inputText": question,
        "sessionId": f"test-session-{int(time.time())}"
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    if api_key:
        headers["x-api-key"] = api_key
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        return {"success": True, "data": response.json()}
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Test Bedrock Agent with random questions")
    parser.add_argument("--api-endpoint", required=True, help="API Gateway endpoint URL")
    parser.add_argument("--agent-arn", required=True, help="Agent Runtime ARN")
    parser.add_argument("--api-key", required=False, help="API Key for authentication")
    parser.add_argument("--interval", type=int, default=5, help="Seconds between requests (default: 5)")
    parser.add_argument("--count", type=int, default=0, help="Number of requests (0 = infinite)")
    args = parser.parse_args()
    
    print(f"🚀 Starting agent load test")
    print(f"   API Endpoint: {args.api_endpoint}")
    print(f"   Agent ARN: {args.agent_arn}")
    print(f"   API Key: {'***' + args.api_key[-4:] if args.api_key else 'None'}")
    print(f"   Interval: {args.interval}s")
    print(f"   Count: {'infinite' if args.count == 0 else args.count}")
    print("-" * 60)
    
    request_num = 0
    try:
        while args.count == 0 or request_num < args.count:
            request_num += 1
            question = random.choice(QUESTIONS)
            timestamp = datetime.now().strftime("%H:%M:%S")
            
            print(f"\n[{timestamp}] Request #{request_num}")
            print(f"   Q: {question}")
            
            result = send_question(args.api_endpoint, args.agent_arn, question, args.api_key)
            
            if result["success"]:
                response_text = result["data"].get("completion", str(result["data"]))
                # Truncate long responses for display
                if len(response_text) > 200:
                    response_text = response_text[:200] + "..."
                print(f"   A: {response_text}")
            else:
                print(f"   ❌ Error: {result['error']}")
            
            if args.count == 0 or request_num < args.count:
                time.sleep(args.interval)
                
    except KeyboardInterrupt:
        print(f"\n\n⏹️  Stopped after {request_num} requests")
    
    print(f"\n✅ Test complete. Total requests: {request_num}")


if __name__ == "__main__":
    main()
