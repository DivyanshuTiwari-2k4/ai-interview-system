// worker.js - Cleaned and corrected version

// 1. Load environment variables FIRST
import '../config/env.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
console.log('BUCKET:', process.env.S3_BUCKET_NAME);

// 2. Now import all dependencies
import fs from 'fs';
import os from 'os';
import mongoose from 'mongoose';
import ffmpeg from 'fluent-ffmpeg';
import logger from '../config/logger.js';

// 3. Import services and models
import { pollQueue, deleteMessage, enqueueTranscription } from '../services/queueService.js';
import { listChunks, downloadFile, uploadMergedFile } from '../services/storageService.js';
import AiInterview from '../models/AiInterview.js';

// 4. Worker logic goes here
const MERGE_QUEUE_URL = process.env.AUDIO_MERGE_QUEUE_URL;
const POLL_INTERVAL_MS = 5000;

// Connect DB
mongoose.connect(process.env.MONGODB_URI).then(() => {
  logger.info("Merge Worker: MongoDB connected");
  startPolling();
});

const mergeChunks = async ({ sessionId, questionIndex, interviewId }) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `merge_${sessionId}_q${questionIndex}_`));

  try {
    // 1. List all chunks from S3 (sorted by key = sorted by index)
    const chunkKeys = await listChunks({ sessionId, questionIndex });

    if (chunkKeys.length === 0) {
      logger.warn(`No chunks found for session ${sessionId} Q${questionIndex}`);
      return null;
    }

    logger.info(`Merging ${chunkKeys.length} chunks for session ${sessionId} Q${questionIndex}`);

    // 2. Download all chunks to tmp directory
    const localChunkPaths = [];
    for (let i = 0; i < chunkKeys.length; i++) {
      const buffer = await downloadFile(chunkKeys[i]);
      const localPath = path.join(tmpDir, `chunk_${String(i).padStart(5, "0")}.webm`);
      fs.writeFileSync(localPath, buffer);
      localChunkPaths.push(localPath);
    }

    // 3. Write FFmpeg concat list
    const concatListPath = path.join(tmpDir, "concat.txt");
    const concatContent = localChunkPaths.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    // 4. FFmpeg merge: webm chunks → WAV
    const outputPath = path.join(tmpDir, "merged.wav");
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .audioCodec("pcm_s16le")
        .audioFrequency(16000)
        .audioChannels(1)
        .output(outputPath)
        .on("start", (cmd) => logger.debug(`FFmpeg started: ${cmd}`))
        .on("progress", (p) => logger.debug(`FFmpeg progress: ${p.percent?.toFixed(1)}%`))
        .on("end", resolve)
        .on("error", (err) => {
          logger.error(`FFmpeg error: ${err.message}`);
          reject(err);
        })
        .run();
    });

    // 5. Upload merged WAV to S3
    const mergedBuffer = fs.readFileSync(outputPath);
    const { s3Key: mergedS3Key } = await uploadMergedFile({
      sessionId,
      questionIndex,
      buffer: mergedBuffer,
    });

    // 6. Update DB: set mergedS3Key and transcription status to processing
    await AiInterview.findOneAndUpdate(
      { _id: interviewId, "responses.questionIndex": questionIndex },
      {
        $set: {
          "responses.$.mergedS3Key": mergedS3Key,
          "responses.$.transcriptionStatus": "processing",
        },
      }
    );

    // 7. Enqueue transcription job
    await enqueueTranscription({ sessionId, questionIndex, mergedS3Key, interviewId });

    logger.info(`✅ Merge complete for session ${sessionId} Q${questionIndex}`);
    return mergedS3Key;
  } finally {
    // Clean up tmp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      logger.warn(`Failed to clean tmp dir: ${e.message}`);
    }
  }
};

const processMessage = async (message) => {
  const job = JSON.parse(message.Body);
  logger.info(`Processing merge job: ${JSON.stringify(job)}`);

  try {
    await mergeChunks(job);
    await deleteMessage(MERGE_QUEUE_URL, message.ReceiptHandle);
  } catch (err) {
    logger.error(`Merge job failed: ${err.message}. Message will retry.`);
    // Don't delete - SQS will retry after visibility timeout
  }
};

const startPolling = async () => {
  logger.info("🎬 Merge Worker started. Polling SQS...");
  while (true) {
    try {
      const messages = await pollQueue(MERGE_QUEUE_URL, 5);
      if (messages.length > 0) {
        await Promise.all(messages.map(processMessage));
      }
    } catch (err) {
      logger.error(`Poll error: ${err.message}`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
};