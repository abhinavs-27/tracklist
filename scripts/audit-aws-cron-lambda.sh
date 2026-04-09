#!/usr/bin/env bash
# Audit: EventBridge → SQS → Lambda for Tracklist crons.
# Cron rules target the CRON QUEUE ARN, not the Lambda ARN (grep for Lambda name will always fail for those).
set -euo pipefail

REGION="${REGION:-us-east-2}"
ACCOUNT_ID="${ACCOUNT_ID:-437258425098}"
LAMBDA_NAME="${LAMBDA_NAME:-billboard-worker}"
CRON_QUEUE_NAME="${CRON_QUEUE_NAME:-tracklist-cron-jobs}"
BILLBOARD_QUEUE_NAME="${BILLBOARD_QUEUE_NAME:-billboard-jobs}"

CRON_QUEUE_ARN="arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${CRON_QUEUE_NAME}"
BILLBOARD_QUEUE_ARN="arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${BILLBOARD_QUEUE_NAME}"

echo "=== Region: $REGION | Lambda: $LAMBDA_NAME ==="
echo ""

echo "=== 1) EventBridge scheduled rules (tracklist-*) ==="
aws events list-rules --region "$REGION" --name-prefix tracklist --query 'Rules[?ScheduleExpression!=null].[Name,ScheduleExpression,State]' --output table
echo ""

echo "=== 2) Each rule must target SQS cron queue OR (optional) Lambda for billboard fan-out ==="
RULES=$(aws events list-rules --region "$REGION" --name-prefix tracklist --query 'Rules[?ScheduleExpression!=null].Name' --output text)
for RULE in $RULES; do
  echo "--- $RULE ---"
  TARGET_ARNS=$(aws events list-targets-by-rule --rule "$RULE" --region "$REGION" --query 'Targets[].Arn' --output text)
  INPUT=$(aws events list-targets-by-rule --rule "$RULE" --region "$REGION" --query 'Targets[0].Input' --output text)
  echo "Targets: $TARGET_ARNS"
  echo "Input:   $INPUT"
  if echo "$TARGET_ARNS" | grep -q "$CRON_QUEUE_ARN"; then
    echo "OK: targets cron queue"
  elif echo "$TARGET_ARNS" | grep -q ":function:${LAMBDA_NAME}"; then
    echo "OK: targets Lambda (e.g. weekly billboard fan-out)"
  else
    echo "WARN: unexpected target(s)"
  fi
  echo ""
done

echo "=== 3) Lambda must have event source mapping for BOTH queues (cron + billboard jobs) ==="
aws lambda list-event-source-mappings --function-name "$LAMBDA_NAME" --region "$REGION" \
  --query 'EventSourceMappings[].{Queue:EventSourceArn,State:State,BatchSize:BatchSize}' --output table

echo ""
echo "=== 4) Parity with lib/jobs/run-job.ts (CronJobMessage types) ==="
echo "CloudFormation should emit one rule per: REFRESH_STATS, COMPUTE_COOCCURRENCE, LASTFM_SYNC,"
echo "TASTE_IDENTITY_REFRESH, COMMUNITY_FEATURE_WEEKLY, BILLBOARD_WEEKLY_EMAIL, LISTENING_AGGREGATES,"
echo "REPAIR_LASTFM_AGGREGATES, UPGRADE_LASTFM_ALBUM_COVERS — see infra/aws/cloudformation/tracklist-jobs.yaml"
echo ""
echo "Done."
