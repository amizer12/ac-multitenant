import json
import os
import boto3
import traceback

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['AGENT_DETAILS_TABLE_NAME'])

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,OPTIONS'
}

def lambda_handler(event, context):
    print(f"Received event: {json.dumps(event)}")
    
    try:
        # Get tenantId from query parameters
        tenant_id = None
        if 'queryStringParameters' in event and event['queryStringParameters']:
            tenant_id = event['queryStringParameters'].get('tenantId')
        
        if not tenant_id:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'tenantId query parameter is required'})
            }
        
        # Query DynamoDB for all agents with this tenantId
        print(f"Looking for agents with tenantId: {tenant_id}")
        
        response = table.query(
            KeyConditionExpression='tenantId = :tid',
            ExpressionAttributeValues={
                ':tid': tenant_id
            }
        )
        
        agents = response.get('Items', [])
        
        if agents:
            print(f"Found {len(agents)} agent(s) for tenantId: {tenant_id}")
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': json.dumps(agents, default=str)
            }
        else:
            print(f"No agents found for tenantId: {tenant_id}")
            return {
                'statusCode': 404,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': 'No agents found',
                    'tenantId': tenant_id,
                    'message': 'No agents found with this tenant ID. They may still be deploying.'
                })
            }
            
    except Exception as e:
        print(f"Error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
