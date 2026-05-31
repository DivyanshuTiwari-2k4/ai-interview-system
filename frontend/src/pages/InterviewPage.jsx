import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import HardwareCheck from "../components/interview/HardareCheck.jsx";
import Instructions from "../components/interview/Instructions.jsx";
import InterviewRecorder from "../components/interview/InterviewRecorder.jsx";
import InterviewComplete from "../components/interview/InterviewComplete.jsx";
import { getInterview, markHardwareCheckPassed, startSession } from "../utils/api.js";
import { useSocket } from "../hooks/useSocket";

const STEP = {
  LOADING: "loading",
  HARDWARE: "hardware",
  INSTRUCTIONS: "instructions",
  INTERVIEW: "interview",
  COMPLETE: "complete",
  ERROR: "error",
};

export default function InterviewPage() {
  const { token } = useParams();
  const [step, setStep] = useState(STEP.LOADING);
  const [interview, setInterview] = useState(null);
  const [error, setError] = useState(null);

  const { emit } = useSocket(interview?.sessionId);

  useEffect(() => {
    loadInterview();
  }, [token]);

  const loadInterview = async () => {
    try {
      const data = await getInterview(token);
      setInterview(data);

      // Resume logic
      if (["processing", "completed", "evaluated"].includes(data.status)) {
        setStep(STEP.COMPLETE);
      } else if (data.sessionStatus === "in_progress") {
        setStep(STEP.INTERVIEW); // Resume
      } else {
        setStep(STEP.HARDWARE);
      }
    } catch (err) {
      setError(err.error || "Interview not found or has expired.");
      setStep(STEP.ERROR);
    }
  };

  const handleHardwarePassed = async () => {
    try {
      await markHardwareCheckPassed({
        interviewId: interview.interviewId,
        sessionId: interview.sessionId,
        userAgent: navigator.userAgent,
      });
      setStep(STEP.INSTRUCTIONS);
    } catch (err) {
      setStep(STEP.INSTRUCTIONS); // Non-blocking
    }
  };

  const handleStart = async () => {
    try {
      await startSession({ interviewId: interview.interviewId });
    } catch (_) {}
    setStep(STEP.INTERVIEW);
  };

  if (step === STEP.LOADING) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-signal/30 border-t-signal rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/40 font-mono text-sm">Loading interview...</p>
        </div>
      </div>
    );
  }

  if (step === STEP.ERROR) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-2xl font-display font-700 text-white mb-3">Access Denied</h1>
          <p className="text-white/40">{error}</p>
        </div>
      </div>
    );
  }

  if (step === STEP.HARDWARE) return <HardwareCheck onPassed={handleHardwarePassed} />;
  if (step === STEP.INSTRUCTIONS) return <Instructions interview={interview} onStart={handleStart} />;
  if (step === STEP.INTERVIEW)
    return (
      <InterviewRecorder
        interview={{ ...interview, currentQuestionIndex: interview.currentQuestionIndex || 0 }}
        onComplete={() => setStep(STEP.COMPLETE)}
        emit={emit}
      />
    );
  if (step === STEP.COMPLETE) return <InterviewComplete candidateName={interview?.candidateName} />;

  return null;
}