import json
import boto3
import os
import time
from urllib.request import Request, urlopen

s3 = boto3.client('s3')
cloudfront = boto3.client('cloudfront')

def lambda_handler(event, context):
    """
    Custom Resource Lambda to inject runtime config into frontend config.js
    This runs AFTER the stack is deployed and API is created
    """
    print(f"Received event: {json.dumps(event)}")
    
    request_type = event['RequestType']
    response_status = 'SUCCESS'
    response_data = {}
    
    try:
        if request_type in ['Create', 'Update']:
            # Get values from environment variables (set by CDK)
            api_endpoint = os.environ['API_ENDPOINT']
            api_key_id = os.environ['API_KEY_ID']
            region = os.environ['AWS_REGION']
            bucket_name = os.environ['FRONTEND_BUCKET']
            distribution_id = os.environ.get('DISTRIBUTION_ID', '')
            
            # Retrieve the actual API key value
            apigateway = boto3.client('apigateway')
            api_key_response = apigateway.get_api_key(
                apiKey=api_key_id,
                includeValue=True
            )
            api_key_value = api_key_response['value']
            
            # Generate config.js content
            # Remove trailing slash from API endpoint if present
            api_endpoint_clean = api_endpoint.rstrip('/')
            
            config_content = f"""// This file is auto-generated during deployment
window.APP_CONFIG = {{
  API_ENDPOINT: '{api_endpoint_clean}',
  API_KEY: '{api_key_value}',
  AWS_REGION: '{region}'
}};
"""
            
            # Upload to S3
            s3.put_object(
                Bucket=bucket_name,
                Key='config.js',
                Body=config_content.encode('utf-8'),
                ContentType='application/javascript',
                CacheControl='no-cache, no-store, must-revalidate'  # Prevent caching
            )
            
            print(f"Successfully updated config.js in bucket {bucket_name}")
            
            # Invalidate CloudFront cache for config.js
            if distribution_id:
                try:
                    invalidation = cloudfront.create_invalidation(
                        DistributionId=distribution_id,
                        InvalidationBatch={
                            'Paths': {
                                'Quantity': 1,
                                'Items': ['/config.js']
                            },
                            'CallerReference': str(time.time())
                        }
                    )
                    print(f"CloudFront invalidation created: {invalidation['Invalidation']['Id']}")
                except Exception as e:
                    print(f"Warning: Failed to invalidate CloudFront cache: {str(e)}")
            
            response_data['Message'] = 'Config injection successful'
            
        elif request_type == 'Delete':
            # Nothing to clean up
            print("Delete request - no action needed")
            response_data['Message'] = 'Delete successful'
            
    except Exception as e:
        print(f"Error: {str(e)}")
        response_status = 'FAILED'
        response_data['Message'] = str(e)
    
    # Send response to CloudFormation
    send_response(event, context, response_status, response_data)
    
    return {
        'statusCode': 200,
        'body': json.dumps(response_data)
    }


def send_response(event, context, response_status, response_data):
    """Send response to CloudFormation"""
    response_body = json.dumps({
        'Status': response_status,
        'Reason': f"See CloudWatch Log Stream: {context.log_stream_name}",
        'PhysicalResourceId': context.log_stream_name,
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'Data': response_data
    })
    
    print(f"Response body: {response_body}")
    
    headers = {
        'Content-Type': '',
        'Content-Length': str(len(response_body))
    }
    
    req = Request(event['ResponseURL'], data=response_body.encode('utf-8'), headers=headers, method='PUT')
    
    try:
        response = urlopen(req)
        print(f"CloudFormation response status: {response.status}")
    except Exception as e:
        print(f"Failed to send response to CloudFormation: {str(e)}")
