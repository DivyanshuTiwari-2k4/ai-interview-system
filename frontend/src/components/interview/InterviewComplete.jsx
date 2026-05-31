import { CheckCircle2 } from "lucide-react";

export default function InterviewComplete({ candidateName }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md animate-fade-up">
        <div className="w-20 h-20 rounded-full bg-signal/10 border border-signal/30 flex items-center justify-center mx-auto mb-8 signal-glow">
          <CheckCircle2 className="w-10 h-10 text-signal" />
        </div>
        <h1 className="text-4xl font-display font-800 text-white mb-4">
          Interview Complete
        </h1>
        <p className="text-white/60 mb-8 leading-relaxed">
          Thank you, <span className="text-white">{candidateName}</span>. Your responses have been recorded and are being
          processed. The hiring team will review your interview shortly.
        </p>
        <div className="glass rounded-2xl p-6 text-left space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-signal animate-pulse" />
            <span className="text-white/60 text-sm">Audio processing in progress</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-signal/40" />
            <span className="text-white/40 text-sm">Transcription & AI evaluation</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-signal/20" />
            <span className="text-white/30 text-sm">Recruiter review</span>
          </div>
        </div>
        <p className="text-white/20 text-xs mt-6">
          You may now close this window.
        </p>
      </div>
    </div>
  );
}