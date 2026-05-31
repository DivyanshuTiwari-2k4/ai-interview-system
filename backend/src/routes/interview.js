import express from "express";
const router = express.Router();
import { v4 as uuidv4 } from "uuid";
import AiInterview from "../models/AiInterview.js";
import logger from "../config/logger.js";

// POST /api/interviews - Recruiter creates a new interview
router.post("/", async (req, res) => {
  try {
    const {
      candidateName,
      candidateEmail,
      candidatePhone,
      jobTitle,
      jobDescription,
      recruiterEmail,
      companyName,
      questions,
    } = req.body;

    if (!candidateName || !candidateEmail || !jobTitle || !questions?.length) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const accessToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const interview = await AiInterview.create({
      candidateName,
      candidateEmail,
      candidatePhone,
      jobTitle,
      jobDescription,
      recruiterEmail,
      companyName,
      questions: questions.map((q, i) => ({ ...q, order: i })),
      accessToken,
      expiresAt,
      session_data: {
        sessionId: uuidv4(),
        status: "hardware_check",
      },
    });

    const interviewLink = `${process.env.FRONTEND_URL}/interview/${accessToken}`;
    logger.info(`Interview created for ${candidateEmail}: ${interview._id}`);

    res.status(201).json({
      interviewId: interview._id,
      accessToken,
      interviewLink,
      expiresAt,
    });
  } catch (err) {
    logger.error(`Create interview failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/interviews/:token - Candidate loads interview by access token
router.get("/:token", async (req, res) => {
  try {
    const interview = await AiInterview.findOne({
      accessToken: req.params.token,
      expiresAt: { $gt: new Date() },
    }).select("-session_data.suspicious_events"); // Hide from candidate

    if (!interview) {
      return res.status(404).json({ error: "Interview not found or expired" });
    }

    res.json({
      interviewId: interview._id,
      sessionId: interview.session_data?.sessionId,
      candidateName: interview.candidateName,
      jobTitle: interview.jobTitle,
      companyName: interview.companyName,
      questions: interview.questions.map((q) => ({
        index: q.order,
        text: q.text,
        timeLimit: q.timeLimit,
        category: q.category,
      })),
      sessionStatus: interview.session_data?.status,
      currentQuestionIndex: interview.session_data?.currentQuestionIndex || 0,
      status: interview.status,
    });
  } catch (err) {
    logger.error(`Fetch interview failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/interviews - Recruiter lists all interviews
router.get("/", async (req, res) => {
  try {
    const { recruiterEmail, status } = req.query;
    const filter = {};
    if (recruiterEmail) filter.recruiterEmail = recruiterEmail;
    if (status) filter.status = status;

    const interviews = await AiInterview.find(filter)
      .select("candidateName candidateEmail jobTitle status overallScore recommendation createdAt")
      .sort({ createdAt: -1 });

    res.json(interviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/interviews/:id/results - Recruiter views full results
router.get("/:id/results", async (req, res) => {
  try {
    const interview = await AiInterview.findById(req.params.id);
    if (!interview) return res.status(404).json({ error: "Not found" });

    // Build response with presigned URLs for playback
    const { getPresignedUrl } = require("../services/storageService");

    const responsesWithUrls = await Promise.all(
      (interview.responses || []).map(async (r) => {
        let playbackUrl = null;
        if (r.mergedS3Key) {
          try {
            playbackUrl = await getPresignedUrl(r.mergedS3Key);
          } catch (e) {
            logger.warn(`Could not get presigned URL for ${r.mergedS3Key}`);
          }
        }
        return { ...r.toObject(), playbackUrl };
      })
    );

    res.json({
      ...interview.toObject(),
      responses: responsesWithUrls,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;