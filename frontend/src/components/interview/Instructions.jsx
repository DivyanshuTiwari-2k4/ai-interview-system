import { ArrowRight, Clock, Mic, Eye, AlertTriangle } from "lucide-react";

export default function Instructions({ interview, onStart }) {
  const rules = [
    { icon: <Clock className="w-5 h-5" />, text: "Each question has a time limit. Answer clearly and concisely." },
    { icon: <Mic className="w-5 h-5" />, text: "Speak clearly. Your audio is recorded and transcribed." },
    { icon: <Eye className="w-5 h-5" />, text: "Keep your face visible on camera throughout the interview." },
    { icon: <AlertTriangle className="w-5 h-5" />, text: "Do not switch tabs or leave this window during the interview." },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl animate-fade-up">
        <p className="text-signal font-mono text-sm tracking-widest uppercase mb-3">Step 2 of 3</p>
        <h1 className="text-4xl font-display font-700 text-white mb-2">
          Welcome, {interview.candidateName}
        </h1>
        <p className="text-ink-100/60 mb-8">
          You're interviewing for{" "}
          <span className="text-white font-display">{interview.jobTitle}</span>
          {interview.companyName && (
            <> at <span className="text-white font-display">{interview.companyName}</span></>
          )}
        </p>

        {/* Question count */}
        <div className="glass rounded-2xl p-6 mb-6 flex items-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-display font-800 text-signal">{interview.questions?.length}</p>
            <p className="text-white/40 text-xs mt-1">Questions</p>
          </div>
          <div className="w-px h-12 bg-white/10" />
          <div className="flex-1">
            <p className="text-white font-display text-sm mb-1">AI-powered screening interview</p>
            <p className="text-white/40 text-xs">
              An AI interviewer will ask you each question verbally. Record your response when the indicator turns red.
            </p>
          </div>
        </div>

        {/* Rules */}
        <div className="space-y-3 mb-8">
          {rules.map((rule, i) => (
            <div key={i} className="glass rounded-xl p-4 flex items-start gap-4">
              <div className="text-signal mt-0.5">{rule.icon}</div>
              <p className="text-white/70 text-sm">{rule.text}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onStart}
          className="w-full py-4 rounded-xl font-display font-700 bg-signal text-ink-950 hover:bg-signal-dim 
                     active:scale-95 transition-all duration-200 signal-glow flex items-center justify-center gap-2"
        >
          Begin Interview
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}