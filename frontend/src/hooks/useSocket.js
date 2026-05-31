import { useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

export function useSocket(sessionId, { onSuspiciousActivity, onChunkAck, onCandidateDisconnected } = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;

    const socket = io("/", {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      socket.emit("join_session", { sessionId, role: "candidate" });
    });

    socket.on("suspicious_activity", (data) => {
      onSuspiciousActivity?.(data);
    });

    socket.on("chunk_ack", (data) => {
      onChunkAck?.(data);
    });

    socket.on("candidate_disconnected", (data) => {
      onCandidateDisconnected?.(data);
    });

    socket.on("disconnect", (reason) => {
      console.warn("Socket disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connect error:", err.message);
    });

    // Heartbeat
    const hb = setInterval(() => {
      if (socket.connected) socket.emit("heartbeat", { sessionId });
    }, 30000);

    return () => {
      clearInterval(hb);
      socket.disconnect();
    };
  }, [sessionId]);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { emit, socket: socketRef };
}