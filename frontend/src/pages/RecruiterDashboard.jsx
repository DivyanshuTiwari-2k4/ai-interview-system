import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, CheckCircle2, Clock, TrendingUp, AlertTriangle,
  ChevronRight, Plus, Search, BarChart2
} from "lucide-react";
import { getDashboard, createInterview } from "../utils/api";

const STATUS_COLORS = {
  invited: "text-white/40 bg-white/5",
  started: "text-amber-interview bg-amber-interview/10",
  processing: "text-blue-400 bg-blue-400/10",
  evaluated: "text-signal bg-signal/10",
  expired: "text-danger bg-danger/10",
};

const RECOMMENDATION_LABELS = {
  strong_yes: { label: "Strong Yes", color: "text-signal" },
  yes: { label: "Yes", color: "text-green-400" },
  maybe: { label: "Maybe", color: "text-amber-interview" },
  no: { label: "No", color: "text-orange-400" },
  strong_no: { label: "Strong No", color: "text-danger" },
};

export default function RecruiterDashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const loadDashboard = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const data = await getDashboard(emailInput);
      setDashboard(data);
      setEmail(emailInput);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const filtered = dashboard?.interviews?.filter(
    (i) =>
      i.candidateName.toLowerCase().includes(search.toLowerCase()) ||
      i.candidateEmail.toLowerCase().includes(search.toLowerCase()) ||
      i.jobTitle.toLowerCase().includes(search.toLowerCase())
  );

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-up">
          <h1 className="text-4xl font-display font-800 text-white mb-2">Recruiter Dashboard</h1>
          <p className="text-white/40 mb-8">Enter your email to view your interviews</p>
          <form onSubmit={loadDashboard} className="space-y-4">
            <input
              type="email"
              placeholder="recruiter@company.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full glass rounded-xl px-4 py-3.5 text-white font-body outline-none
                         border border-white/10 focus:border-signal/50 transition-colors"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-signal text-ink-950 rounded-xl font-display font-700
                         hover:bg-signal-dim transition-all active:scale-95 signal-glow"
            >
              {loading ? "Loading..." : "View Dashboard"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const stats = dashboard?.stats;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-800 text-white">Dashboard</h1>
            <p className="text-white/40 text-sm mt-1">{email}</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-signal text-ink-950 rounded-xl
                       font-display font-700 text-sm hover:bg-signal-dim active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Interview
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total", value: stats?.total || 0, icon: <Users className="w-5 h-5" /> },
            { label: "Completed", value: stats?.completed || 0, icon: <CheckCircle2 className="w-5 h-5 text-signal" /> },
            { label: "In Progress", value: stats?.inProgress || 0, icon: <Clock className="w-5 h-5 text-amber-interview" /> },
            { label: "Avg Score", value: stats?.avgScore ? `${Math.round(stats.avgScore)}` : "—", icon: <BarChart2 className="w-5 h-5 text-blue-400" /> },
          ].map((stat) => (
            <div key={stat.label} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/40 text-xs font-mono uppercase tracking-widest">{stat.label}</span>
                <div className="text-white/30">{stat.icon}</div>
              </div>
              <p className="text-3xl font-display font-800 text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search by name, email, or job title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full glass rounded-xl pl-11 pr-4 py-3 text-white text-sm outline-none
                       border border-white/5 focus:border-signal/30 transition-colors"
          />
        </div>

        {/* Interview list */}
        <div className="space-y-2">
          {(filtered || []).map((interview) => {
            const rec = RECOMMENDATION_LABELS[interview.recommendation];
            const alertCount = interview.session_data?.suspicious_events?.length || 0;
            return (
              <div
                key={interview._id}
                onClick={() => navigate(`/results/${interview._id}`)}
                className="glass rounded-xl p-5 flex items-center gap-4 cursor-pointer
                           hover:border-white/15 hover:bg-white/[0.02] transition-all group"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl bg-signal/10 border border-signal/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-signal font-display font-700 text-sm">
                    {interview.candidateName?.[0]?.toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-display font-600 text-white truncate">{interview.candidateName}</p>
                    {alertCount > 0 && (
                      <div className="flex items-center gap-1 text-amber-interview text-xs">
                        <AlertTriangle className="w-3 h-3" />
                        {alertCount}
                      </div>
                    )}
                  </div>
                  <p className="text-white/40 text-sm truncate">{interview.jobTitle} • {interview.candidateEmail}</p>
                </div>

                {/* Status */}
                <span className={`px-2.5 py-1 rounded-lg text-xs font-mono ${STATUS_COLORS[interview.status] || "text-white/40"}`}>
                  {interview.status}
                </span>

                {/* Score */}
                {interview.overallScore && (
                  <div className="text-right">
                    <p className="font-display font-800 text-white text-lg">{interview.overallScore}</p>
                    <p className="text-white/30 text-xs">/100</p>
                  </div>
                )}

                {/* Recommendation */}
                {rec && (
                  <span className={`text-sm font-display font-700 ${rec.color} hidden md:block`}>
                    {rec.label}
                  </span>
                )}

                <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors flex-shrink-0" />
              </div>
            );
          })}

          {filtered?.length === 0 && (
            <div className="text-center py-16 text-white/30">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No interviews found</p>
            </div>
          )}
        </div>
      </div>

      {/* Create interview modal */}
      {showCreate && (
        <CreateInterviewModal recruiterEmail={email} onClose={() => setShowCreate(false)} onCreated={loadDashboard} />
      )}
    </div>
  );
}

// ── Create Interview Modal ─────────────────────────────────────────────────

function CreateInterviewModal({ recruiterEmail, onClose, onCreated }) {
  const [form, setForm] = useState({
    candidateName: "",
    candidateEmail: "",
    jobTitle: "",
    companyName: "",
    questions: [
      { text: "Tell me about yourself and your background.", category: "general", timeLimit: 120 },
      { text: "What's your greatest technical achievement?", category: "technical", timeLimit: 180 },
      { text: "Describe a challenging situation and how you handled it.", category: "behavioral", timeLimit: 150 },
    ],
  });
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const data = await createInterview({ ...form, recruiterEmail });
      setLink(data.interviewLink);
      onCreated();
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
      <div className="glass rounded-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-display font-700 text-white mb-6">New Interview</h2>

        {link ? (
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-signal mx-auto mb-4" />
            <p className="text-white/60 mb-4">Interview link created! Share this with the candidate:</p>
            <div className="glass rounded-xl p-4 font-mono text-sm text-signal break-all mb-6">{link}</div>
            <button
              onClick={() => { navigator.clipboard.writeText(link); }}
              className="px-6 py-2.5 bg-signal text-ink-950 rounded-xl font-display font-700 text-sm mr-3"
            >
              Copy Link
            </button>
            <button onClick={onClose} className="px-6 py-2.5 glass rounded-xl text-white/60 text-sm">Close</button>
          </div>
        ) : (
          <div className="space-y-4">
            {[
              { label: "Candidate Name", key: "candidateName", type: "text" },
              { label: "Candidate Email", key: "candidateEmail", type: "email" },
              { label: "Job Title", key: "jobTitle", type: "text" },
              { label: "Company Name", key: "companyName", type: "text" },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="text-white/40 text-xs font-mono uppercase tracking-wider mb-1.5 block">{label}</label>
                <input
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full glass rounded-xl px-4 py-2.5 text-white text-sm outline-none border border-white/10 focus:border-signal/50"
                />
              </div>
            ))}

            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 py-3 glass rounded-xl text-white/60 text-sm">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 bg-signal text-ink-950 rounded-xl font-display font-700 text-sm hover:bg-signal-dim active:scale-95 transition-all"
              >
                {loading ? "Creating..." : "Create Interview"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}