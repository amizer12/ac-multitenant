"""Messaging construct for SQS queues"""

from constructs import Construct
from aws_cdk import Duration, RemovalPolicy, aws_sqs as sqs


class MessagingConstruct(Construct):
    """Construct for SQS queues used in the application."""
    
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        # Token usage queue
        self.usage_queue = sqs.Queue(
            self,
            "TokenUsageQueue",
            queue_name="token-usage-queue",
            visibility_timeout=Duration.seconds(300),
            retention_period=Duration.days(1),
            removal_policy=RemovalPolicy.DESTROY,
        )
