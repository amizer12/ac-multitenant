"""Agent runtime construct for Bedrock agent IAM role"""

from constructs import Construct
from aws_cdk import aws_iam as iam, aws_sqs as sqs


class AgentRuntimeConstruct(Construct):
    """Construct for Bedrock Agent Runtime IAM role and permissions."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        region: str,
        usage_queue: sqs.Queue,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # IAM role for Bedrock Agent Runtime
        self.agent_role = iam.Role(
            self,
            "BedrockAgentRole",
            role_name=f"AmazonBedrockAgentCoreSDKRuntime-{region}",
            assumed_by=iam.ServicePrincipal("bedrock-agentcore.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "AmazonBedrockFullAccess"
                ),
            ],
        )

        # Grant agent role permission to send to SQS
        usage_queue.grant_send_messages(self.agent_role)
