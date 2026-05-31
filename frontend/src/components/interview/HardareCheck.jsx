import { useState, useRef, useEffect } from "react";
import { Camera, Mic, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from "lucide-react";

export default function HardwareCheck({ onPassed }) {
  const videoRef = useRef(null);
  const [checks, setChecks] = useState({
    camera: "idle",   // idle | checking | pass | fail
    microphone: "idle",
    browser: "idle",
  });
  const [stream, setStream] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const animFrameRef = useRef(null);

  useEffect(() => {
    runChecks();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const runChecks = async () => {
    // Browser check
    setChecks((c) => ({ ...c, browser: "checking" }));
    const browserOk =
      typeof MediaRecorder !== "undefined" &&
      typeof window.speechSynthesis !== "undefined";
    setChecks((c) => ({ ...c, browser: browserOk ? "pass" : "fail" }));

    // Camera + mic check
    setChecks((c) => ({ ...c, camera: "checking", microphone: "checking" }));
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      setChecks((c) => ({ ...c, camera: "pass", microphone: "pass" }));

      // Animate mic level
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      const source = ctx.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(Math.min(100, avg * 2));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      const isCamera = err.message.includes("video") || err.name === "NotFoundError";
      setChecks((c) => ({
        ...c,
        camera: isCamera || err.name === "NotAllowedError" ? "fail" : "pass",
        microphone: err.name === "NotAllowedError" ? "fail" : "pass",
      }));
    }
  };

  const allPassed = Object.values(checks).every((s) => s === "pass");

  const statusIcon = (status) => {
    if (status === "idle" || status === "checking")
      return <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-signal animate-spin" />;
    if (status === "pass") return <CheckCircle2 className="w-5 h-5 text-signal" />;
    return <XCircle className="w-5 h-5 text-danger" />;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-10 animate-fade-up">
          <p className="text-signal font-mono text-sm tracking-widest uppercase mb-3">Step 1 of 3</p>
          <h1 className="text-4xl font-display font-700 text-white mb-3">Hardware Check</h1>
          <p className="text-ink-100/60 font-body">
            Let's make sure your camera and microphone are working before the interview begins.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Camera preview */}
          <div className="glass rounded-2xl overflow-hidden aspect-video relative">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {checks.camera !== "pass" && (
              <div className="absolute inset-0 flex items-center justify-center bg-ink-950/80">
                <div className="text-center">
                  <Camera className="w-12 h-12 text-white/20 mx-auto mb-2" />
                  <p className="text-white/40 text-sm">
                    {checks.camera === "checking" ? "Requesting camera..." : "Camera unavailable"}
                  </p>
                </div>
              </div>
            )}
            {checks.camera === "pass" && (
              <div className="absolute top-3 right-3 bg-signal/20 text-signal text-xs font-mono px-2 py-1 rounded-full border border-signal/30">
                LIVE
              </div>
            )}
          </div>

          {/* Checks list */}
          <div className="space-y-4">
            {/* Camera */}
            <div className="glass rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                <Camera className="w-5 h-5 text-white/60" />
              </div>
              <div className="flex-1">
                <p className="font-display font-600 text-white text-sm">Camera</p>
                <p className="text-ink-100/40 text-xs">
                  {checks.camera === "fail" ? "Check permissions in browser settings" : "HD video capture"}
                </p>
              </div>
              {statusIcon(checks.camera)}
            </div>

            {/* Microphone */}
            <div className="glass rounded-xl p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-white/60" />
                </div>
                <div className="flex-1">
                  <p className="font-display font-600 text-white text-sm">Microphone</p>
                  <p className="text-ink-100/40 text-xs">Audio input level</p>
                </div>
                {statusIcon(checks.microphone)}
              </div>
              {checks.microphone === "pass" && (
                <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-signal rounded-full transition-all duration-100"
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
              )}
            </div>

            {/* Browser */}
            <div className="glass rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                <span className="text-white/60 text-lg">🌐</span>
              </div>
              <div className="flex-1">
                <p className="font-display font-600 text-white text-sm">Browser Compatibility</p>
                <p className="text-ink-100/40 text-xs">MediaRecorder + Speech APIs</p>
              </div>
              {statusIcon(checks.browser)}
            </div>

            {/* Warning if failed */}
            {Object.values(checks).some((s) => s === "fail") && (
              <div className="glass rounded-xl p-4 border border-amber-interview/30 bg-amber-interview/5">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-interview flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-interview text-sm font-display font-600">Action Required</p>
                    <p className="text-amber-interview/70 text-xs mt-1">
                      Please allow camera & microphone permissions in your browser, then{" "}
                      <button onClick={runChecks} className="underline hover:text-amber-interview">
                        retry the check
                      </button>
                      .
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Continue button */}
            <button
              onClick={() => {
                stream?.getTracks().forEach((t) => t.stop());
                onPassed();
              }}
              disabled={!allPassed}
              className={`w-full py-3.5 rounded-xl font-display font-700 text-sm transition-all duration-200 flex items-center justify-center gap-2
                ${allPassed
                  ? "bg-signal text-ink-950 hover:bg-signal-dim active:scale-95 signal-glow"
                  : "bg-white/5 text-white/20 cursor-not-allowed"
                }`}
            >
              {allPassed ? "Continue to Instructions" : "Complete all checks"}
              {allPassed && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}