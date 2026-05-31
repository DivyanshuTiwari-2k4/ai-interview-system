import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, ChevronRight, Volume2, Clock } from "lucide-react";
import { useMediaRecorder } from "../../hooks/useMediaRecorder.js";
import { useProctoring } from "../../hooks/useProctoring.js";
import { useTTS } from "../../hooks/useTTS.js";
import { notifyQuestionStart, notifyQuestionEnd, completeSession } from "../../utils/api.js";

const PHASE = {
  INTRO: "intro",       // AI speaking the question
  PREP: "prep",         // 5s prep time
  RECORDING: "recording", // Candidate answering
  DONE: "done",         // Question answered
};

export default function InterviewRecorder({ interview, onComplete, emit }) {
  const { questions, interviewId, sessionId } = interview;
  const [qIndex, setQIndex] = useState(interview.currentQuestionIndex || 0);
  const [phase, setPhase] = useState(PHASE.INTRO);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [proctoringAlerts, setProctoringAlerts] = useState([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const { speak, stop: stopTTS } = useTTS();

  const currentQ = questions[qIndex];

  const { startRecording, stopRecording, sendFinalSignal, isRecording } = useMediaRecorder({
    sessionId,
    questionIndex: qIndex,
    interviewId,
    onError: (msg) => console.error("Recorder error:", msg),
  });

  // Clear any existing timer before starting a new one
  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const { tabSwitchCount } = useProctoring({
    sessionId,
    emit,
    videoRef,
    enabled: phase === PHASE.RECORDING,
  });

  // ── Start camera ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Camera error:", err);
      }
    })();

    return () => {
      clearTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopTTS();
    };
  }, []);

  // ── Question flow ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === PHASE.INTRO && currentQ) {
      // Small delay to ensure state is settled before speaking
      const delay = setTimeout(() => {
        askQuestion();
      }, 500); // ← 500ms buffer

      return () => clearTimeout(delay);
    }
  }, [qIndex]); // ← only depend on qIndex, not phase

  const askQuestion = useCallback(() => {
    setIsSpeaking(true);
    setPhase(PHASE.INTRO); // ← make sure phase is INTRO while speaking
    clearTimer();           // ← clear any running timer

    speak(
      `Question ${qIndex + 1} of ${questions.length}. ${currentQ.text}`,
      () => {
        // This only runs AFTER speech is fully complete
        setIsSpeaking(false);
        startPrepPhase(); // ← timer starts only after speaking ends
      }
    );
  }, [qIndex, currentQ, questions.length]);

  const startPrepPhase = () => {
    clearTimer();
    setPhase(PHASE.PREP);
    setTimeLeft(5);

    let count = 5; // ← add this local variable

    timerRef.current = setInterval(() => {
      count -= 1; // ← decrement local variable
      setTimeLeft(count);

      if (count <= 0) {
        clearInterval(timerRef.current);
        beginRecording();
      }
    }, 1000);
  };

  const beginRecording = async () => {
    // At the top of the component:
    const { questions, interviewId, sessionId } = interview;
    setPhase(PHASE.RECORDING);
    emit("answer_started", { sessionId, questionIndex: qIndex });

    await notifyQuestionStart({
      interviewId,
      sessionId,
      questionIndex: qIndex,
      questionText: currentQ.text,
      questionCategory: currentQ.category,
    });

    // ← Get a FRESH audio-only stream for recording
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false, // ← audio only for MediaRecorder
      });
      await startRecording(audioStream);
    } catch (err) {
      console.error("Failed to get audio stream:", err);
    }

    // Start answer timer
    let recordCount = currentQ.timeLimit || 120;
    setTimeLeft(recordCount);
    timerRef.current = setInterval(() => {
      recordCount -= 1;
      setTimeLeft(recordCount);
      if (recordCount <= 0) {
        clearTimer();
        finishRecording();
      }
    }, 1000);
  };

  const finishRecording = useCallback(async () => {
    if (phase !== PHASE.RECORDING) return;
    finishRecording
    clearInterval(timerRef.current);
    setPhase(PHASE.DONE);

    await stopRecording();
    await sendFinalSignal();
    await notifyQuestionEnd({ interviewId, questionIndex: qIndex });

    // Move to next question after 2s
    setTimeout(() => {
      if (qIndex < questions.length - 1) {
        setQIndex((i) => i + 1);
        setPhase(PHASE.INTRO);
      } else {
        finishInterview();
      }
    }, 2000);
  }, [phase, qIndex, questions.length, interviewId]);

  const finishInterview = async () => {
    stopTTS();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    await completeSession({ interviewId });
    emit("session_complete", { sessionId });
    onComplete();
  };

  // ── Waveform bars ──────────────────────────────────────────────────────
  const WaveformBars = () => (
    <div className="flex items-center gap-1 h-8">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-full ${isRecording ? "bg-danger waveform-bar" : "bg-white/20"}`}
          style={{
            height: isRecording ? `${20 + Math.random() * 80}%` : "20%",
            animationDelay: `${i * 0.07}s`,
            animationDuration: `${0.6 + Math.random() * 0.4}s`,
          }}
        />
      ))}
    </div>
  );

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const progress = ((qIndex) / questions.length) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="h-0.5 bg-white/5">
          <div
            className="h-full bg-signal transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-6 py-3 glass border-b border-white/5">
          <span className="font-mono text-xs text-white/40">
            Q{qIndex + 1} / {questions.length}
          </span>
          <span className="font-display text-sm font-600 text-white">{interview.jobTitle}</span>
          <span className="font-mono text-xs text-white/40">{interview.candidateName}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-6 pt-24">
        <div className="w-full max-w-4xl grid md:grid-cols-5 gap-6">

          {/* Camera feed */}
          <div className="md:col-span-2">
            <div className={`relative rounded-2xl overflow-hidden aspect-[3/4] glass
              ${isRecording ? "ring-2 ring-danger recording-pulse" : ""}`}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
              {/* Recording indicator */}
              {isRecording && (
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-danger/90 text-white text-xs font-mono px-2.5 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  REC
                </div>
              )}
              {/* Timer overlay */}
              {(phase === PHASE.RECORDING || phase === PHASE.PREP) && (
                <div className="absolute bottom-3 right-3 glass px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-white/60" />
                  <span className={`font-mono text-sm ${timeLeft <= 15 ? "text-danger" : "text-white"}`}>
                    {formatTime(timeLeft)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Question + controls */}
          <div className="md:col-span-3 flex flex-col justify-center">
            {/* AI Speaking indicator */}
            {isSpeaking && (
              <div className="flex items-center gap-3 mb-6 glass rounded-xl px-4 py-3">
                <Volume2 className="w-4 h-4 text-signal animate-pulse" />
                <span className="text-signal text-sm font-mono">AI Interviewer speaking...</span>
              </div>
            )}

            {/* Question text */}
            <div className="glass rounded-2xl p-8 mb-6">
              <p className="text-signal font-mono text-xs tracking-widest uppercase mb-4">
                Question {qIndex + 1}
              </p>
              <p className="text-white font-display text-2xl font-600 leading-snug">
                {currentQ?.text}
              </p>
              {currentQ?.category && (
                <span className="inline-block mt-4 text-xs font-mono text-white/30 border border-white/10 px-2 py-1 rounded">
                  {currentQ.category}
                </span>
              )}
            </div>

            {/* Phase status */}
            <div className="glass rounded-2xl p-6">
              {phase === PHASE.INTRO && (
                <div className="flex items-center gap-4">
                  <Volume2 className="w-6 h-6 text-signal" />
                  <p className="text-white/60">Listen to the question...</p>
                </div>
              )}

              {phase === PHASE.PREP && (
                <div className="text-center">
                  <p className="text-4xl font-display font-800 text-signal mb-1">{timeLeft}</p>
                  <p className="text-white/40 text-sm">seconds to prepare</p>
                </div>
              )}

              {phase === PHASE.RECORDING && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                      <span className="text-white/60 text-sm">Recording your answer</span>
                    </div>
                    <WaveformBars />
                  </div>
                  <button
                    onClick={finishRecording}
                    className="w-full py-3 rounded-xl glass border border-signal/30 text-signal font-display font-700 text-sm
                               hover:bg-signal/10 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <ChevronRight className="w-4 h-4" />
                    Finish Answer Early
                  </button>
                </div>
              )}

              {phase === PHASE.DONE && (
                <div className="flex items-center gap-4 text-signal">
                  <div className="w-8 h-8 rounded-full bg-signal/20 flex items-center justify-center">
                    <Mic className="w-4 h-4" />
                  </div>
                  <p className="text-sm">
                    {qIndex < questions.length - 1 ? "Loading next question..." : "Finishing up..."}
                  </p>
                </div>
              )}
            </div>

            {/* Proctoring alerts */}
            {proctoringAlerts.length > 0 && (
              <div className="mt-4 glass border border-danger/30 bg-danger/5 rounded-xl p-4">
                <p className="text-danger text-sm font-display">
                  ⚠ {proctoringAlerts[proctoringAlerts.length - 1]}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}