import mongoose from "mongoose";

// ── Sub-schemas ────────────────────────────────────────────────────────────

const SuspiciousEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["TAB_SWITCH", "FACE_ABSENCE", "MULTIPLE_FACES", "AUDIO_SPIKE", "SCREEN_SHARE"],
    },
    timestamp: { type: Date, default: Date.now },
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    duration: Number,   // ms (for face_absence)
    faceCount: Number,  // for multiple_faces
    metadata: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const ChunkSchema = new mongoose.Schema(
  {
    chunkIndex: { type: Number, required: true },
    s3Key: { type: String, required: true },
    size: Number,        // bytes
    duration: Number,   // ms
    receivedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["stored", "merged", "failed"], default: "stored" },
  },
  { _id: false }
);

const QuestionResponseSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true },
    questionText: { type: String, required: true },
    questionCategory: { type: String, enum: ["technical", "behavioral", "situational", "general"] },
    chunks: [ChunkSchema],
    mergedS3Key: String,
    transcription: String,
    transcriptionStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    aiScore: {
      technical: { type: Number, min: 0, max: 10 },
      communication: { type: Number, min: 0, max: 10 },
      relevance: { type: Number, min: 0, max: 10 },
      overall: { type: Number, min: 0, max: 10 },
    },
    aiFeedback: String,
    recordingStartedAt: Date,
    recordingEndedAt: Date,
    durationMs: Number,
  },
  { _id: false }
);

const SessionDataSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    currentQuestionIndex: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["hardware_check", "instructions", "in_progress", "paused", "completed"],
      default: "hardware_check",
    },
    suspicious_events: [SuspiciousEventSchema],
    hardwareCheckPassed: { type: Boolean, default: false },
    startedAt: Date,
    completedAt: Date,
    lastActiveAt: { type: Date, default: Date.now },
    userAgent: String,
    ipAddress: String,
  },
  { _id: false }
);

// ── Main Schema ────────────────────────────────────────────────────────────

const AiInterviewSchema = new mongoose.Schema(
  {
    // Candidate info
    candidateName: { type: String, required: true },
    candidateEmail: { type: String, required: true, lowercase: true },
    candidatePhone: String,
    resumeS3Key: String,

    // Job context
    jobTitle: { type: String, required: true },
    jobDescription: String,
    recruiterEmail: String,
    companyName: String,

    // Interview questions
    questions: [
      {
        text: { type: String, required: true },
        category: { type: String, enum: ["technical", "behavioral", "situational", "general"] },
        timeLimit: { type: Number, default: 120 }, // seconds
        order: Number,
      },
    ],

    // Responses keyed by question index
    responses: [QuestionResponseSchema],

    // Central session brain
    session_data: SessionDataSchema,

    // Overall interview status
    status: {
      type: String,
      enum: ["invited", "started", "processing", "completed", "evaluated", "expired"],
      default: "invited",
    },

    // Final AI evaluation
    overallScore: { type: Number, min: 0, max: 100 },
    overallFeedback: String,
    recommendation: {
      type: String,
      enum: ["strong_yes", "yes", "maybe", "no", "strong_no"],
    },
    evaluationStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },

    // Interview link (UUID token)
    accessToken: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────

AiInterviewSchema.index({ accessToken: 1 });
AiInterviewSchema.index({ candidateEmail: 1 });
AiInterviewSchema.index({ recruiterEmail: 1 });
AiInterviewSchema.index({ status: 1 });
AiInterviewSchema.index({ "session_data.sessionId": 1 });

// ── Virtuals ───────────────────────────────────────────────────────────────

AiInterviewSchema.virtual("suspiciousEventCount").get(function () {
  return this.session_data?.suspicious_events?.length || 0;
});

AiInterviewSchema.virtual("completionRate").get(function () {
  if (!this.questions?.length) return 0;
  const answered = this.responses?.filter((r) => r.transcriptionStatus === "completed").length || 0;
  return Math.round((answered / this.questions.length) * 100);
});

export default mongoose.model("AiInterview", AiInterviewSchema);