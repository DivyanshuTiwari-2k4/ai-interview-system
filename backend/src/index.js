import './config/env.js'; // ← first line, before everything
import express from 'express';
// ... rest of imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env BEFORE anything else
const result = dotenv.config({ path: path.resolve(__dirname, '../../.env') });
console.log('Dotenv result:', result.error ? result.error.message : 'loaded successfully');
console.log('BUCKET after load:', process.env.S3_BUCKET_NAME);

import http from "http";
import cors from "cors";
import morgan from "morgan";
import connectDB from "./config/db.js";
import logger from "./config/logger.js";
import { initSocket } from "./config/socket.js";

// Routes
import interviewRoutes from "./routes/interview.js";
import sessionRoutes from "./routes/session.js";
import chunkRoutes from "./routes/chunk.js";
import recruiterRoutes from "./routes/recruiter.js";

const app = express();
const server = http.createServer(app);

// Init WebSocket
initSocket(server);

// Connect DB
connectDB();

// Middleware
app.use(cors({ 
  origin: [
    'http://localhost:5173',
    'https://ai-interview-system-three.vercel.app',
    'https://ai-interview-system-git-main-divyanshutiwari-2k4s-projects.vercel.app'
  ], 
  credentials: true 
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/interviews", interviewRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/chunks", chunkRoutes);
app.use("/api/recruiters", recruiterRoutes);

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});

export { app, server };