import express from "express";
const router = express.Router();
import AiInterview from "../models/AiInterview.js";
import logger from "../config/logger.js";

// POST /api/sessions/hardware-check-passed
router.post("/hardware-check-passed", async (req, res) => {
  try {
    const { interviewId, sessionId, userAgent, ipAddress } = req.body;

    await AiInterview.findByIdAndUpdate(interviewId, {
      $set: {
        "session_data.hardwareCheckPassed": true,
        "session_data.status": "instructions",
        "session_data.userAgent": userAgent,
        "session_data.ipAddress": ipAddress || req.ip,
        "session_data.lastActiveAt": new Date(),
      },
    });

    res.json({ status: "ok" });
  } catch (err) {
    logger.error(`Hardware check update failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/start
router.post("/start", async (req, res) => {
  try {
    const { interviewId } = req.body;

    await AiInterview.findByIdAndUpdate(interviewId, {
      $set: {
        "session_data.status": "in_progress",
        "session_data.startedAt": new Date(),
        status: "started",
      },
    });

    res.json({ status: "started" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/complete
router.post("/complete", async (req, res) => {
  try {
    const { interviewId } = req.body;

    await AiInterview.findByIdAndUpdate(interviewId, {
      $set: {
        "session_data.status": "completed",
        "session_data.completedAt": new Date(),
        status: "processing",
      },
    });

    logger.info(`Session completed: ${interviewId}`);
    res.json({ status: "processing" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:interviewId/resume
// Allows candidate to resume if they were disconnected
router.get("/:interviewId/resume", async (req, res) => {
  try {
    const interview = await AiInterview.findById(req.params.interviewId).select(
      "session_data.currentQuestionIndex session_data.status status questions responses"
    );

    if (!interview) return res.status(404).json({ error: "Not found" });

    // Only allow resume if not completed
    if (["completed", "processing", "evaluated"].includes(interview.status)) {
      return res.json({ canResume: false, reason: "Interview already completed" });
    }

    const answeredIndices = new Set(interview.responses?.map((r) => r.questionIndex) || []);

    res.json({
      canResume: true,
      currentQuestionIndex: interview.session_data?.currentQuestionIndex || 0,
      answeredQuestions: [...answeredIndices],
      sessionStatus: interview.session_data?.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;