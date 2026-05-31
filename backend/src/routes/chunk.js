import express from "express";
const router = express.Router();
import multer from "multer";
import { uploadChunk, listChunks } from "../services/storageService.js";
import { enqueueChunkMerge } from "../services/queueService.js";
import AiInterview from "../models/AiInterview.js";
import logger from "../config/logger.js";

// Store chunk in memory (limit 10MB per chunk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * POST /api/chunks/upload
 * Receives a raw media chunk from the frontend MediaRecorder
 */
router.post("/upload", upload.single("chunk"), async (req, res) => {
  try {
    const { sessionId, questionIndex, chunkIndex, interviewId, isFinal } = req.body;
    logger.info(`Chunk received: sessionId=${sessionId} qIdx=${questionIndex} chunkIdx=${chunkIndex} isFinal=${isFinal} type=${typeof isFinal}`);

    if (!req.file || !sessionId || chunkIndex === undefined) {
      return res.status(400).json({ error: "Missing chunk, sessionId, or chunkIndex" });
    }

    // Guard: skip empty/tiny chunks (< 100 bytes = garbage)
    if (req.file.buffer.length < 100) {
      logger.warn(`Skipped empty chunk ${chunkIndex} for session ${sessionId}`);
      return res.json({ status: "skipped", reason: "empty_chunk" });
    }

    // Upload to S3
    const { s3Key, size } = await uploadChunk({
      sessionId,
      questionIndex: parseInt(questionIndex),
      chunkIndex: parseInt(chunkIndex),
      buffer: req.file.buffer,
      mimeType: req.file.mimetype || "audio/webm",
    });

    // Persist chunk metadata to DB
    await AiInterview.findOneAndUpdate(
      { _id: interviewId, "responses.questionIndex": parseInt(questionIndex) },
      {
        $push: {
          "responses.$.chunks": {
            chunkIndex: parseInt(chunkIndex),
            s3Key,
            size,
            receivedAt: new Date(),
            status: "stored",
          },
        },
        $set: { "session_data.lastActiveAt": new Date() },
      },
      { upsert: false }
    );

    logger.debug(`Chunk stored: session=${sessionId} Q=${questionIndex} idx=${chunkIndex} size=${size}`);

    // If this is the final chunk for this question, trigger merge
    const isFinalBool = isFinal === "true" || isFinal === true || isFinal === 1 || isFinal === "1";

    if (isFinalBool) {
      logger.info(`Final chunk received for Q${questionIndex}. Enqueueing merge job.`);
      try {
        await enqueueChunkMerge({
          sessionId,
          questionIndex: parseInt(questionIndex),
          interviewId,
        });
        logger.info(`✅ Merge job enqueued for session ${sessionId} Q${questionIndex}`);
      } catch (err) {
        logger.error(`Failed to enqueue merge job: ${err.message}`);
      }
    }

    res.json({
      status: "stored",
      s3Key,
      size,
      chunkIndex: parseInt(chunkIndex),
    });
  } catch (err) {
    logger.error(`Chunk upload failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chunks/question-start
 * Called when candidate starts recording a new question
 */
router.post("/question-start", async (req, res) => {
  try {
    const { interviewId, questionIndex, questionText, questionCategory } = req.body;
    // logger.info(`Chunk received: sessionId=${sessionId} qIdx=${questionIndex} chunkIdx=${chunkIndex} isFinal=${isFinal} type=${typeof isFinal}`);

    // Add a response entry for this question
    await AiInterview.findOneAndUpdate(
      {
        _id: interviewId,
        "responses.questionIndex": { $ne: parseInt(questionIndex) },
      },
      {
        $push: {
          responses: {
            questionIndex: parseInt(questionIndex),
            questionText,
            questionCategory: questionCategory || "general",
            chunks: [],
            transcriptionStatus: "pending",
            recordingStartedAt: new Date(),
          },
        },
        $set: {
          "session_data.currentQuestionIndex": parseInt(questionIndex),
          "session_data.status": "in_progress",
          "session_data.startedAt": new Date(),
          status: "started",
        },
      }
    );

    res.json({ status: "ready", questionIndex });
  } catch (err) {
    logger.error(`Question start failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chunks/question-end
 * Called when candidate finishes answering a question
 */
router.post("/question-end", async (req, res) => {
  try {
    const { interviewId, questionIndex } = req.body;

    await AiInterview.findOneAndUpdate(
      { _id: interviewId, "responses.questionIndex": parseInt(questionIndex) },
      {
        $set: {
          "responses.$.recordingEndedAt": new Date(),
        },
      }
    );

    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;