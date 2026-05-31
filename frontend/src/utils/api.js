import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL 
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api',
  timeout: 30000,
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    console.error("API Error:", err.response?.data || err.message);
    return Promise.reject(err.response?.data || err);
  }
);

export const getInterview = (token) => api.get(`/interviews/${token}`);
export const getInterviewResults = (id) => api.get(`/interviews/${id}/results`);
export const createInterview = (data) => api.post("/interviews", data);

export const markHardwareCheckPassed = (data) => api.post("/sessions/hardware-check-passed", data);
export const startSession = (data) => api.post("/sessions/start", data);
export const completeSession = (data) => api.post("/sessions/complete", data);
export const resumeSession = (id) => api.get(`/sessions/${id}/resume`);

export const notifyQuestionStart = (data) => api.post("/chunks/question-start", data);
export const notifyQuestionEnd = (data) => api.post("/chunks/question-end", data);

export const uploadChunk = async ({ chunk, sessionId, questionIndex, chunkIndex, interviewId, isFinal }) => {
  const formData = new FormData();
  formData.append("chunk", chunk, `chunk_${chunkIndex}.webm`);
  formData.append("sessionId", sessionId);
  formData.append("questionIndex", questionIndex);
  formData.append("chunkIndex", chunkIndex);
  formData.append("interviewId", interviewId);
  formData.append("isFinal", isFinal ? "true" : "false");

  return api.post("/chunks/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
};

export const getDashboard = (email) => api.get(`/recruiters/dashboard?email=${email}`);
export const getRecruiterInterview = (id) => api.get(`/recruiters/interview/${id}`);

export default api;