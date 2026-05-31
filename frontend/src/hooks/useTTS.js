import { useCallback, useRef } from "react";

export function useTTS() {
  const utteranceRef = useRef(null);

  const speak = useCallback((text, onEnd) => {
    if (!window.speechSynthesis) {
      console.warn("SpeechSynthesis not supported");
      onEnd?.();
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    // Find a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.name.includes("Google") ||
        v.name.includes("Microsoft") ||
        v.lang === "en-US"
    );
    if (preferred) utterance.voice = preferred;

    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = "en-US";

    utterance.onend = () => onEnd?.();
    utterance.onerror = (e) => {
      console.error("TTS error:", e.error);
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, stop };
}