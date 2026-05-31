import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center animate-fade-up">
        <p className="text-8xl font-display font-800 text-signal mb-4">404</p>
        <h1 className="text-2xl font-display font-700 text-white mb-3">Page Not Found</h1>
        <p className="text-white/40 mb-8">The page you're looking for doesn't exist.</p>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 mx-auto px-6 py-3 glass rounded-xl
                     text-white/60 hover:text-white transition-colors border border-white/10"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Home
        </button>
      </div>
    </div>
  );
}