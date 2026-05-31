import { Server } from "socket.io";
import logger from "./logger.js";
import AiInterview from "../models/AiInterview.js";

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Candidate joins their session room
    socket.on("join_session", ({ sessionId, role }) => {
      socket.join(sessionId);
      socket.data.sessionId = sessionId;
      socket.data.role = role;
      logger.info(`[${role}] joined session room: ${sessionId}`);
      socket.to(sessionId).emit("participant_joined", { role, socketId: socket.id });
    });

    // ── PROCTORING EVENTS ──────────────────────────────────────────────────

    // Candidate switched tabs
    socket.on("tab_switch", async ({ sessionId, timestamp }) => {
      logger.warn(`TAB SWITCH detected in session ${sessionId} at ${timestamp}`);
      try {
        await AiInterview.findOneAndUpdate(
          { "session_data.sessionId": sessionId },
          {
            $push: {
              "session_data.suspicious_events": {
                type: "TAB_SWITCH",
                timestamp,
                severity: "medium",
              },
            },
          }
        );
      } catch (err) {
        logger.error(`Failed to record tab switch: ${err.message}`);
      }
      // Notify recruiter dashboard in real-time
      socket.to(`recruiter_${sessionId}`).emit("suspicious_activity", {
        type: "TAB_SWITCH",
        sessionId,
        timestamp,
      });
    });

    // Face absence detected
    socket.on("face_absence", async ({ sessionId, timestamp, duration }) => {
      logger.warn(`FACE ABSENCE in session ${sessionId} for ${duration}ms`);
      try {
        await AiInterview.findOneAndUpdate(
          { "session_data.sessionId": sessionId },
          {
            $push: {
              "session_data.suspicious_events": {
                type: "FACE_ABSENCE",
                timestamp,
                duration,
                severity: "high",
              },
            },
          }
        );
      } catch (err) {
        logger.error(`Failed to record face absence: ${err.message}`);
      }
      socket.to(`recruiter_${sessionId}`).emit("suspicious_activity", {
        type: "FACE_ABSENCE",
        sessionId,
        timestamp,
        duration,
      });
    });

    // Multiple faces detected
    socket.on("multiple_faces", async ({ sessionId, timestamp, faceCount }) => {
      logger.warn(`MULTIPLE FACES (${faceCount}) in session ${sessionId}`);
      try {
        await AiInterview.findOneAndUpdate(
          { "session_data.sessionId": sessionId },
          {
            $push: {
              "session_data.suspicious_events": {
                type: "MULTIPLE_FACES",
                timestamp,
                faceCount,
                severity: "high",
              },
            },
          }
        );
      } catch (err) {
        logger.error(`Failed to record multiple faces: ${err.message}`);
      }
      socket.to(`recruiter_${sessionId}`).emit("suspicious_activity", {
        type: "MULTIPLE_FACES",
        sessionId,
        timestamp,
        faceCount,
      });
    });

    // ── INTERVIEW FLOW EVENTS ──────────────────────────────────────────────

    // Question started (AI is asking)
    socket.on("question_started", ({ sessionId, questionIndex, questionText }) => {
      logger.info(`Session ${sessionId}: Q${questionIndex} started`);
      io.to(sessionId).emit("question_update", {
        questionIndex,
        questionText,
        status: "asking",
      });
    });

    // Candidate started answering
    socket.on("answer_started", ({ sessionId, questionIndex }) => {
      logger.info(`Session ${sessionId}: Candidate answering Q${questionIndex}`);
      io.to(sessionId).emit("recording_status", { questionIndex, status: "recording" });
    });

    // Chunk acknowledged
    socket.on("chunk_received", ({ sessionId, chunkIndex, questionIndex }) => {
      socket.emit("chunk_ack", { chunkIndex, questionIndex, status: "stored" });
    });

    // Session completed
    socket.on("session_complete", async ({ sessionId }) => {
      logger.info(`Session ${sessionId} marked complete`);
      try {
        await AiInterview.findOneAndUpdate(
          { "session_data.sessionId": sessionId },
          { status: "processing", "session_data.completedAt": new Date() }
        );
      } catch (err) {
        logger.error(`Failed to mark session complete: ${err.message}`);
      }
      io.to(sessionId).emit("interview_ended", { sessionId });
    });

    // Heartbeat / keep-alive
    socket.on("heartbeat", ({ sessionId }) => {
      socket.emit("heartbeat_ack", { timestamp: Date.now() });
    });

    // Recruiter joins monitoring room
    socket.on("recruiter_monitor", ({ sessionId }) => {
      socket.join(`recruiter_${sessionId}`);
      logger.info(`Recruiter monitoring session: ${sessionId}`);
    });

    socket.on("disconnect", (reason) => {
      logger.info(`Socket ${socket.id} disconnected: ${reason}`);
      if (socket.data.sessionId && socket.data.role === "candidate") {
        io.to(socket.data.sessionId).emit("candidate_disconnected", {
          sessionId: socket.data.sessionId,
          reason,
        });
      }
    });

    socket.on("error", (err) => {
      logger.error(`Socket error on ${socket.id}: ${err.message}`);
    });
  });

  logger.info("✅ Socket.io initialized");
  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};

export { initSocket, getIO };
