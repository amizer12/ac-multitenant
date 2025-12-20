#!/usr/bin/env python3
import os
import aws_cdk as cdk
from constructs import Construct
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CustomResource,
    aws_dynamodb as dynamodb,
    aws_sqs as sqs,
    aws_lambda as lambda_,
    aws_lambda_event_sources as lambda_event_sources,
    aws_iam as iam,
    aws_s3 as s3,
    aws_s3_deployment as s3_deployment,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_apigateway as apigateway,
    aws_logs as logs,
    custom_resources as cr,
)

# Get the directory where this CDK app file is located
CDK_APP_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CDK_APP_DIR)

# Log retention: 7 days for all Lambda functions
class BedrockAgentStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        # Configuration
        account_id = self.account
        region = self.region
        agent_name = "sqs"
        
        # Step 1: Create S3 bucket for agent code
        code_bucket = s3.Bucket(
            self,
            "AgentCodeBucket",
            bucket_name=f"bedrock-agentcore-code-{account_id}-{region}",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        
        # Step 2: Create DynamoDB table for token usage with streams enabled
        usage_table = dynamodb.Table(
            self,
            "TokenUsageTable",
            table_name="token-usage",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
            stream=dynamodb.StreamViewType.NEW_IMAGE,  # Enable streams with new item data
        )
        
        # Step 2b: Create DynamoDB table for token aggregation
        aggregation_table = dynamodb.Table(
            self,
            "TokenAggregationTable",
            table_name="token-aggregation",
            partition_key=dynamodb.Attribute(
                name="aggregation_key", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        # Step 3: Create SQS queue
        usage_queue = sqs.Queue(
            self,
            "TokenUsageQueue",
            queue_name="token-usage-queue",
            visibility_timeout=Duration.seconds(300),
            retention_period=Duration.days(1),
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        # Step 4: Create Lambda function for SQS to DynamoDB
        processor_lambda = lambda_.Function(
            self,
            "SQSToDynamoDBProcessor",
            function_name="sqs-to-dynamodb-processor",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/sqs_to_dynamodb")),
            timeout=Duration.seconds(60),
            log_retention=logs.RetentionDays.ONE_WEEK,
            memory_size=256,
            environment={
                "TABLE_NAME": usage_table.table_name,
            },
        )
        
        # Grant permissions
        usage_table.grant_write_data(processor_lambda)
        processor_lambda.add_event_source(
            lambda_event_sources.SqsEventSource(usage_queue, batch_size=10)
        )
        
        # Step 4b: Create Lambda function triggered by DynamoDB streams
        stream_processor_lambda = lambda_.Function(
            self,
            "DynamoDBStreamProcessor",
            function_name="dynamodb-stream-processor",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            log_retention=logs.RetentionDays.ONE_WEEK,
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/dynamodb_stream_processor")),
            timeout=Duration.seconds(60),
            memory_size=256,
            environment={
                "AGGREGATION_TABLE_NAME": aggregation_table.table_name,
            },
        )
        
        # Grant read permissions on the stream
        usage_table.grant_stream_read(stream_processor_lambda)
        
        # Grant write permissions on the aggregation table
        aggregation_table.grant_read_write_data(stream_processor_lambda)
        
        # Add DynamoDB stream as event source
        stream_processor_lambda.add_event_source(
            lambda_event_sources.DynamoEventSource(
                usage_table,
                starting_position=lambda_.StartingPosition.LATEST,
                batch_size=10,
                retry_attempts=3,
            )
        )
        
        # Step 5: Create IAM role for Bedrock Agent Runtime
        agent_role = iam.Role(
            self,
            "BedrockAgentRole",
            role_name=f"AmazonBedrockAgentCoreSDKRuntime-{region}",
            assumed_by=iam.ServicePrincipal("bedrock-agentcore.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name("AmazonBedrockFullAccess"),
            ],
        )
        
        # Grant agent role permission to send to SQS
        usage_queue.grant_send_messages(agent_role)
        
        # Step 6: Create single Lambda to build and deploy agent
        build_deploy_agent_lambda = lambda_.Function(
            self,
            "BuildDeployAgentLambda",
            function_name="build-deploy-bedrock-agent",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/build_deploy_agent")),
            timeout=Duration.minutes(15),
            memory_size=3008,
            log_retention=logs.RetentionDays.ONE_WEEK,  # Max memory for building
            ephemeral_storage_size=cdk.Size.mebibytes(10240),  # 10GB for building
            environment={
                "AGENT_NAME": agent_name,
                "QUEUE_URL": usage_queue.queue_url,
                "ROLE_ARN": agent_role.role_arn,
                "BUCKET_NAME": code_bucket.bucket_name,
            },
        )
        
        # Grant S3 permissions
        code_bucket.grant_read_write(build_deploy_agent_lambda)
        
        # Grant Bedrock AgentCore Control permissions (for creating/managing agent runtimes)
        # Note: bedrock-agentcore-control is the control plane service for managing agent runtimes
        build_deploy_agent_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "bedrock-agentcore-control:*",
                    "bedrock-agentcore:*",
                    "bedrock-agentcore:GetAgentRuntime",
                    "bedrock-agentcore:CreateAgentRuntime",
                    "bedrock-agentcore:DeleteAgentRuntime",
                    "bedrock-agentcore:TagResource",
                ],
                resources=["*"],
            )
        )
                
        # Grant IAM PassRole permission for the agent runtime role
        build_deploy_agent_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "iam:PassRole",
                ],
                resources=[agent_role.role_arn],
            )
        )
        
        build_deploy_agent_lambda.node.add_dependency(agent_role)
        
        # Note: agent_details_table will be created later in the code, 
        # so we'll grant permissions after it's created
        
        # Step 7: Create API Gateway with API Key authentication
        api = apigateway.RestApi(
            self,
            "AgentDeploymentAPI",
            rest_api_name="Agent Deployment API",
            description="API to deploy Bedrock agents with tenant isolation",
            deploy_options=apigateway.StageOptions(
                stage_name="prod",
                throttling_rate_limit=10,
                throttling_burst_limit=20,
            ),
        )
        
        # Create API Key
        api_key = api.add_api_key(
            "AgentDeploymentApiKey",
            api_key_name="agent-deployment-key",
        )
        
        # Create Usage Plan
        usage_plan = api.add_usage_plan(
            "AgentDeploymentUsagePlan",
            name="Agent Deployment Usage Plan",
            throttle=apigateway.ThrottleSettings(
                rate_limit=10,
                burst_limit=20,
            ),
            quota=apigateway.QuotaSettings(
                limit=1000,
                period=apigateway.Period.DAY,
            ),
        )
        
        usage_plan.add_api_key(api_key)
        usage_plan.add_api_stage(
            stage=api.deployment_stage,
        )
        
        # Create async deploy Lambda that invokes the build-deploy lambda asynchronously
        async_deploy_lambda = lambda_.Function(
            self,
            "AsyncDeployLambda",
            function_name="async-deploy-agent",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            log_retention=logs.RetentionDays.ONE_WEEK,
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/async_deploy_agent")),
            timeout=Duration.seconds(10),
            memory_size=256,
            environment={
                "BUILD_DEPLOY_FUNCTION_NAME": build_deploy_agent_lambda.function_name,
            },
        )
        
        # Grant permission to invoke the build-deploy lambda
        build_deploy_agent_lambda.grant_invoke(async_deploy_lambda)
        
        # Create Lambda integration for async deploy
        deploy_integration = apigateway.LambdaIntegration(
            async_deploy_lambda,
            proxy=True,
        )
        
        # Create /deploy resource
        deploy_resource = api.root.add_resource("deploy")
        
        # Add POST method with API key required
        deploy_method = deploy_resource.add_method(
            "POST",
            deploy_integration,
            api_key_required=True,
            request_parameters={
                "method.request.querystring.tenantId": True,
            },
            method_responses=[
                apigateway.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": True
                    },
                    response_models={
                        "application/json": apigateway.Model.EMPTY_MODEL,
                    },
                )
            ],
        )
        
        # Add CORS OPTIONS method for deploy
        deploy_resource.add_method(
            "OPTIONS",
            apigateway.MockIntegration(
                integration_responses=[
                    apigateway.IntegrationResponse(
                        status_code="200",
                        response_parameters={
                            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                            "method.response.header.Access-Control-Allow-Origin": "'*'",
                            "method.response.header.Access-Control-Allow-Methods": "'POST,OPTIONS'"
                        }
                    )
                ],
                passthrough_behavior=apigateway.PassthroughBehavior.NEVER,
                request_templates={
                    "application/json": '{"statusCode": 200}'
                }
            ),
            method_responses=[
                apigateway.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Headers": True,
                        "method.response.header.Access-Control-Allow-Origin": True,
                        "method.response.header.Access-Control-Allow-Methods": True,
                    }
                )
            ]
        )
        
        # Create Lambda function to fetch token usage (no credentials needed in frontend)
        token_usage_lambda = lambda_.Function(
            self,
            "TokenUsageLambda",
            function_name="get-token-usage",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/token_usage")),
            timeout=Duration.seconds(30),
            log_retention=logs.RetentionDays.ONE_WEEK,
            memory_size=256,
            environment={
                "AGGREGATION_TABLE_NAME": aggregation_table.table_name,
            },
        )
        
        # Grant read permissions on aggregation table
        aggregation_table.grant_read_data(token_usage_lambda)
        
        # Create Lambda integration for token usage
        token_usage_integration = apigateway.LambdaIntegration(
            token_usage_lambda,
            proxy=True,
        )
        
        # Create /usage resource
        usage_resource = api.root.add_resource("usage")
        
        # Add GET method (no API key required for reading usage)
        usage_resource.add_method(
            "GET",
            token_usage_integration,
            api_key_required=False,
        )
        
        # Add CORS OPTIONS method
        usage_resource.add_method(
            "OPTIONS",
            apigateway.MockIntegration(
                integration_responses=[
                    apigateway.IntegrationResponse(
                        status_code="200",
                        response_parameters={
                            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                            "method.response.header.Access-Control-Allow-Origin": "'*'",
                            "method.response.header.Access-Control-Allow-Methods": "'GET,OPTIONS'"
                        }
                    )
                ],
                passthrough_behavior=apigateway.PassthroughBehavior.NEVER,
                request_templates={
                    "application/json": '{"statusCode": 200}'
                }
            ),
            method_responses=[
                apigateway.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Headers": True,
                        "method.response.header.Access-Control-Allow-Origin": True,
                        "method.response.header.Access-Control-Allow-Methods": True,
                    }
                )
            ]
        )
        
        # Create Lambda function to invoke agent (proxy for frontend)
        invoke_agent_lambda = lambda_.Function(
            self,
            "InvokeAgentLambda",
            function_name="invoke-bedrock-agent",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            log_retention=logs.RetentionDays.ONE_WEEK,
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/invoke_agent")),
            timeout=Duration.seconds(60),
            memory_size=512,
        )
        
        # Grant Bedrock permissions
        invoke_agent_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "bedrock-agentcore:*",
                ],
                resources=["*"],
            )
        )
        
        # Create Lambda integration for agent invocation
        invoke_agent_integration = apigateway.LambdaIntegration(
            invoke_agent_lambda,
            proxy=True,
        )
        
        # Create /invoke resource
        invoke_resource = api.root.add_resource("invoke")
        
        # Add POST method (no API key required for invoking)
        invoke_resource.add_method(
            "POST",
            invoke_agent_integration,
            api_key_required=False,
        )
        
        # Add CORS OPTIONS method for invoke
        invoke_resource.add_method(
            "OPTIONS",
            apigateway.MockIntegration(
                integration_responses=[
                    apigateway.IntegrationResponse(
                        status_code="200",
                        response_parameters={
                            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                            "method.response.header.Access-Control-Allow-Origin": "'*'",
                            "method.response.header.Access-Control-Allow-Methods": "'POST,OPTIONS'"
                        }
                    )
                ],
                passthrough_behavior=apigateway.PassthroughBehavior.NEVER,
                request_templates={
                    "application/json": '{"statusCode": 200}'
                }
            ),
            method_responses=[
                apigateway.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Headers": True,
                        "method.response.header.Access-Control-Allow-Origin": True,
                        "method.response.header.Access-Control-Allow-Methods": True,
                    }
                )
            ]
        )
        
        # Create DynamoDB table for agent configurations (runtime config)
        agent_config_table = dynamodb.Table(
            self,
            "AgentConfigTable",
            table_name="agent-configurations",
            partition_key=dynamodb.Attribute(
                name="tenantId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="agentRuntimeId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        # Create DynamoDB table to store agent deployment details
        # Using composite key to support multiple agents per tenant
        agent_details_table = dynamodb.Table(
            self,
            "AgentDetailsTable",
            table_name="agent-details-v2",  # New table name to allow key structure change
            partition_key=dynamodb.Attribute(
                name="tenantId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="agentRuntimeId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        # Create Lambda function to get agent details by tenant ID from DynamoDB
        get_agent_lambda = lambda_.Function(
            self,
            "GetAgentLambda",
            function_name="get-agent-details",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            log_retention=logs.RetentionDays.ONE_WEEK,
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/get_agent_details")),
            timeout=Duration.seconds(30),
            memory_size=256,
            environment={
                "AGENT_DETAILS_TABLE_NAME": agent_details_table.table_name,
            },
        )
        
        # Grant DynamoDB read permissions
        agent_details_table.grant_read_data(get_agent_lambda)
        
        # Grant DynamoDB write permissions to build-deploy lambda
        agent_details_table.grant_write_data(build_deploy_agent_lambda)
        
        # Grant DynamoDB read/write permissions for agent configurations table
        agent_config_table.grant_read_write_data(build_deploy_agent_lambda)
        
        # Create Lambda integration
        get_agent_integration = apigateway.LambdaIntegration(
            get_agent_lambda,
            proxy=True,
        )
        
        # Create /agent resource
        agent_resource = api.root.add_resource("agent")
        
        # Add GET method
        agent_resource.add_method(
            "GET",
            get_agent_integration,
            api_key_required=False,
        )
        
        # Create Lambda function to list all agents from DynamoDB
        list_agents_lambda = lambda_.Function(
            self,
            "ListAgentsLambda",
            function_name="list-agents",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/list_agents")),
            timeout=Duration.seconds(30),
            log_retention=logs.RetentionDays.ONE_WEEK,
            memory_size=256,
            environment={
                "AGENT_DETAILS_TABLE_NAME": agent_details_table.table_name,
            },
        )
        
        # Grant DynamoDB read permissions
        agent_details_table.grant_read_data(list_agents_lambda)
        
        # Create Lambda integration
        list_agents_integration = apigateway.LambdaIntegration(
            list_agents_lambda,
            proxy=True,
        )
        
        # Create /agents resource
        agents_resource = api.root.add_resource("agents")
        
        # Add GET method
        agents_resource.add_method(
            "GET",
            list_agents_integration,
            api_key_required=False,
        )
        
        # Add CORS OPTIONS method
        agents_resource.add_method(
            "OPTIONS",
            apigateway.MockIntegration(
                integration_responses=[
                    apigateway.IntegrationResponse(
                        status_code="200",
                        response_parameters={
                            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                            "method.response.header.Access-Control-Allow-Origin": "'*'",
                            "method.response.header.Access-Control-Allow-Methods": "'GET,OPTIONS'"
                        }
                    )
                ],
                passthrough_behavior=apigateway.PassthroughBehavior.NEVER,
                request_templates={
                    "application/json": '{"statusCode": 200}'
                }
            ),
            method_responses=[
                apigateway.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Headers": True,
                        "method.response.header.Access-Control-Allow-Origin": True,
                        "method.response.header.Access-Control-Allow-Methods": True,
                    }
                )
            ]
        )
        
        # Create Lambda function to delete an agent
        delete_agent_lambda = lambda_.Function(
            self,
            "DeleteAgentLambda",
            function_name="delete-agent",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            log_retention=logs.RetentionDays.ONE_WEEK,
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/delete_agent")),
            timeout=Duration.seconds(60),
            memory_size=256,
            environment={
                "AGENT_DETAILS_TABLE_NAME": agent_details_table.table_name,
            },
        )
        
        # Grant DynamoDB read/write permissions
        agent_details_table.grant_read_write_data(delete_agent_lambda)
        
        # Grant Bedrock permissions to delete agent runtime
        delete_agent_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "bedrock-agentcore:DeleteAgentRuntime",
                    "bedrock-agentcore:GetAgentRuntime",
                ],
                resources=["*"],
            )
        )
        
        # Create Lambda integration
        delete_agent_integration = apigateway.LambdaIntegration(
            delete_agent_lambda,
            proxy=True,
        )
        
        # Add DELETE method to /agent resource
        agent_resource.add_method(
            "DELETE",
            delete_agent_integration,
            api_key_required=False,
        )
        
        # Update CORS OPTIONS method for /agent to include DELETE
        agent_resource.add_method(
            "OPTIONS",
            apigateway.MockIntegration(
                integration_responses=[
                    apigateway.IntegrationResponse(
                        status_code="200",
                        response_parameters={
                            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                            "method.response.header.Access-Control-Allow-Origin": "'*'",
                            "method.response.header.Access-Control-Allow-Methods": "'GET,DELETE,OPTIONS'"
                        }
                    )
                ],
                passthrough_behavior=apigateway.PassthroughBehavior.NEVER,
                request_templates={
                    "application/json": '{"statusCode": 200}'
                }
            ),
            method_responses=[
                apigateway.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Headers": True,
                        "method.response.header.Access-Control-Allow-Origin": True,
                        "method.response.header.Access-Control-Allow-Methods": True,
                    }
                )
            ]
        )
        
        # Create Lambda function to update agent runtime configuration
        update_config_lambda = lambda_.Function(
            self,
            "UpdateConfigLambda",
            function_name="update-agent-config",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            log_retention=logs.RetentionDays.ONE_WEEK,
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/update_agent_config")),
            timeout=Duration.seconds(30),
            memory_size=256,
            environment={
                "AGENT_CONFIG_TABLE_NAME": agent_config_table.table_name,
            },
        )
        
        # Grant DynamoDB read/write permissions
        agent_config_table.grant_read_write_data(update_config_lambda)
        
        # Create Lambda integration
        update_config_integration = apigateway.LambdaIntegration(
            update_config_lambda,
            proxy=True,
        )
        
        # Create /config resource
        config_resource = api.root.add_resource("config")
        
        # Add GET and PUT methods
        config_resource.add_method(
            "GET",
            update_config_integration,
            api_key_required=False,
        )
        
        config_resource.add_method(
            "PUT",
            update_config_integration,
            api_key_required=False,
        )
        
        # Add CORS OPTIONS method
        config_resource.add_method(
            "OPTIONS",
            apigateway.MockIntegration(
                integration_responses=[
                    apigateway.IntegrationResponse(
                        status_code="200",
                        response_parameters={
                            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                            "method.response.header.Access-Control-Allow-Origin": "'*'",
                            "method.response.header.Access-Control-Allow-Methods": "'GET,PUT,OPTIONS'"
                        }
                    )
                ],
                passthrough_behavior=apigateway.PassthroughBehavior.NEVER,
                request_templates={
                    "application/json": '{"statusCode": 200}'
                }
            ),
            method_responses=[
                apigateway.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Headers": True,
                        "method.response.header.Access-Control-Allow-Origin": True,
                        "method.response.header.Access-Control-Allow-Methods": True,
                    }
                )
            ]
        )
        
        # Step 8: Create S3 bucket and CloudFront for frontend hosting
        frontend_bucket = s3.Bucket(
            self,
            "FrontendBucket",
            bucket_name=f"bedrock-agent-dashboard-{account_id}",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        
        # Create Origin Access Identity for CloudFront
        oai = cloudfront.OriginAccessIdentity(
            self,
            "FrontendOAI",
            comment="OAI for Bedrock Agent Dashboard"
        )
        
        # Grant CloudFront read access to the bucket
        frontend_bucket.grant_read(oai)
        
        # CloudFront distribution
        distribution = cloudfront.Distribution(
            self,
            "FrontendDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3Origin(
                    frontend_bucket,
                    origin_access_identity=oai
                ),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            ),
            default_root_object="index.html",
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                ),
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                )
            ],
        )
        
        # Deploy frontend files (if they exist)
        # Note: Run 'cd frontend && npm install && npm run build' before deploying
        try:
            frontend_deployment = s3_deployment.BucketDeployment(
                self,
                "DeployFrontend",
                sources=[s3_deployment.Source.asset(os.path.join(PROJECT_ROOT, "frontend/build"))],
                destination_bucket=frontend_bucket,
                distribution=distribution,
                distribution_paths=["/*"],
            )
        except:
            print("Frontend build not found. Run 'cd frontend && npm install && npm run build' to build the frontend.")
            frontend_deployment = None
        
        # Create Lambda function to inject config into frontend
        config_injector_lambda = lambda_.Function(
            self,
            "ConfigInjectorLambda",
            function_name="frontend-config-injector",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            code=lambda_.Code.from_asset(os.path.join(CDK_APP_DIR, "lambda_functions/config_injector")),
            timeout=Duration.seconds(60),
            log_retention=logs.RetentionDays.ONE_WEEK,
            memory_size=256,
            environment={
                "API_ENDPOINT": api.url,
                "API_KEY_ID": api_key.key_id,
                "FRONTEND_BUCKET": frontend_bucket.bucket_name,
                "DISTRIBUTION_ID": distribution.distribution_id,
            },
        )
        
        # Grant permissions to read API key and write to S3
        config_injector_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=["apigateway:GET"],
                resources=[f"arn:aws:apigateway:{region}::/apikeys/{api_key.key_id}"],
            )
        )
        frontend_bucket.grant_write(config_injector_lambda)
        
        # Grant CloudFront invalidation permission
        config_injector_lambda.add_to_role_policy(
            iam.PolicyStatement(
                actions=["cloudfront:CreateInvalidation"],
                resources=[f"arn:aws:cloudfront::{account_id}:distribution/{distribution.distribution_id}"],
            )
        )
        
        # Create Custom Resource that runs after API and frontend are deployed
        # Using the Lambda function directly as the service token
        import time
        config_injection = CustomResource(
            self,
            "ConfigInjection",
            service_token=config_injector_lambda.function_arn,
            properties={
                "Timestamp": str(time.time())  # Force update on every deploy
            }
        )
        
        # Ensure config injection happens AFTER API and frontend deployment
        config_injection.node.add_dependency(api)
        config_injection.node.add_dependency(api_key)
        if frontend_deployment:
            config_injection.node.add_dependency(frontend_deployment)
        
        # Outputs
        cdk.CfnOutput(
            self,
            "QueueUrl",
            value=usage_queue.queue_url,
            description="SQS Queue URL",
        )
        
        cdk.CfnOutput(
            self,
            "TableName",
            value=usage_table.table_name,
            description="DynamoDB Table Name",
        )
        
        cdk.CfnOutput(
            self,
            "AggregationTableName",
            value=aggregation_table.table_name,
            description="DynamoDB Aggregation Table Name",
        )
        
        cdk.CfnOutput(
            self,
            "LambdaArn",
            value=processor_lambda.function_arn,
            description="SQS to DynamoDB Lambda Function ARN",
        )
        
        cdk.CfnOutput(
            self,
            "StreamProcessorLambdaArn",
            value=stream_processor_lambda.function_arn,
            description="DynamoDB Stream Processor Lambda ARN",
        )
        
        cdk.CfnOutput(
            self,
            "BuildDeployAgentLambdaArn",
            value=build_deploy_agent_lambda.function_arn,
            description="Build & Deploy Agent Lambda ARN (invoke to build, upload, and deploy agent)",
        )
        
        cdk.CfnOutput(
            self,
            "CodeBucket",
            value=code_bucket.bucket_name,
            description="S3 Bucket for Agent Code",
        )
        
        cdk.CfnOutput(
            self,
            "ApiEndpoint",
            value=api.url,
            description="API Gateway Endpoint URL",
        )
        
        cdk.CfnOutput(
            self,
            "ApiKeyId",
            value=api_key.key_id,
            description="API Key ID (use 'aws apigateway get-api-key --api-key <id> --include-value' to get the key)",
        )
        
        cdk.CfnOutput(
            self,
            "DeployEndpoint",
            value=f"{api.url}deploy?tenantId=<TENANT_ID>",
            description="Deploy Agent Endpoint (POST with x-api-key header)",
        )
        
        cdk.CfnOutput(
            self,
            "FrontendUrl",
            value=f"https://{distribution.distribution_domain_name}",
            description="Frontend Dashboard URL",
        )
        
        cdk.CfnOutput(
            self,
            "FrontendBucketName",
            value=frontend_bucket.bucket_name,
            description="S3 Bucket for Frontend",
        )


app = cdk.App()
BedrockAgentStack(
    app,
    "BedrockAgentStack",
    env=cdk.Environment(
        account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
        region="us-west-2"
    )
)
app.synth()
