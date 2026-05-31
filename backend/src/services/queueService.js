import { SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { sqsClient } from "../config/aws.js";
import logger from "../config/logger.js";

/**
 * Enqueue a job to merge audio chunks via FFmpeg
 */
const enqueueChunkMerge = async ({ sessionId, questionIndex, interviewId }) => {
  const payload = {
    jobType: "CHUNK_MERGE",
    sessionId,
    questionIndex,
    interviewId,
    enqueuedAt: new Date().toISOString(),
  };

  try {
    const result = await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: process.env.AUDIO_MERGE_QUEUE_URL,
        MessageBody: JSON.stringify(payload),
        MessageGroupId: sessionId, // FIFO queue - group per session
        MessageDeduplicationId: `${sessionId}_q${questionIndex}_${Date.now()}`,
      })
    );
    logger.info(`Enqueued CHUNK_MERGE job for session ${sessionId} Q${questionIndex}: ${result.MessageId}`);
    return result.MessageId;
  } catch (err) {
    logger.error(`Failed to enqueue merge job: ${err.message}`);
    throw err;
  }
};

/**
 * Enqueue a transcription job (post-merge)
 */
const enqueueTranscription = async ({ sessionId, questionIndex, mergedS3Key, interviewId }) => {
  const payload = {
    jobType: "TRANSCRIPTION",
    sessionId,
    questionIndex,
    mergedS3Key,
    interviewId,
    enqueuedAt: new Date().toISOString(),
  };

  try {
    const result = await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: process.env.TRANSCRIPTION_QUEUE_URL,
        MessageBody: JSON.stringify(payload),
        MessageGroupId: sessionId,
        MessageDeduplicationId: `${sessionId}_q${questionIndex}_transcribe_${Date.now()}`,
      })
    );
    logger.info(`Enqueued TRANSCRIPTION job: ${result.MessageId}`);
    return result.MessageId;
  } catch (err) {
    logger.error(`Failed to enqueue transcription job: ${err.message}`);
    throw err;
  }
};

/**
 * Enqueue final AI evaluation (all questions transcribed)
 */
const enqueueEvaluation = async ({ interviewId }) => {
  const payload = {
    jobType: "EVALUATION",
    interviewId,
    enqueuedAt: new Date().toISOString(),
  };

  try {
    const result = await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: process.env.TRANSCRIPTION_QUEUE_URL, // Reuse same queue
        MessageBody: JSON.stringify(payload),
        MessageGroupId: interviewId,
        MessageDeduplicationId: `${interviewId}_eval_${Date.now()}`,
      })
    );
    logger.info(`Enqueued EVALUATION job for interview ${interviewId}`);
    return result.MessageId;
  } catch (err) {
    logger.error(`Failed to enqueue evaluation job: ${err.message}`);
    throw err;
  }
};

/**
 * Poll SQS for messages (used by workers)
 */
const pollQueue = async (queueUrl, maxMessages = 1) => {
  try {
    const response = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: 20, // Long polling
        VisibilityTimeout: 300, // 5 minutes to process
      })
    );
    return response.Messages || [];
  } catch (err) {
    logger.error(`Failed to poll queue: ${err.message}`);
    return [];
  }
};

/**
 * Delete a processed message from SQS
 */
const deleteMessage = async (queueUrl, receiptHandle) => {
  try {
    await sqsClient.send(
      new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle })
    );
  } catch (err) {
    logger.error(`Failed to delete SQS message: ${err.message}`);
  }
};

export {
  enqueueChunkMerge,
  enqueueTranscription,
  enqueueEvaluation,
  pollQueue,
  deleteMessage,
};
