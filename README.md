# TalentScreen — AI Video Interview System

> Automate first-round candidate screening with an AI interviewer that asks questions verbally, records responses in real-time, transcribes audio, and delivers structured results to recruiters.

**Live Demo:** https://ai-interview-system-three.vercel.app  
**Backend API:** https://ai-interview-backend-ai8w.onrender.com/health

---

## Table of Contents

1. [Problem Understanding](#1-problem-understanding)
2. [Architecture Overview](#2-architecture-overview)
3. [Technical Decisions & Tradeoffs](#3-technical-decisions--tradeoffs)
4. [Failure Scenarios & Edge Cases](#4-failure-scenarios--edge-cases)
5. [Recovery Mechanisms](#5-recovery-mechanisms)
6. [Product Thinking](#6-product-thinking)
7. [Scalability Considerations](#7-scalability-considerations)
8. [Observability & Debugging](#8-observability--debugging)
9. [AI Usage Documentation](#9-ai-usage-documentation)
10. [Demo & Walkthrough](#10-demo--walkthrough)

---

## 1. Problem Understanding

### What problem are we solving?

Manual first-round interviews are time-consuming, difficult to scale, and introduce scheduling friction between recruiters and candidates. A recruiter spending 30 minutes per candidate across 100 applicants loses 50+ hours just on initial screening — before any real evaluation begins.

### Why is this system needed?

Recruiters need a way to screen hundreds of candidates **asynchronously** while maintaining a high-fidelity record of candidate responses, technical ability, and communication skills. Candidates need a fair, structured experience that respects their time and works on their schedule.

**TalentScreen solves this by:**
- Deploying an AI interviewer that asks questions verbally using Text-to-Speech
- Recording candidate responses in real-time using chunked media streaming
- Automatically transcribing audio via Deepgram Speech-to-Text
- Delivering structured results with proctoring data to recruiters via a unified dashboard

---

## 2. Architecture Overview

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React/Vite)                 │
│  Landing → Hardware Check → Instructions → Interview → Done  │
│         Recruiter Dashboard → Results Drill-down             │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                   BACKEND (Node.js/Express)                   │
│  REST API Routes: /interviews /sessions /chunks /recruiters  │
│  Socket.io Server: Proctoring events, session state          │
└────────┬─────────────────────────┬───────────────────────────┘
         │                         │
┌────────▼────────┐    ┌──────────▼──────────┐
│  MongoDB Atlas  │    │      AWS S3          │
│  Session data   │    │  Raw media chunks    │
│  Interview docs │    │  Merged audio files  │
│  Transcripts    │    │  Resume PDFs         │
└─────────────────┘    └──────────┬──────────┘
                                  │
                       ┌──────────▼──────────┐
                       │      AWS SQS         │
                       │  merge-queue.fifo    │
                       │  transcription-queue │
                       └──────────┬──────────┘
                                  │
                       ┌──────────▼──────────┐
                       │  Async Workers       │
                       │  FFmpeg merge        │
                       │  Deepgram STT        │
                       │  AI Evaluation       │
                       └─────────────────────┘
```

### Media Flow

```
Candidate speaks
      ↓
MediaRecorder API (browser)
      ↓ every 3 seconds
Blob chunks (audio/webm)
      ↓ POST /api/chunks/upload
Express backend (multer)
      ↓
AWS S3 (chunk_00000.webm, chunk_00001.webm ...)
      ↓ final chunk triggers
AWS SQS → AUDIO_MERGE_QUEUE
      ↓
Merge Worker (FFmpeg)
      → downloads all chunks from S3
      → sorts by zero-padded index
      → merges into merged.wav
      → uploads merged.wav to S3
      ↓
AWS SQS → TRANSCRIPTION_QUEUE
      ↓
Transcribe Worker (Deepgram)
      → downloads merged.wav
      → sends to Deepgram Nova-2
      → saves transcript to MongoDB
      ↓
AI Evaluation (Claude API - optional)
      → scores each response
      → generates overall recommendation
      → saves to MongoDB
```

### WebSocket / Event Flow

```
Candidate connects → socket.emit("join_session")
                  → socket.emit("tab_switch")        ← proctoring
                  → socket.emit("face_absence")      ← proctoring
                  → socket.emit("answer_started")    ← recording state
                  → socket.emit("chunk_received")    ← chunk ack
                  → socket.emit("session_complete")  ← done

Recruiter connects → socket.emit("recruiter_monitor")
                  ← socket.on("suspicious_activity") ← real-time alerts
```

---

## 3. Technical Decisions & Tradeoffs

### Why Streaming over Full Upload

We chose chunked streaming (3-second blobs via MediaRecorder) over recording a full file and uploading at the end for several critical reasons:

- **Resilience:** If a candidate's browser crashes or network drops at minute 4 of a 5-minute answer, we already have 80% of the response safely stored in S3. A full-upload approach would lose everything.
- **Memory efficiency:** Large video/audio files held in browser memory cause crashes on low-end devices. Streaming keeps memory usage constant regardless of answer length.
- **Real-time feedback:** Chunks arriving at the server allow the backend to immediately acknowledge receipt, giving the candidate confidence their answer is being captured.

**Tradeoff:** Chunked streaming requires a merge step (FFmpeg) and more complex ordering logic. We mitigate this with zero-padded deterministic chunk keys (`chunk_00000.webm`) that guarantee correct ordering even if chunks arrive out of sequence.

### Why MERN Stack

MongoDB's flexible document model is ideal for interview data where each session has a variable number of questions, responses, and nested suspicious events. A relational schema would require complex joins for what is naturally a document.

Express + Node.js provides a non-blocking I/O model well-suited for handling many concurrent WebSocket connections from candidates simultaneously.

### Why AWS SQS FIFO Queues

SQS FIFO queues guarantee exactly-once processing and ordered delivery per `MessageGroupId`. We group by `sessionId` so all chunks for a session are processed in order. This prevents race conditions where a later chunk's merge job runs before an earlier one.

**Tradeoff:** FIFO queues have lower throughput limits than standard queues. At very high scale this becomes a bottleneck (addressed in Scalability section).

### Why Deepgram over Whisper / AWS Transcribe

Deepgram Nova-2 provides sub-real-time transcription latency, high accuracy on conversational English, and a generous free tier ($200 credit). AWS Transcribe has higher latency and Whisper requires self-hosting infrastructure.

### Why Web Speech API for TTS

Browser-native TTS (SpeechSynthesis API) requires zero API calls, zero latency, zero cost. The tradeoff is voice quality varies by OS and browser. For production, replacing with ElevenLabs or AWS Polly would provide consistent, high-quality voice output.

---

## 4. Failure Scenarios & Edge Cases

| Scenario | Risk | Handled? |
|----------|------|----------|
| Network interruption mid-answer | Partial chunk loss | ✅ Retry logic (3 attempts with backoff) |
| Duplicate chunks | Incorrect merge ordering | ✅ Zero-padded keys + S3 deduplication |
| Camera/mic disconnect | Loss of video/audio feed | ✅ Fresh stream requested per question |
| Partial upload failures | Missing chunks in merged file | ✅ Chunks stored independently; partial transcription still valuable |
| WebSocket reconnects | Loss of proctoring stream | ✅ Auto-reconnect with exponential backoff |
| Empty/corrupted media chunks | Storage bloat, merge failure | ✅ Size guard (< 100 bytes = skipped) |
| Tab switch | Integrity concern | ✅ Logged to DB, real-time recruiter alert |
| Face absence | Integrity concern | ✅ Skin-tone heuristic, 3s threshold, logged |
| Session expiry | Candidate loses progress | ✅ 7-day token expiry with resume capability |
| S3 upload failure | Chunk lost | ✅ 3 retry attempts, logged to pending queue |

---

## 5. Recovery Mechanisms

### Session Resume

Every candidate session is tracked in `AiInterview.session_data` (the "central brain"). This document stores `currentQuestionIndex`, answered question indices, and session status. If a candidate disconnects and returns, the system detects the `in_progress` status and resumes from the exact question they left off.

### Chunk Recovery Strategy

Chunks are written to S3 with deterministic, zero-padded keys:
```
interviews/{sessionId}/q{questionIndex}/chunk_00000.webm
interviews/{sessionId}/q{questionIndex}/chunk_00001.webm
```

The merge worker uses `ListObjectsV2` with lexicographic sorting to reconstruct the correct order regardless of network arrival order. Even if 2 out of 10 chunks fail to upload, the remaining 8 provide a partial but transcribable audio file.

### Retry Logic

- **Chunk uploads:** 3 attempts with exponential backoff (1s, 2s, 3s)
- **SQS polling:** Continuous long-polling (20s wait time) with automatic restart on error
- **MongoDB:** Built-in Mongoose reconnection with exponential backoff
- **WebSocket:** Socket.io auto-reconnect with configurable delays (1s → 5s max)

### Failure Handling

Failed transcriptions set `transcriptionStatus: "failed"` and trigger a recruiter alert. Failed merges leave the SQS message unconsumed — it becomes visible again after the 5-minute visibility timeout and is retried automatically.

---

## 6. Product Thinking

### Candidate Experience

- **Hardware Check page:** Mandatory camera + microphone test with live preview and audio level indicator before the interview starts. This proactively catches permission issues and reduces mid-interview failures.
- **Prep timer:** 5-second buffer between the AI finishing its question and recording starting — gives candidates time to collect their thoughts.
- **Time limit display:** Visible countdown timer on camera feed so candidates always know how much time remains.
- **Early finish option:** "Finish Answer Early" button lets candidates move on when they're done, respecting their time.
- **Resume capability:** If a browser crash or network drop occurs, candidates can reload the link and resume exactly where they left off.

### Recruiter Experience

- **Unified drill-down view:** Single page showing resume, transcript, video playback link, AI scores, and proctoring events — no switching between tools.
- **Dashboard stats:** At-a-glance metrics (total, completed, in-progress, average score) for pipeline management.
- **Real-time alerts:** Tab switches and face absences appear instantly on the recruiter monitor via WebSocket, not as a post-hoc report.
- **Recommendation labels:** AI-generated `strong_yes / yes / maybe / no / strong_no` helps recruiters prioritize their review queue.

### Suspicious Activity Tracking

Three proctoring signals are tracked with timestamps and severity:

1. **TAB_SWITCH** (medium severity) — `document.visibilitychange` event fires when the candidate leaves the interview tab
2. **FACE_ABSENCE** (high severity) — Canvas-based skin-tone heuristic checks every 2 seconds; triggers after 3 continuous seconds of no face detected
3. **MULTIPLE_FACES** (high severity) — Pixel ratio analysis detects anomalous skin-tone coverage suggesting additional people on screen

All events are stored in `session_data.suspicious_events` and surfaced in the recruiter's Proctoring tab with timestamps and duration data.

### UX Decisions

- Dark theme with green accent (`#00ff88`) chosen for a modern, professional feel that reduces eye strain during long interview sessions
- Progress bar at top provides orientation without cognitive overhead
- Waveform animation during recording gives visual feedback that audio is being captured
- Interview complete screen shows processing pipeline status so candidates understand what happens next

---

## 7. Scalability Considerations

### What May Break at Scale

| Component | Bottleneck | Impact |
|-----------|-----------|--------|
| SQS FIFO queues | 300 TPS limit | Merge delays at 300+ simultaneous sessions |
| Render free tier | Single instance, spins down | 50s cold start, no horizontal scaling |
| MongoDB Atlas M0 | 512MB storage, shared CPU | Slow queries at 10k+ interviews |
| Deepgram API | Rate limits on free tier | Transcription queue backup |
| FFmpeg merge | CPU-bound, single process | Merge latency grows linearly |

### Performance Bottlenecks

- FFmpeg is CPU-intensive. Running merges inside the main server process competes with request handling. At scale, Lambda functions or dedicated EC2 workers handle this better.
- WebSocket connections are memory-intensive. A single Node.js server handles ~10k concurrent connections comfortably; beyond that, Redis pub/sub + multiple instances with sticky sessions are needed.

### Future Improvements for High Concurrency

- **Replace SQS FIFO with standard SQS + idempotency keys** for higher throughput
- **AWS Lambda for FFmpeg merges** — scales horizontally to zero with load
- **Redis for WebSocket state** — enables multi-instance deployment with shared session state
- **CDN for merged audio** — CloudFront in front of S3 for faster recruiter playback
- **MongoDB Atlas M10+** — dedicated cluster with proper indexing for production workloads
- **ElevenLabs TTS** — consistent, high-quality AI interviewer voice across all browsers

---

## 8. Observability & Debugging

### Logging Strategy

We use **Winston** with two transports:
- **Console** — colorized, human-readable for development
- **File** — `logs/error.log` and `logs/combined.log` with 5MB rotation and 5 file retention

Log levels follow severity: `debug` (chunk operations) → `info` (session lifecycle) → `warn` (proctoring events) → `error` (failures).

Every chunk upload logs: `session`, `questionIndex`, `chunkIndex`, `size` — enabling replay of any session's upload sequence.

### Error Tracking

- S3 upload failures log the full S3 key and error message, allowing manual re-upload
- SQS failures leave messages unconsumed (visible after timeout) for automatic retry
- Transcription failures set `transcriptionStatus: "failed"` in MongoDB — queryable for batch reprocessing
- Worker errors are caught at the poll loop level — a single job failure doesn't crash the worker

### Debugging Production Failures

1. **Chunk not in S3:** Check backend logs for `S3 upload failed` with the exact S3 key → manually verify credentials and bucket name
2. **Merge not triggering:** Check SQS queue message count → verify `isFinal=true` is being sent by frontend
3. **Transcription stuck:** Check Deepgram API key validity → query MongoDB for `transcriptionStatus: "processing"` older than 10 minutes
4. **WebSocket not connecting:** Check CORS origin list includes the frontend domain → verify Socket.io upgrade headers
5. **Session not resuming:** Query `AiInterview.session_data.sessionId` → check `currentQuestionIndex` and `status` fields

---

## 9. AI Usage Documentation

### How AI Tools Were Used

This project was built collaboratively with **Claude (Anthropic)** as a development accelerator. The following documents how AI was used and where human judgment was applied.

### AI-Assisted Components

| Component | AI Contribution | Human Decision |
|-----------|----------------|----------------|
| MongoDB schema design | Generated initial schema structure | Reviewed and added `session_data` as central brain concept, added virtuals |
| Socket.io event architecture | Suggested event names and flow | Decided which events needed DB persistence vs. in-memory only |
| FFmpeg merge logic | Generated concat file approach | Chose zero-padded key strategy for ordering guarantee |
| SQS queue service | Generated enqueue/poll/delete pattern | Decided FIFO over standard for ordering guarantees |
| Frontend component structure | Generated component hierarchy | Decided on phase-based state machine (INTRO→PREP→RECORDING→DONE) |
| Proctoring heuristics | Suggested face detection approach | Chose skin-tone pixel ratio as lightweight browser-native alternative to face-api.js |
| Error retry logic | Generated exponential backoff pattern | Set 3-attempt limit and decided which errors warrant retry vs. permanent failure |

### Prompting Strategy

Used an **"Understand → Explore → Decide"** approach:
1. **Understand** — Described the full system requirement to establish context
2. **Explore** — Asked for tradeoff analysis between approaches (e.g., WebSocket vs. polling for chunk upload)
3. **Decide** — Made final architecture decisions based on the constraints (MERN stack, free tier AWS, 1-hour deadline)

### What Was Entirely Human

- All debugging of Windows-specific ESM module resolution issues
- Decision to use `env.js` with `process.env` injection as a dotenv fallback
- Choice of Deepgram over alternatives based on free tier generosity
- UX decisions: prep timer duration (5s), chunk interval (3s), face absence threshold (3s)
- Proctoring severity classifications (tab switch = medium, face absence = high)

---

## 10. Demo & Walkthrough

### Live Links

- **Frontend:** https://ai-interview-system-three.vercel.app
- **Backend Health:** https://ai-interview-backend-ai8w.onrender.com/health
- **GitHub:** https://github.com/DivyanshuTiwari-2k4/ai-interview-system

> Note: Render free tier spins down after inactivity. First request may take 30-50 seconds. Subsequent requests are fast.

### Setup Instructions (Local Development)

**Prerequisites:**
- Node.js v18+
- FFmpeg installed (`winget install ffmpeg` on Windows)
- MongoDB Atlas account (free M0 cluster)
- AWS account (free tier)
- Deepgram account (free $200 credit)

**1. Clone the repository:**
```bash
git clone https://github.com/DivyanshuTiwari-2k4/ai-interview-system.git
cd ai-interview-system
```

**2. Install dependencies:**
```bash
cd backend && npm install
cd ../frontend && npm install
```

**3. Configure environment:**

Create `backend/src/config/env.js`:
```js
const defaults = {
  PORT: '5000',
  MONGODB_URI: 'your_mongodb_atlas_uri',
  AWS_REGION: 'your_region',
  AWS_ACCESS_KEY_ID: 'your_key_id',
  AWS_SECRET_ACCESS_KEY: 'your_secret_key',
  S3_BUCKET_NAME: 'your_bucket_name',
  AUDIO_MERGE_QUEUE_URL: 'your_sqs_merge_queue_url',
  TRANSCRIPTION_QUEUE_URL: 'your_sqs_transcription_queue_url',
  DEEPGRAM_API_KEY: 'your_deepgram_key',
  FRONTEND_URL: 'http://localhost:5173',
};

Object.entries(defaults).forEach(([key, value]) => {
  if (!process.env[key]) process.env[key] = value;
});
```

**4. Run the project (4 terminals):**
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend  
cd frontend && npm run dev

# Terminal 3 - Merge Worker
cd backend && npm run worker:merge

# Terminal 4 - Transcribe Worker
cd backend && npm run worker:transcribe
```

**5. Open:** http://localhost:5173

### Test the Full Flow

1. Go to `/dashboard` → enter recruiter email → **New Interview**
2. Fill candidate details → **Create Interview** → copy the link
3. Open the link in a new tab → complete hardware check
4. Go through instructions → answer all 3 questions verbally
5. Return to dashboard → click the interview → view **Responses** tab for transcripts

### System Walkthrough

```
Recruiter creates interview
         ↓
Unique access token generated (UUID)
         ↓
Candidate opens link → Hardware Check (camera + mic test)
         ↓
Instructions page → Begin Interview
         ↓
AI speaks question (Web Speech API TTS)
         ↓
5 second prep timer
         ↓
Recording starts (MediaRecorder, 3s chunks → S3)
         ↓
Time limit reached or candidate clicks "Finish Early"
         ↓
Final chunk sent → SQS merge job enqueued
         ↓
Next question... (repeat)
         ↓
All questions answered → Session complete
         ↓
FFmpeg merges chunks → merged.wav → S3
         ↓
Deepgram transcribes → transcript saved to MongoDB
         ↓
Recruiter views results: transcript + proctoring data
```

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, Socket.io-client |
| Backend | Node.js, Express, Socket.io |
| Database | MongoDB Atlas (Mongoose) |
| Storage | AWS S3 |
| Queue | AWS SQS FIFO |
| Media Processing | FFmpeg (fluent-ffmpeg) |
| Transcription | Deepgram Nova-2 |
| TTS | Web Speech API (browser-native) |
| Deployment | Vercel (frontend), Render (backend) |

---

*Built for the AI Video Interview System assessment. June 2026.*