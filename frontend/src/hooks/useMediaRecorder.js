import { useRef, useState, useCallback } from "react";
import { uploadChunk } from "../utils/api";

const CHUNK_INTERVAL_MS = 3000; // Send a chunk every 3 seconds

export function useMediaRecorder({ sessionId, questionIndex, interviewId, onError }) {
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const pendingChunksRef = useRef([]); // Queue for retry
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback(async (stream) => {
    try {
      streamRef.current = stream;
      chunkIndexRef.current = 0;
      pendingChunksRef.current = [];

const mimeType = getSupportedMimeType();
const recorderOptions = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : {};

const recorder = new MediaRecorder(stream, recorderOptions); // ← use recorderOptions

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          const idx = chunkIndexRef.current++;
          await sendChunkWithRetry(e.data, idx, false);
        }
      };

      recorder.onerror = (e) => {
        console.error("MediaRecorder error:", e.error);
        onError?.("Recording error: " + e.error?.message);
      };

      recorder.start(CHUNK_INTERVAL_MS);
      setIsRecording(true);
      console.log(`Recording started with ${mimeType} in ${CHUNK_INTERVAL_MS}ms chunks`);
    } catch (err) {
      console.error("Start recording failed:", err);
      onError?.(err.message);
    }
  }, [sessionId, questionIndex, interviewId]);

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        resolve();
        return;
      }

      const recorder = mediaRecorderRef.current;

      recorder.onstop = async () => {
        setIsRecording(false);
        // Send the final chunk with isFinal=true to trigger merge
        // The last ondataavailable fires before onstop, so we mark the last sent
        console.log("Recording stopped. Marking final chunk.");
        resolve();
      };

      // Request final data before stopping
      recorder.requestData();
      setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 100);
    });
  }, []);

  const sendChunkWithRetry = async (blob, idx, isFinal, retries = 3) => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await uploadChunk({
          chunk: blob,
          sessionId,
          questionIndex,
          chunkIndex: idx,
          interviewId,
          isFinal,
        });
        return;
      } catch (err) {
        console.warn(`Chunk ${idx} upload failed (attempt ${attempt + 1}):`, err);
        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        } else {
          console.error(`Chunk ${idx} permanently failed after ${retries} attempts`);
          pendingChunksRef.current.push({ blob, idx, isFinal });
        }
      }
    }
  };

  const sendFinalSignal = useCallback(async () => {
    // Send an empty signal to trigger merge on backend
     console.log('SENDING FINAL SIGNAL for Q', questionIndex);
    try {
      await uploadChunk({
        chunk: new Blob([], { type: "audio/webm" }),
        sessionId,
        questionIndex,
        chunkIndex: chunkIndexRef.current,
        interviewId,
        isFinal: true,
      });
    } catch (err) {
      console.error("Final signal failed:", err);
    }
  }, [sessionId, questionIndex, interviewId]);

  return {
    startRecording,
    stopRecording,
    sendFinalSignal,
    isRecording,
    chunkCount: chunkIndexRef,
  };
}

function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "", // ← empty string = browser default, always works
  ];
  for (const type of types) {
    if (type === "" || MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}  