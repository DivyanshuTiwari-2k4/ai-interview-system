import { useNavigate } from "react-router-dom";
import { ArrowRight, Mic, Shield, BarChart2, Zap } from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();

  const features = [
    { icon: <Mic className="w-5 h-5" />, title: "AI Interviewer", desc: "Asks questions verbally using natural speech synthesis" },
    { icon: <Shield className="w-5 h-5" />, title: "Proctoring", desc: "Real-time tab switch and face absence detection" },
    { icon: <BarChart2 className="w-5 h-5" />, title: "AI Scoring", desc: "Automatic transcription and response evaluation" },
    { icon: <Zap className="w-5 h-5" />, title: "Async Screening", desc: "Screen hundreds of candidates without scheduling" },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="animate-fade-up max-w-2xl">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full mb-8 border border-signal/20">
          <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
          <span className="text-signal font-mono text-xs tracking-widest uppercase">AI Video Interview Platform</span>
        </div>

        {/* Headline */}
        <h1 className="text-6xl font-display font-800 text-white mb-6 leading-tight">
          Screen candidates<br />
          <span className="text-signal">10x faster</span>
        </h1>
        <p className="text-white/50 text-lg mb-12 leading-relaxed">
          Automate your first-round interviews with an AI interviewer that asks questions,
          records responses, and evaluates candidates — all asynchronously.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-4 mb-16">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 px-8 py-4 bg-signal text-ink-950 rounded-xl
                       font-display font-700 hover:bg-signal-dim active:scale-95 transition-all signal-glow"
          >
            Recruiter Dashboard
            <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-8 py-4 glass rounded-xl font-display font-700 text-white/70
                       hover:text-white border border-white/10 hover:border-white/20 transition-all"
          >
            View Demo
          </button>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {features.map((f) => (
            <div key={f.title} className="glass rounded-2xl p-5 text-left">
              <div className="text-signal mb-3">{f.icon}</div>
              <p className="font-display font-700 text-white text-sm mb-1">{f.title}</p>
              <p className="text-white/40 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}