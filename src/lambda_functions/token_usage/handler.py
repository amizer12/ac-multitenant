import json
import os
import boto3

dynamodb = boto3.resource("dynamodb")
aggregation_table = dynamodb.Table(os.environ["AGGREGATION_TABLE_NAME"])


def lambda_handler(event, context):
    try:
        # Scan the aggregation table
        response = aggregation_table.scan()
        items = response.get("Items", [])

        # Filter for tenant records
        tenant_items = [
            item
            for item in items
            if item.get("aggregation_key", "").startswith("tenant:")
        ]

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
            },
            "body": json.dumps(tenant_items, default=str),
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": str(e)}),
        }
