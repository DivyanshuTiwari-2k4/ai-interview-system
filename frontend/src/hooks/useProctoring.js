import { useEffect, useRef, useCallback } from "react";

const FACE_ABSENCE_THRESHOLD_MS = 3000; // Warn after 3s of no face

export function useProctoring({ sessionId, emit, videoRef, enabled = true }) {
  const faceAbsenceTimerRef = useRef(null);
  const lastFaceSeenRef = useRef(Date.now());
  const tabSwitchCountRef = useRef(0);

  // ── Tab visibility proctoring ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        tabSwitchCountRef.current++;
        const timestamp = new Date().toISOString();
        console.warn(`[PROCTORING] Tab switch #${tabSwitchCountRef.current}`);
        emit("tab_switch", { sessionId, timestamp });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [enabled, sessionId, emit]);

  // ── Disable right-click & copy-paste ──────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const block = (e) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("paste", block);

    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("paste", block);
    };
  }, [enabled]);

  // ── Simple face presence check using Canvas ────────────────────────────
  // (Production: replace with face-api.js or AWS Rekognition stream)
  const checkFacePresence = useCallback(() => {
    if (!videoRef?.current || !enabled) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, 64, 64);

    const imageData = ctx.getImageData(0, 0, 64, 64).data;
    let skinPixels = 0;

    // Basic skin-tone heuristic (R > G > B, R > 95, G > 40, B > 20)
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2];
      if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
        skinPixels++;
      }
    }

    const skinRatio = skinPixels / (64 * 64);
    const facePresent = skinRatio > 0.05; // At least 5% skin-tone pixels

    if (facePresent) {
      lastFaceSeenRef.current = Date.now();
      if (faceAbsenceTimerRef.current) {
        clearTimeout(faceAbsenceTimerRef.current);
        faceAbsenceTimerRef.current = null;
      }
    } else {
      const absenceDuration = Date.now() - lastFaceSeenRef.current;
      if (absenceDuration > FACE_ABSENCE_THRESHOLD_MS && !faceAbsenceTimerRef.current) {
        faceAbsenceTimerRef.current = setTimeout(() => {
          console.warn(`[PROCTORING] Face absent for ${absenceDuration}ms`);
          emit("face_absence", {
            sessionId,
            timestamp: new Date().toISOString(),
            duration: absenceDuration,
          });
          faceAbsenceTimerRef.current = null;
        }, 1000);
      }
    }
  }, [enabled, sessionId, emit, videoRef]);

  // Run face check every 2 seconds
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(checkFacePresence, 2000);
    return () => clearInterval(interval);
  }, [enabled, checkFacePresence]);

  return { tabSwitchCount: tabSwitchCountRef };
}