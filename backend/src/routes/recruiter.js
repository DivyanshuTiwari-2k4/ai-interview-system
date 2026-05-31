import express from "express";
const router = express.Router();
import AiInterview from "../models/AiInterview.js";
import { getPresignedUrl } from "../services/storageService.js";
import logger from "../config/logger.js";

// GET /api/recruiters/dashboard?email=recruiter@company.com
router.get("/dashboard", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email required" });

    const interviews = await AiInterview.find({ recruiterEmail: email })
      .select(
        "candidateName candidateEmail jobTitle status overallScore recommendation evaluationStatus " +
        "session_data.suspicious_events session_data.completedAt createdAt completionRate suspiciousEventCount"
      )
      .sort({ createdAt: -1 });

    // Summary stats
    const stats = {
      total: interviews.length,
      completed: interviews.filter((i) => i.status === "evaluated").length,
      inProgress: interviews.filter((i) => i.status === "started").length,
      invited: interviews.filter((i) => i.status === "invited").length,
      avgScore:
        interviews
          .filter((i) => i.overallScore)
          .reduce((sum, i) => sum + i.overallScore, 0) /
          Math.max(interviews.filter((i) => i.overallScore).length, 1),
    };

    res.json({ stats, interviews });
  } catch (err) {
    logger.error(`Dashboard fetch failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recruiters/interview/:id - Drill-down view
router.get("/interview/:id", async (req, res) => {
  try {
    const interview = await AiInterview.findById(req.params.id);
    if (!interview) return res.status(404).json({ error: "Not found" });

    // Generate presigned URLs for all merged recordings
    const responsesWithPlayback = await Promise.all(
      (interview.responses || []).map(async (r) => {
        let playbackUrl = null;
        if (r.mergedS3Key) {
          try { playbackUrl = await getPresignedUrl(r.mergedS3Key, 7200); } catch (_) {}
        }
        let resumeUrl = null;
        if (interview.resumeS3Key) {
          try { resumeUrl = await getPresignedUrl(interview.resumeS3Key, 7200); } catch (_) {}
        }
        return { ...r.toObject(), playbackUrl, resumeUrl };
      })
    );

    let resumeUrl = null;
    if (interview.resumeS3Key) {
      try { resumeUrl = await getPresignedUrl(interview.resumeS3Key, 7200); } catch (_) {}
    }

    res.json({
      ...interview.toObject(),
      responses: responsesWithPlayback,
      resumeUrl,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;