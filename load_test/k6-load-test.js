import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

// Configuration - update these values or pass via environment variables
const API_ENDPOINT = __ENV.API_ENDPOINT || 'https://cy7d4nt5ec.execute-api.us-west-2.amazonaws.com/prod';
const API_KEY = __ENV.API_KEY || '';
const AGENT_ARN = __ENV.AGENT_ARN || '';
const ACCOUNT_ID = __ENV.ACCOUNT_ID || '803141810841';

// Test questions
const QUESTIONS = [
  'What is the capital of France?',
  'Explain quantum computing in simple terms.',
  'What are the benefits of cloud computing?',
  'How does machine learning differ from traditional programming?',
  'What is the best programming language for beginners?',
  'Can you explain what an API is?',
  'What are microservices and why are they popular?',
  'How does encryption protect data?',
  'What is the difference between SQL and NoSQL databases?',
  'Explain the concept of containerization.',
  'What time is it now in Paris?',
  'What time is it now in Alsaka?',
  'What time is it now in Poland?',
  'What time is it now in Tasmania?',
  'What time is it now in Spain?',
];

// Load test options
export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Ramp up to 5 users
    { duration: '1m', target: 5 },    // Stay at 5 users
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<30000'], // 95% of requests under 30s
    errors: ['rate<0.1'],               // Error rate under 10%
  },
};

export default function () {
  const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const sessionId = `k6-session-${__VU}-${Date.now()}`;

  const payload = JSON.stringify({
    agentId: AGENT_ARN,
    accountId: ACCOUNT_ID,
    inputText: question,
    sessionId: sessionId,
  });

  const headers = {
    'Content-Type': 'application/json',
  };

  if (API_KEY) {
    headers['x-api-key'] = API_KEY;
  }

  const response = http.post(`${API_ENDPOINT}/invoke`, payload, {
    headers: headers,
    timeout: '60s',
  });

  // Record metrics
  responseTime.add(response.timings.duration);

  // Validate response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has body': (r) => r.body && r.body.length > 0,
  });

  errorRate.add(!success);

  // Log failures for debugging
  if (!success) {
    console.log(`Request failed: ${response.status} - ${response.body}`);
  }

  // Wait between requests (1-3 seconds)
  sleep(Math.random() * 2 + 1);
}
