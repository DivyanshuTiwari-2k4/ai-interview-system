import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../config/aws.js";
import logger from "../config/logger.js";

const BUCKET = process.env.S3_BUCKET_NAME || "ai-interview-chunks-741375879785-ap-southeast-2-an";

/**
 * Upload a raw buffer (media chunk) to S3
 * Key format: interviews/{sessionId}/q{questionIndex}/chunk_{NNN}.webm
 */
const uploadChunk = async ({ sessionId, questionIndex, chunkIndex, buffer, mimeType = "audio/webm" }) => {
  // Zero-pad chunk index for deterministic FFmpeg ordering
  const paddedIndex = String(chunkIndex).padStart(5, "0");
  const s3Key = `interviews/${sessionId}/q${questionIndex}/chunk_${paddedIndex}.webm`;

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: {
          sessionId,
          questionIndex: String(questionIndex),
          chunkIndex: String(chunkIndex),
          uploadedAt: new Date().toISOString(),
        },
      })
    );
    logger.debug(`Uploaded chunk to S3: ${s3Key} (${buffer.length} bytes)`);
    return { s3Key, size: buffer.length };
  } catch (err) {
    logger.error(`S3 upload failed for ${s3Key}: ${err.message}`);
    throw err;
  }
};

/**
 * Upload a merged file (post-FFmpeg)
 */
const uploadMergedFile = async ({ sessionId, questionIndex, buffer, mimeType = "audio/wav" }) => {
  const s3Key = `interviews/${sessionId}/q${questionIndex}/merged.wav`;
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    logger.info(`Uploaded merged file: ${s3Key}`);
    return { s3Key };
  } catch (err) {
    logger.error(`S3 merged upload failed: ${err.message}`);
    throw err;
  }
};

/**
 * Upload a resume PDF
 */
const uploadResume = async ({ candidateEmail, buffer, originalName }) => {
  const s3Key = `resumes/${candidateEmail}/${Date.now()}_${originalName}`;
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: "application/pdf",
      })
    );
    return { s3Key };
  } catch (err) {
    logger.error(`Resume upload failed: ${err.message}`);
    throw err;
  }
};

/**
 * Get a pre-signed URL for playback (recruiter dashboard)
 */
const getPresignedUrl = async (s3Key, expiresIn = 3600) => {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (err) {
    logger.error(`Failed to generate presigned URL for ${s3Key}: ${err.message}`);
    throw err;
  }
};

/**
 * List all chunks for a session/question (for FFmpeg ordering)
 */
const listChunks = async ({ sessionId, questionIndex }) => {
  const prefix = `interviews/${sessionId}/q${questionIndex}/chunk_`;
  try {
    const response = await s3Client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix })
    );
    const keys = (response.Contents || [])
      .map((obj) => obj.Key)
      .sort(); // Lexicographic sort = correct chunk order due to zero-padding
    logger.debug(`Listed ${keys.length} chunks for session ${sessionId} Q${questionIndex}`);
    return keys;
  } catch (err) {
    logger.error(`Failed to list chunks: ${err.message}`);
    throw err;
  }
};

/**
 * Download a file from S3 as a Buffer
 */
const downloadFile = async (s3Key) => {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: s3Key })
    );
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    logger.error(`Failed to download ${s3Key}: ${err.message}`);
    throw err;
  }
};

export {
  uploadChunk,
  uploadMergedFile,
  uploadResume,
  getPresignedUrl,
  listChunks,
  downloadFile,
};

