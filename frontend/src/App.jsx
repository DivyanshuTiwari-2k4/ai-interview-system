import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import InterviewPage from "./pages/InterviewPage.jsx";
import RecruiterDashboard from "./pages/RecruiterDashboard.jsx";
import InterviewResults from "./pages/InterviewResults.jsx";
import NotFound from "./pages/NotFound.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/interview/:token" element={<InterviewPage />} />
      <Route path="/dashboard" element={<RecruiterDashboard />} />
      <Route path="/results/:id" element={<InterviewResults />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}