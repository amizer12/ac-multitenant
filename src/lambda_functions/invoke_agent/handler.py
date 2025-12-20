import json
import os
import boto3
import traceback

bedrock_runtime = boto3.client('bedrock-agentcore', region_name=os.environ['AWS_REGION'])

# CORS headers for all responses
CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

def extract_text_from_response(obj):
    """
    Recursively extract text content from nested response structure.
    Handles structures like: {'result': {'role': 'assistant', 'content': [{'text': '...'}]}}
    """
    if isinstance(obj, str):
        return obj
    
    if isinstance(obj, dict):
        # Check for result key
        if 'result' in obj:
            return extract_text_from_response(obj['result'])
        
        # Check for role and content (Anthropic format)
        if 'role' in obj and 'content' in obj:
            return extract_text_from_response(obj['content'])
        
        # Check for content array
        if 'content' in obj and isinstance(obj['content'], list):
            texts = []
            for item in obj['content']:
                if isinstance(item, dict) and 'text' in item:
                    texts.append(item['text'])
                elif isinstance(item, str):
                    texts.append(item)
            return '\n\n'.join(texts) if texts else str(obj)
        
        # Check for direct text field
        if 'text' in obj:
            return obj['text']
        
        # Check for message or completion
        if 'message' in obj:
            return extract_text_from_response(obj['message'])
        if 'completion' in obj:
            return extract_text_from_response(obj['completion'])
    
    if isinstance(obj, list):
        texts = []
        for item in obj:
            if isinstance(item, dict) and 'text' in item:
                texts.append(item['text'])
            elif isinstance(item, str):
                texts.append(item)
            else:
                texts.append(extract_text_from_response(item))
        return '\n\n'.join(texts) if texts else str(obj)
    
    return str(obj)

def lambda_handler(event, context):
    print(f"Received event: {json.dumps(event)}")
    
    try:
        body = json.loads(event.get('body', '{}'))
        agent_id = body.get('agentId')
        input_text = body.get('inputText')
        session_id = body.get('sessionId', 'default-session')
        
        print(f"Agent ID: {agent_id}")
        print(f"Input text: {input_text}")
        
        if not agent_id or not input_text:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'agentId and inputText are required'})
            }
        
        # Invoke the agent
        print(f"Invoking agent: {agent_id}")
        response = bedrock_runtime.invoke_agent_runtime(
            agentRuntimeArn=agent_id,
            payload=json.dumps({'message': input_text}).encode('utf-8'),
            contentType='application/json'
        )
        
        # Log the full response structure for debugging
        print(f"Full response keys: {list(response.keys())}")
        print(f"Response metadata: {response.get('ResponseMetadata', {})}")
        
        # The actual response is in the 'response' key, not 'body'
        response_data = response.get('response', '')
        
        # Handle different response types
        if hasattr(response_data, 'read'):
            # It's a StreamingBody
            response_data = response_data.read()
        
        # Decode if bytes
        if isinstance(response_data, bytes):
            response_data = response_data.decode('utf-8')
        
        print(f"Agent response data: {response_data}")
        print(f"Agent response data type: {type(response_data)}")
        print(f"Agent response data length: {len(str(response_data))}")
        
        # Try to parse as JSON if it's a string
        try:
            if isinstance(response_data, str) and response_data.strip():
                parsed_response = json.loads(response_data)
                # Extract the actual text from the nested structure
                response_body = extract_text_from_response(parsed_response)
            else:
                response_body = response_data
        except json.JSONDecodeError:
            # If not JSON, use as-is
            response_body = response_data
        
        # If response is empty, return a message indicating the agent processed the request
        if not response_body or str(response_body).strip() == '':
            response_body = "Agent processed the request successfully. Check token usage for confirmation."
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'completion': response_body,
                'sessionId': session_id
            })
        }
    except Exception as e:
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"Error invoking agent: {error_msg}")
        print(f"Traceback: {error_trace}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'error': error_msg,
                'type': type(e).__name__
            })
        }
