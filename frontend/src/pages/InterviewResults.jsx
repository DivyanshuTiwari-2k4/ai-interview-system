import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Play, AlertTriangle, CheckCircle2,
  User, Briefcase, BarChart2, MessageSquare, FileText
} from "lucide-react";
import { getRecruiterInterview } from "../utils/api";

const RECOMMENDATION_CONFIG = {
  strong_yes: { label: "Strong Yes", bg: "bg-signal/10", text: "text-signal", border: "border-signal/30" },
  yes: { label: "Yes", bg: "bg-green-400/10", text: "text-green-400", border: "border-green-400/30" },
  maybe: { label: "Maybe", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-400/30" },
  no: { label: "No", bg: "bg-orange-400/10", text: "text-orange-400", border: "border-orange-400/30" },
  strong_no: { label: "Strong No", bg: "bg-danger/10", text: "text-danger", border: "border-danger/30" },
};

const ALERT_ICONS = {
  TAB_SWITCH: "🔀",
  FACE_ABSENCE: "👁",
  MULTIPLE_FACES: "👥",
};

export default function InterviewResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    loadResults();
  }, [id]);

  const loadResults = async () => {
    try {
      const data = await getRecruiterInterview(id);
      setInterview(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-signal/30 border-t-signal rounded-full animate-spin" />
      </div>
    );
  }

  if (!interview) {
    return <div className="min-h-screen flex items-center justify-center text-white/40">Interview not found</div>;
  }

  const rec = RECOMMENDATION_CONFIG[interview.recommendation];
  const alerts = interview.session_data?.suspicious_events || [];
  const completedResponses = (interview.responses || []).filter((r) => r.transcriptionStatus === "completed");

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">

        {/* Back */}
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-8 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        {/* Header */}
        <div className="glass rounded-2xl p-8 mb-6 flex items-start gap-6">
          <div className="w-16 h-16 rounded-2xl bg-signal/10 border border-signal/20 flex items-center justify-center flex-shrink-0">
            <span className="text-signal font-display font-800 text-2xl">
              {interview.candidateName?.[0]?.toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-display font-800 text-white">{interview.candidateName}</h1>
                <p className="text-white/40 mt-1">{interview.candidateEmail}</p>
              </div>
              <div className="text-right">
                {interview.overallScore && (
                  <div className="mb-2">
                    <span className="text-5xl font-display font-800 text-white">{interview.overallScore}</span>
                    <span className="text-white/30">/100</span>
                  </div>
                )}
                {rec && (
                  <span className={`px-3 py-1 rounded-full text-sm font-display font-700 border ${rec.bg} ${rec.text} ${rec.border}`}>
                    {rec.label}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4 flex-wrap">
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <Briefcase className="w-4 h-4" />
                {interview.jobTitle}
              </div>
              {interview.companyName && (
                <div className="text-white/40 text-sm">@ {interview.companyName}</div>
              )}
              {alerts.length > 0 && (
                <div className="flex items-center gap-1.5 text-amber-interview text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {alerts.length} alert{alerts.length > 1 ? "s" : ""}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 glass rounded-xl p-1 mb-6 w-fit">
          {["overview", "responses", "proctoring"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-display font-600 capitalize transition-all
                ${activeTab === tab ? "bg-signal text-ink-950" : "text-white/40 hover:text-white"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ── */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-fade-up">
            {interview.overallFeedback && (
              <div className="glass rounded-2xl p-6">
                <h3 className="font-display font-700 text-white mb-3 flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-signal" /> AI Overall Assessment
                </h3>
                <p className="text-white/70 leading-relaxed">{interview.overallFeedback}</p>
              </div>
            )}

            {/* Avg scores */}
            {completedResponses.length > 0 && (
              <div className="glass rounded-2xl p-6">
                <h3 className="font-display font-700 text-white mb-5">Scores by Dimension</h3>
                {["technical", "communication", "relevance", "overall"].map((dim) => {
                  const avg =
                    completedResponses.filter((r) => r.aiScore?.[dim]).reduce((s, r) => s + r.aiScore[dim], 0) /
                    Math.max(completedResponses.filter((r) => r.aiScore?.[dim]).length, 1);
                  const pct = (avg / 10) * 100;
                  return (
                    <div key={dim} className="mb-4">
                      <div className="flex justify-between mb-1.5">
                        <span className="text-white/60 text-sm capitalize">{dim}</span>
                        <span className="text-white font-mono text-sm">{avg.toFixed(1)}/10</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-signal rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Responses Tab ── */}
        {activeTab === "responses" && (
          <div className="space-y-4 animate-fade-up">
            {(interview.responses || []).map((r, i) => (
              <div key={i} className="glass rounded-2xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-signal font-mono text-xs mb-1">Q{r.questionIndex + 1}</p>
                    <p className="font-display font-700 text-white">{r.questionText}</p>
                  </div>
                  {r.playbackUrl && (
                    <a
                      href={r.playbackUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 glass px-3 py-1.5 rounded-lg text-white/60 hover:text-white text-sm transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" /> Play
                    </a>
                  )}
                </div>

                {/* Transcription */}
                {r.transcription && (
                  <div className="glass rounded-xl p-4 mb-4">
                    <p className="text-white/40 text-xs font-mono mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" /> TRANSCRIPT
                    </p>
                    <p className="text-white/80 text-sm leading-relaxed">{r.transcription}</p>
                  </div>
                )}

                {/* AI Score */}
                {r.aiScore && (
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {["technical", "communication", "relevance", "overall"].map((dim) => (
                      <div key={dim} className="text-center glass rounded-lg p-2">
                        <p className="text-white font-display font-700">{r.aiScore[dim] ?? "—"}</p>
                        <p className="text-white/30 text-xs capitalize">{dim}</p>
                      </div>
                    ))}
                  </div>
                )}

                {r.aiFeedback && (
                  <p className="text-white/50 text-sm italic">{r.aiFeedback}</p>
                )}

                {r.transcriptionStatus !== "completed" && (
                  <p className="text-white/30 text-sm">
                    Status: <span className="font-mono">{r.transcriptionStatus}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Proctoring Tab ── */}
        {activeTab === "proctoring" && (
          <div className="animate-fade-up">
            {alerts.length === 0 ? (
              <div className="glass rounded-2xl p-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-signal mx-auto mb-4" />
                <h3 className="font-display font-700 text-white text-xl mb-2">Clean Session</h3>
                <p className="text-white/40">No suspicious activity was detected during this interview.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    className={`glass rounded-xl p-4 flex items-center gap-4 border
                      ${alert.severity === "high" ? "border-danger/30 bg-danger/5" : "border-amber-interview/20 bg-amber-interview/5"}`}
                  >
                    <span className="text-2xl">{ALERT_ICONS[alert.type] || "⚠"}</span>
                    <div className="flex-1">
                      <p className={`font-display font-700 text-sm ${alert.severity === "high" ? "text-danger" : "text-amber-interview"}`}>
                        {alert.type.replace("_", " ")}
                      </p>
                      <p className="text-white/40 text-xs">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                        {alert.duration && ` · ${(alert.duration / 1000).toFixed(1)}s`}
                        {alert.faceCount && ` · ${alert.faceCount} faces detected`}
                      </p>
                    </div>
                    <span className={`text-xs font-mono px-2 py-1 rounded ${alert.severity === "high" ? "bg-danger/20 text-danger" : "bg-amber-interview/20 text-amber-interview"}`}>
                      {alert.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}