"""Frontend hosting construct for S3 and CloudFront"""

import os
import time
from constructs import Construct
from aws_cdk import (
    Duration,
    RemovalPolicy,
    CustomResource,
    aws_s3 as s3,
    aws_s3_deployment as s3_deployment,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_lambda as lambda_,
    aws_iam as iam,
    aws_logs as logs,
    aws_apigateway as apigateway,
)


class FrontendConstruct(Construct):
    """Construct for frontend hosting with S3, CloudFront, and config injection."""
    
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        account_id: str,
        region: str,
        project_root: str,
        cdk_app_dir: str,
        api: apigateway.RestApi,
        api_key: apigateway.ApiKey,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        # S3 bucket for frontend
        self.bucket = s3.Bucket(
            self,
            "FrontendBucket",
            bucket_name=f"bedrock-agent-dashboard-{account_id}",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        
        # Origin Access Identity for CloudFront
        oai = cloudfront.OriginAccessIdentity(
            self,
            "FrontendOAI",
            comment="OAI for Bedrock Agent Dashboard"
        )
        self.bucket.grant_read(oai)
        
        # CloudFront distribution
        self.distribution = cloudfront.Distribution(
            self,
            "FrontendDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3Origin(self.bucket, origin_access_identity=oai),
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
        frontend_deployment = None
        try:
            frontend_deployment = s3_deployment.BucketDeployment(
                self,
                "DeployFrontend",
                sources=[s3_deployment.Source.asset(os.path.join(project_root, "frontend/dist"))],
                destination_bucket=self.bucket,
                distribution=self.distribution,
                distribution_paths=["/*"],
            )
        except Exception:
            print("Frontend build not found. Run 'cd frontend && npm install && npm run build' to build the frontend.")
        
        # Config injector Lambda
        config_injector_log_group = logs.LogGroup(
            self,
            "ConfigInjectorLogGroup",
            log_group_name="/aws/lambda/frontend-config-injector",
            retention=logs.RetentionDays.ONE_WEEK,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        config_injector = lambda_.Function(
            self,
            "ConfigInjectorLambda",
            function_name="frontend-config-injector",
            runtime=lambda_.Runtime.PYTHON_3_10,
            handler="handler.lambda_handler",
            code=lambda_.Code.from_asset(os.path.join(cdk_app_dir, "lambda_functions/config_injector")),
            timeout=Duration.seconds(60),
            log_group=config_injector_log_group,
            memory_size=256,
            environment={
                "API_ENDPOINT": api.url,
                "API_KEY_ID": api_key.key_id,
                "FRONTEND_BUCKET": self.bucket.bucket_name,
                "DISTRIBUTION_ID": self.distribution.distribution_id,
            },
        )
        
        # Grant permissions
        config_injector.add_to_role_policy(
            iam.PolicyStatement(
                actions=["apigateway:GET"],
                resources=[f"arn:aws:apigateway:{region}::/apikeys/{api_key.key_id}"],
            )
        )
        self.bucket.grant_write(config_injector)
        config_injector.add_to_role_policy(
            iam.PolicyStatement(
                actions=["cloudfront:CreateInvalidation"],
                resources=[f"arn:aws:cloudfront::{account_id}:distribution/{self.distribution.distribution_id}"],
            )
        )
        
        # Custom Resource for config injection
        config_injection = CustomResource(
            self,
            "ConfigInjection",
            service_token=config_injector.function_arn,
            properties={"Timestamp": str(time.time())}
        )
        config_injection.node.add_dependency(api)
        config_injection.node.add_dependency(api_key)
        if frontend_deployment:
            config_injection.node.add_dependency(frontend_deployment)
