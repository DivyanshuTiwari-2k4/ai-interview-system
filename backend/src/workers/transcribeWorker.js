// transcriptionWorker.js - Cleaned and corrected version

// 1. Load environment variables FIRST
import '../config/env.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
console.log('BUCKET:', process.env.S3_BUCKET_NAME);

// 2. Import all dependencies
import mongoose from 'mongoose';
import axios from 'axios';
import logger from '../config/logger.js';

// 3. Import services and models
import { pollQueue, deleteMessage } from '../services/queueService.js';
import { transcribeFromS3Key } from '../services/transcriptionService.js';
import AiInterview from '../models/AiInterview.js';

// 4. Worker logic goes here

const TRANSCRIPTION_QUEUE_URL = process.env.TRANSCRIPTION_QUEUE_URL;

mongoose.connect(process.env.MONGODB_URI).then(() => {
  logger.info("Transcription Worker: MongoDB connected");
  startPolling();
});

// ── AI Evaluation via Claude API ────────────────────────────────────────────

const evaluateResponse = async (questionText, transcript, questionCategory) => {
   // Skip if no Anthropic key configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return { technical: null, communication: null, relevance: null, overall: null, feedback: null };
  }
  try {
    const prompt = `You are evaluating a candidate's interview response.

Question: "${questionText}"
Category: ${questionCategory}
Candidate's Response (transcript): "${transcript}"

Score the response on these dimensions (0-10 each):
1. technical: Technical accuracy and depth
2. communication: Clarity and articulation
3. relevance: How well it answers the question
4. overall: Overall quality

Also provide 2-3 sentences of constructive feedback.

Respond ONLY with valid JSON:
{
  "technical": <number>,
  "communication": <number>,
  "relevance": <number>,
  "overall": <number>,
  "feedback": "<string>"
}`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
      }
    );

    const text = response.data.content[0].text;
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    logger.error(`AI evaluation failed: ${err.message}`);
    return { technical: 0, communication: 0, relevance: 0, overall: 0, feedback: "Evaluation failed." };
  }
};

// ── Overall interview evaluation ────────────────────────────────────────────

const evaluateInterview = async (interview) => {
  // Skip if no Anthropic key configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return;
  }
  try {
    const completedResponses = interview.responses.filter(
      (r) => r.transcriptionStatus === "completed" && r.transcription
    );

    if (completedResponses.length === 0) return;

    const summaryText = completedResponses
      .map((r, i) => `Q${i + 1}: ${r.questionText}\nA: ${r.transcription}`)
      .join("\n\n");

    const prompt = `You are a hiring manager reviewing a complete interview.

Job Title: ${interview.jobTitle}
Candidate: ${interview.candidateName}

Interview Transcript:
${summaryText}

Provide an overall assessment with:
1. overallScore (0-100)
2. recommendation: one of "strong_yes", "yes", "maybe", "no", "strong_no"
3. overallFeedback: 3-4 sentence summary

Respond ONLY with valid JSON:
{"overallScore": <number>, "recommendation": "<string>", "overallFeedback": "<string>"}`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
      }
    );

    const text = response.data.content[0].text;
    const result = JSON.parse(text.replace(/```json|```/g, "").trim());

    await AiInterview.findByIdAndUpdate(interview._id, {
      overallScore: result.overallScore,
      recommendation: result.recommendation,
      overallFeedback: result.overallFeedback,
      evaluationStatus: "completed",
      status: "evaluated",
    });

    logger.info(`✅ Interview ${interview._id} fully evaluated. Score: ${result.overallScore}`);
  } catch (err) {
    logger.error(`Overall evaluation failed: ${err.message}`);
    await AiInterview.findByIdAndUpdate(interview._id, { evaluationStatus: "failed" });
  }
};

// ── Process a single transcription job ─────────────────────────────────────

const processTranscription = async ({ sessionId, questionIndex, mergedS3Key, interviewId }) => {
  logger.info(`Transcribing session ${sessionId} Q${questionIndex}`);

  // 1. Transcribe
  const { transcript, confidence } = await transcribeFromS3Key(mergedS3Key);

  // 2. AI score this response
  const interview = await AiInterview.findById(interviewId);
  const question = interview?.questions?.[questionIndex];

  let aiScore = null;
  let aiFeedback = null;

  if (question && transcript) {
    const evaluation = await evaluateResponse(question.text, transcript, question.category);
    aiScore = {
      technical: evaluation.technical,
      communication: evaluation.communication,
      relevance: evaluation.relevance,
      overall: evaluation.overall,
    };
    aiFeedback = evaluation.feedback;
  }

  // 3. Update DB
  await AiInterview.findOneAndUpdate(
    { _id: interviewId, "responses.questionIndex": questionIndex },
    {
      $set: {
        "responses.$.transcription": transcript,
        "responses.$.transcriptionStatus": "completed",
        "responses.$.aiScore": aiScore,
        "responses.$.aiFeedback": aiFeedback,
      },
    }
  );

  // 4. Check if ALL questions are transcribed → trigger overall evaluation
  const updated = await AiInterview.findById(interviewId);
  const allDone = updated.responses.every(
    (r) => r.transcriptionStatus === "completed" || r.transcriptionStatus === "failed"
  );

  if (allDone && updated.status !== "evaluated") {
    await AiInterview.findByIdAndUpdate(interviewId, { evaluationStatus: "processing" });
    await evaluateInterview(updated);
  }
};

const processMessage = async (message) => {
  const job = JSON.parse(message.Body);

  try {
    if (job.jobType === "TRANSCRIPTION") {
      await processTranscription(job);
    }
    await deleteMessage(TRANSCRIPTION_QUEUE_URL, message.ReceiptHandle);
  } catch (err) {
    logger.error(`Transcription job failed: ${err.message}`);
  }
};

const startPolling = async () => {
  logger.info("📝 Transcription Worker started. Polling SQS...");
  while (true) {
    try {
      const messages = await pollQueue(TRANSCRIPTION_QUEUE_URL, 5);
      if (messages.length > 0) {
        await Promise.all(messages.map(processMessage));
      }
    } catch (err) {
      logger.error(`Poll error: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
};