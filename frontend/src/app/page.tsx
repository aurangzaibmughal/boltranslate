"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  Mic,
  MicOff,
  Volume2,
  Copy,
  Check,
  RotateCcw,
  Download,
  Settings,
  Radio,
  Sparkles,
  ArrowRightLeft,
  Activity,
  Layers,
  ChevronRight,
  Bot,
  ExternalLink,
  Star,
  Trash2,
  Database,
  LogOut,
  LogIn,
  User,
  ShieldCheck,
} from "lucide-react";

interface TranslationItem {
  id: string;
  timestamp: string;
  urduText: string;
  englishText: string;
  isFavorite?: boolean;
}

export default function BolTranslatePage() {
  const { data: session } = useSession();
  const [isRecording, setIsRecording] = useState(false);
  const [currentUrdu, setCurrentUrdu] = useState("");
  const [currentEnglish, setCurrentEnglish] = useState("");
  const [activeTab, setActiveTab] = useState<"both" | "urdu" | "english">("both");
  const [historyFilter, setHistoryFilter] = useState<"all" | "favorites">("all");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<TranslationItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number[]>(new Array(20).fill(10));
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [backendUrl, setBackendUrl] = useState("ws://localhost:8000/ws");
  const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:8000");
  const [statusMessage, setStatusMessage] = useState("Tap mic to speak in Urdu");

  const [isMobileMode, setIsMobileMode] = useState(false);
  const [speechLang, setSpeechLang] = useState<"ur-PK" | "ur">("ur-PK");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);

  // Auto-detect backend host & mobile mode
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname) {
      const host = window.location.hostname;
      setBackendUrl(`ws://${host}:8000/ws`);
      setApiBaseUrl(`http://${host}:8000`);

      // Mobile detection — use Web Speech API if not on localhost
      const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
      const isLocal = host === "localhost" || host === "127.0.0.1";
      setIsMobileMode(isMobile || !isLocal);
    }
  }, []);

  // Fetch history from Next.js Turso API
  const loadHistoryFromDB = async () => {
    // ── PC / Backend mode: MediaRecorder + WebSocket + Whisper AI ──
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setHistory(data);
          return;
        }
      }
    } catch (err) {
      console.log("Turso fetch error:", err);
    }
  };

  useEffect(() => {
    loadHistoryFromDB();
  }, []);

  // WebSocket Connection
  useEffect(() => {
    let ws: WebSocket;
    // ── PC / Backend mode: MediaRecorder + WebSocket + Whisper AI ──
    try {
      ws = new WebSocket(backendUrl);
      ws.onopen = () => {
        setIsConnected(true);
        setStatusMessage("Connected to Python AI Engine & SQLite DB");
      };
      ws.onmessage = (event) => {
        // ── PC / Backend mode: MediaRecorder + WebSocket + Whisper AI ──
    try {
          const data = JSON.parse(event.data);
          if (data.urdu) setCurrentUrdu(data.urdu);
          if (data.english) setCurrentEnglish(data.english);
          if (data.final) {
            commitNewRecord(data.urdu, data.english);
          }
        } catch {
          setCurrentEnglish(event.data);
        }
      };
      ws.onclose = () => setIsConnected(false);
      ws.onerror = () => setIsConnected(false);
      socketRef.current = ws;
    } catch {
      setIsConnected(false);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [backendUrl]);

  // Audio recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Start Mic — Mobile uses Web Speech API with auto-restart, PC uses WebSocket + Whisper
  const startRecording = async () => {
    // ── MOBILE / No-backend mode: use browser's built-in Web Speech API ──
    if (isMobileMode || !isConnected) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognitionAPI) {
        alert("Aapka browser Speech Recognition support nahi karta. Chrome ya Edge use karein.");
        return;
      }

      let fullTranscript = "";        // Poora accumulated text across restarts
      let userStopped = false;        // ✅ Track: kya user ne khud STOP dabaya?
      let waveInterval: ReturnType<typeof setInterval> | null = null;

      const startRecognitionSession = () => {
        if (userStopped) return;      // User ne stop kiya — restart mat karo

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recognition = new SpeechRecognitionAPI() as any;
        recognition.lang = "ur-PK";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          if (!isRecording) {
            setIsRecording(true);
            setStatusMessage("🎤 Urdu bolein... STOP dabane tak recording chalu rahegi!");
          }
          // Waveform animation
          if (!waveInterval) {
            waveInterval = setInterval(() => {
              setAudioLevel(Array.from({ length: 20 }, () => Math.random() * 70 + 10));
            }, 100);
          }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          let interimText = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              fullTranscript += t + " ";
            } else {
              interimText += t;
            }
          }
          // Live display — final + interim
          setCurrentUrdu((fullTranscript + interimText).trim());
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onerror = (event: any) => {
          if (event.error === "not-allowed") {
            userStopped = true;
            setIsRecording(false);
            alert("Microphone permission denied. Browser settings mein allow karein.");
          }
          // "no-speech", "aborted" etc. — ignore karo, onend auto-restart karega
        };

        recognition.onend = async () => {
          // ✅ Agar user ne STOP nahi dabaya — foran restart karo!
          if (!userStopped) {
            setTimeout(() => startRecognitionSession(), 150); // 150ms baad restart
            return;
          }

          // User ne STOP dabaya — ab translate karo
          if (waveInterval) { clearInterval(waveInterval); waveInterval = null; }
          setIsRecording(false);
          setAudioLevel(new Array(20).fill(10));

          const finalText = fullTranscript.trim();
          if (!finalText) {
            setStatusMessage("Koi awaaz nahi aayi. Dobara try karein.");
            return;
          }

          setStatusMessage("⏳ Translating to English...");
          try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ur&tl=en&dt=t&q=${encodeURIComponent(finalText)}`;
            const res = await fetch(url);
            const json = await res.json();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const englishText: string = json[0].map((item: any) => item[0]).join("");
            setCurrentEnglish(englishText);
            setStatusMessage("✅ Translation ready! AI buttons dabayein.");
            commitNewRecord(finalText, englishText);
          } catch {
            setCurrentEnglish("[Translation error — check internet]");
            setStatusMessage("Translation failed. Try again.");
          }
        };

        // ✅ Store stop function — STOP button is ne call karega
        speechRecRef.current = {
          stop: () => {
            userStopped = true;
            recognition.stop();
          }
        };

        recognition.start();
      };

      // Reset state
      fullTranscript = "";
      userStopped = false;
      setCurrentUrdu("");
      setCurrentEnglish("");
      startRecognitionSession();
      return;
    }

    // ── PC / Backend mode: MediaRecorder + WebSocket + Whisper AI ──
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const updateVisualizer = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        const bars: number[] = [];
        for (let i = 0; i < 20; i++) {
          const val = dataArray[i % dataArray.length];
          bars.push(Math.max(8, (val / 255) * 85));
        }
        setAudioLevel(bars);
        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      updateVisualizer();

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(event.data);
        }
      };

      mediaRecorder.start(350);
      setIsRecording(true);
      setStatusMessage("Listening... Speak clearly in Urdu (اردو میں بولیں)");

      if (!isConnected) {
        simulateLiveTranslation();
      }
    } catch (err) {
      console.error("Microphone access error:", err);
      alert("Microphone permission denied or device not found. Please allow microphone access.");
    }
  };

  // Stop Recording
  const stopRecording = () => {
    // Stop Web Speech API if active
    if (speechRecRef.current) {
      speechRecRef.current.stop();
      speechRecRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    setIsRecording(false);
    setAudioLevel(new Array(20).fill(10));
    setStatusMessage("Recording stopped. Ready to translate.");
  };

  const simulateLiveTranslation = () => {
    const demoPhrases = [
      { urdu: "میرا نام اورنگزیب ہے اور یہ بول ٹرانسلیٹ ہے۔", english: "My name is Aurangzaib and this is BolTranslate." },
      { urdu: "ہماری گفتگو اب براہ راست ڈیٹا بیس میں محفوظ ہو رہی ہے۔", english: "Our conversation is now being directly saved to the database." },
      { urdu: "یہ پرامپٹ چیٹ جی پی ٹی اور جیمینائی کو بھیجیں۔", english: "Send this prompt to ChatGPT and Gemini." },
    ];
    const randomItem = demoPhrases[Math.floor(Math.random() * demoPhrases.length)];

    setTimeout(() => {
      setCurrentUrdu(randomItem.urdu);
      setTimeout(() => {
        setCurrentEnglish(randomItem.english);
      }, 700);
    }, 1200);
  };

  // Persist record to Turso Cloud DB
  const commitNewRecord = async (urdu: string, english: string) => {
    if (!urdu && !english) return;
    const optimisticItem: TranslationItem = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      urduText: urdu || "اردو آواز",
      englishText: english || "English Translation",
      isFavorite: false,
    };

    setHistory((prev) => [optimisticItem, ...prev]);

    // ── PC / Backend mode: MediaRecorder + WebSocket + Whisper AI ──
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urdu, english }),
      });
      if (res.ok) {
        const saved = await res.json();
        setHistory((prev) =>
          prev.map((item) => (item.id === optimisticItem.id ? { ...item, id: saved.id } : item))
        );
        showToast("Saved to Turso Cloud Database!");
      }
    } catch (e) {
      console.log("Save error:", e);
    }

    setCurrentUrdu("");
    setCurrentEnglish("");
  };

  // Toggle Favorite in Turso Cloud DB
  const toggleFavorite = async (id: string) => {
    setHistory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isFavorite: !item.isFavorite } : item))
    );

    // ── PC / Backend mode: MediaRecorder + WebSocket + Whisper AI ──
    try {
      await fetch(`/api/history?id=${id}`, { method: "PATCH" });
    } catch (e) {
      console.log("Error toggling favorite:", e);
    }
  };

  // Delete Record from Turso Cloud DB
  const deleteRecord = async (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    showToast("Translation deleted from Cloud DB");

    // ── PC / Backend mode: MediaRecorder + WebSocket + Whisper AI ──
    try {
      await fetch(`/api/history?id=${id}`, { method: "DELETE" });
    } catch (e) {
      console.log("Error deleting record:", e);
    }
  };

  // Clear All History from Turso Cloud DB
  const clearAllHistory = async () => {
    if (!confirm("Are you sure you want to clear all history from Turso Cloud Database?")) return;
    setHistory([]);
    showToast("Cloud Database history cleared");

    // ── PC / Backend mode: MediaRecorder + WebSocket + Whisper AI ──
    try {
      await fetch("/api/history", { method: "DELETE" });
    } catch (e) {
      console.log("Error clearing history:", e);
    }
  };

  const speakEnglish = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text to speech not supported in this browser.");
    }
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast("Text copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getActivePrompt = () => {
    if (currentEnglish) return currentEnglish;
    if (history.length > 0 && history[0]?.englishText) return history[0].englishText;
    return "Hello! I am using BolTranslate to speak in Urdu and translate into English.";
  };

  const sendToChatGPT = (text?: string) => {
    const prompt = text || getActivePrompt();
    navigator.clipboard.writeText(prompt);
    showToast("Prompt copied! Opening ChatGPT...");
    window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, "_blank");
  };

  const sendToGemini = (text?: string) => {
    const prompt = text || getActivePrompt();
    navigator.clipboard.writeText(prompt);
    showToast("Copied! Gemini mein Paste (Ctrl+V) karein");
    window.open(`https://gemini.google.com/app?prompt=${encodeURIComponent(prompt)}`, "_blank");
  };

  const sendToClaude = (text?: string) => {
    const prompt = text || getActivePrompt();
    navigator.clipboard.writeText(prompt);
    showToast("Prompt copied! Opening Claude AI...");
    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, "_blank");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const exportHistory = () => {
    const filtered = historyFilter === "favorites" ? history.filter((i) => i.isFavorite) : history;
    const content = filtered
      .map((item) => `[${item.timestamp}] ${item.isFavorite ? "⭐" : ""}\nUrdu: ${item.urduText}\nEnglish: ${item.englishText}\n------------------------`)
      .join("\n\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BolTranslate_History_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const displayedHistory = historyFilter === "favorites" ? history.filter((i) => i.isFavorite) : history;

  return (
    <div className="flex flex-col min-h-screen bg-[#090b10] text-slate-100 relative overflow-x-hidden pb-12 sm:pb-0">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-black font-semibold text-xs sm:text-sm px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
          <Sparkles className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Background Neon Glow Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[320px] sm:w-[500px] h-[320px] sm:h-[500px] bg-emerald-500/10 rounded-full blur-[90px] sm:blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[350px] sm:w-[550px] h-[350px] sm:h-[550px] bg-blue-500/10 rounded-full blur-[100px] sm:blur-[140px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#0d1017]/85 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-xl overflow-hidden border border-slate-700/60 shadow-md shadow-emerald-500/10 bg-[#121620] p-1 flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="BolTranslate Logo"
                width={40}
                height={40}
                className="object-contain"
                priority
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-white truncate">
                  Bol<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-500">Translate</span>
                </span>
                <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex-shrink-0">
                  Turso Cloud DB
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden xs:block sm:block truncate">
                Urdu Voice to Real-Time English &amp; SQLite Storage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Google OAuth Login / User Avatar */}
            {session?.user ? (
              <div className="flex items-center gap-2">
                {/* Admin Button strictly for aurangzaib.mughal@gmail.com */}
                {session.user.email?.toLowerCase() === "aurangzaib.mughal@gmail.com" && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition"
                    title="Super Admin Dashboard"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden xs:inline">Admin</span>
                  </Link>
                )}
                <div className="flex items-center gap-2 bg-[#121622] border border-slate-700/80 rounded-full py-1 pl-1 pr-2.5">
                  {session.user.image ? (
                    <img
                      src={session.user.image}
                      alt={session.user.name || "User"}
                      className="w-7 h-7 rounded-full object-cover border border-emerald-400/40"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <span className="text-xs font-medium text-slate-200 hidden sm:inline max-w-[100px] truncate">
                    {session.user.name?.split(" ")[0]}
                  </span>
                  <button
                    onClick={() => signOut()}
                    className="p-1 rounded-full text-slate-400 hover:text-red-400 transition"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold shadow-sm transition active:scale-95"
                title="Sign in with Google"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="hidden xs:inline">Sign In</span>
              </button>
            )}

            <div
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium border ${
                isConnected
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              <span className="hidden sm:inline">
                {isConnected ? "Engine & DB: Live" : "Local Standby"}
              </span>
              <span className="sm:hidden">{isConnected ? "Live" : "Standby"}</span>
            </div>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-xl bg-slate-800/80 active:bg-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition touch-manipulation"
              title="Connection Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="bg-[#10141f] border-b border-slate-800 px-4 py-3.5 animate-in slide-in-from-top duration-200">
            <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="flex-1">
                <label className="text-[11px] sm:text-xs text-slate-400 block mb-1">
                  FastAPI WebSocket Endpoint URL (Python Backend):
                </label>
                <input
                  type="text"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="ws://localhost:8000/ws"
                />
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black transition active:scale-95"
              >
                Save &amp; Connect
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 flex flex-col gap-5 sm:gap-8">
        
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-[#111522] to-[#0c0f17] border border-slate-800/90 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl relative">
          <div className="flex flex-col items-center text-center gap-4 sm:gap-6">
            <div className="inline-flex max-w-full items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/70 text-[11px] sm:text-xs font-medium text-slate-300">
              <Activity className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 animate-pulse" />
              <span className="truncate">{statusMessage}</span>
              {isRecording && (
                <span className="font-mono text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 flex-shrink-0">
                  {formatTime(recordingDuration)}
                </span>
              )}
            </div>

            {/* Central Mic */}
            <div className="relative flex items-center justify-center my-1 sm:my-2">
              <div
                className={`absolute w-28 h-28 sm:w-36 sm:h-36 rounded-full border-2 border-dashed transition-all duration-700 pointer-events-none ${
                  isRecording
                    ? "border-emerald-400/80 animate-spin-slow scale-110 shadow-lg shadow-emerald-500/20"
                    : "border-slate-700/60"
                }`}
              />

              {isRecording && (
                <div className="absolute w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 blur-xl opacity-60 animate-pulse pointer-events-none" />
              )}

              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl touch-manipulation active:scale-95 group ${
                  isRecording
                    ? "bg-gradient-to-tr from-emerald-500 to-teal-400 text-black scale-105 shadow-emerald-500/50"
                    : "bg-gradient-to-tr from-[#161c2b] to-[#1e2638] text-white hover:border-emerald-500/60 border border-slate-700 hover:shadow-emerald-500/20"
                }`}
                aria-label={isRecording ? "Stop recording" : "Start speaking in Urdu"}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-7 h-7 sm:w-9 sm:h-9 transition-transform" />
                    <span className="text-[10px] sm:text-[11px] font-bold mt-1 tracking-wider uppercase">
                      Stop
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-7 h-7 sm:w-9 sm:h-9 text-emerald-400 group-hover:text-emerald-300 transition-transform" />
                    <span className="text-[10px] sm:text-[11px] font-semibold text-slate-300 group-hover:text-white mt-1 tracking-wider uppercase">
                      Urdu Bolain
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Waveform */}
            <div className="w-full max-w-xs sm:max-w-md h-12 sm:h-14 bg-slate-950/60 rounded-xl sm:rounded-2xl border border-slate-800/80 px-3 sm:px-4 flex items-center justify-center gap-1 sm:gap-1.5 shadow-inner">
              {audioLevel.map((height, i) => (
                <div
                  key={i}
                  style={{ height: `${height}%` }}
                  className={`w-1.5 sm:w-2 rounded-full transition-all duration-75 ${
                    isRecording
                      ? i < 10
                        ? "bg-gradient-to-t from-emerald-600 to-emerald-400"
                        : "bg-gradient-to-t from-blue-600 to-cyan-400"
                      : "bg-slate-800"
                  }`}
                />
              ))}
            </div>

            {/* Save to Database action button */}
            {(currentUrdu || currentEnglish) && (
              <button
                onClick={() => commitNewRecord(currentUrdu, currentEnglish)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800/90 active:bg-slate-700 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center justify-center gap-2 transition"
              >
                <Database className="w-4 h-4 text-emerald-400" /> Save to Database (boltranslate.db)
              </button>
            )}
          </div>
        </section>

        {/* PROMINENT AI ASSISTANTS HUB (ChatGPT, Claude, Gemini) */}
        <section className="bg-gradient-to-r from-[#10a37f]/10 via-[#0e121b] to-amber-500/10 border border-slate-800/90 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#10a37f] to-amber-500 p-0.5 flex items-center justify-center">
                <div className="w-full h-full bg-[#0c0f17] rounded-[10px] flex items-center justify-center">
                  <Bot className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                  Instant AI Prompter
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Always Ready
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Apni Urdu awaz ki translation ko 1-click mein ChatGPT, Claude ya Gemini par bhejein
                </p>
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5 self-end sm:self-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Active Prompt: <span className="text-slate-200 truncate max-w-[150px]">{currentEnglish || history[0]?.englishText || "Ready"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* ChatGPT Big Button */}
            <button
              onClick={() => sendToChatGPT()}
              className="flex items-center justify-between p-4 rounded-2xl bg-[#121622] hover:bg-[#151c2a] border border-[#10a37f]/40 hover:border-[#10a37f] shadow-lg shadow-[#10a37f]/5 hover:shadow-[#10a37f]/20 transition-all duration-200 group text-left active:scale-95 touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#10a37f]/15 border border-[#10a37f]/40 flex items-center justify-center text-[#10a37f] group-hover:scale-110 transition-transform">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm sm:text-base flex items-center gap-1.5">
                    ChatGPT <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#10a37f]/20 text-[#10a37f] font-mono">GPT-4o</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Prompt to ChatGPT</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-[#10a37f] transition-colors" />
            </button>

            {/* Claude AI Big Button */}
            <button
              onClick={() => sendToClaude()}
              className="flex items-center justify-between p-4 rounded-2xl bg-[#121622] hover:bg-[#1a1824] border border-amber-500/40 hover:border-amber-400 shadow-lg shadow-amber-500/5 hover:shadow-amber-500/20 transition-all duration-200 group text-left active:scale-95 touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm sm:text-base flex items-center gap-1.5">
                    Claude AI <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">Sonnet 3.5</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Prompt to Claude</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
            </button>

            {/* Google Gemini Big Button */}
            <button
              onClick={() => sendToGemini()}
              className="flex items-center justify-between p-4 rounded-2xl bg-[#121622] hover:bg-[#141b2c] border border-blue-500/40 hover:border-blue-400 shadow-lg shadow-blue-500/5 hover:shadow-blue-500/20 transition-all duration-200 group text-left active:scale-95 touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm sm:text-base flex items-center gap-1.5">
                    Google Gemini <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono">1.5 Pro</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Prompt to Gemini</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
            </button>
          </div>
        </section>

        {/* Mobile Tabs */}
        <div className="flex sm:hidden p-1 rounded-xl bg-slate-900 border border-slate-800">
          <button
            onClick={() => setActiveTab("both")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === "both" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            Split View
          </button>
          <button
            onClick={() => setActiveTab("urdu")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === "urdu" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "text-slate-400 hover:text-white"
            }`}
          >
            Urdu (اردو)
          </button>
          <button
            onClick={() => setActiveTab("english")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === "english" ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" : "text-slate-400 hover:text-white"
            }`}
          >
            English
          </button>
        </div>

        {/* Dual Live Display Cards */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* LEFT: Urdu */}
          <div
            className={`flex flex-col bg-[#0e121b] border border-emerald-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl relative overflow-hidden ${
              activeTab === "english" ? "hidden sm:flex" : "flex"
            }`}
          >
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
                <h2 className="font-semibold text-slate-200 text-sm sm:text-base">
                  Urdu Voice Stream (اردو تقریر)
                </h2>
              </div>
              <span className="text-[10px] sm:text-xs font-mono font-medium px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Input
              </span>
            </div>

            <div className="flex-1 min-h-[140px] sm:min-h-[180px] flex flex-col justify-center py-4 sm:py-6">
              {currentUrdu ? (
                <p
                  dir="rtl"
                  className="text-xl sm:text-2xl md:text-3xl font-medium leading-relaxed text-right text-emerald-300 font-serif tracking-wide break-words"
                >
                  {currentUrdu}
                </p>
              ) : (
                <div className="flex flex-col items-center justify-center text-center text-slate-500 gap-2">
                  <Radio className="w-6 h-6 sm:w-8 sm:h-8 opacity-40 text-emerald-400" />
                  <p className="text-xs sm:text-sm px-2">
                    {isRecording
                      ? "Listening... Aap jo bolenge yahan Urdu mein likha aayega..."
                      : "Mic dabayein aur Urdu mein bolna shuru karein."}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Speech Recognition
              </span>
              {currentUrdu && (
                <button
                  onClick={() => copyText(currentUrdu, "current-urdu")}
                  className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition py-1 px-2 rounded-lg active:bg-slate-800"
                >
                  {copiedId === "current-urdu" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </button>
              )}
            </div>
          </div>

          {/* RIGHT: English */}
          <div
            className={`flex flex-col bg-[#0e121b] border border-blue-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl relative overflow-hidden ${
              activeTab === "urdu" ? "hidden sm:flex" : "flex"
            }`}
          >
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-sm shadow-blue-400" />
                <h2 className="font-semibold text-slate-200 text-sm sm:text-base">
                  Real-Time English Translation
                </h2>
              </div>
              <span className="text-[10px] sm:text-xs font-mono font-medium px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Output
              </span>
            </div>

            <div className="flex-1 min-h-[140px] sm:min-h-[180px] flex flex-col justify-center py-4 sm:py-6">
              {currentEnglish ? (
                <div className="space-y-4">
                  <p className="text-xl sm:text-2xl md:text-3xl font-medium leading-relaxed text-blue-300 break-words">
                    {currentEnglish}
                  </p>

                  <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-1">
                      <Bot className="w-3 h-3 text-emerald-400" /> Ask AI:
                    </span>
                    <button
                      onClick={() => sendToChatGPT(currentEnglish)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#10a37f]/15 hover:bg-[#10a37f]/25 text-[#10a37f] border border-[#10a37f]/30 text-xs font-medium flex items-center gap-1.5 transition active:scale-95"
                      title="Send as prompt to ChatGPT"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10a37f]" />
                      ChatGPT <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </button>
                    <button
                      onClick={() => sendToGemini(currentEnglish)}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 text-xs font-medium flex items-center gap-1.5 transition active:scale-95"
                      title="Send as prompt to Google Gemini"
                    >
                      <Sparkles className="w-3 h-3 text-blue-400" />
                      Gemini <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </button>
                    <button
                      onClick={() => sendToClaude(currentEnglish)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium flex items-center gap-1.5 transition active:scale-95"
                      title="Send as prompt to Claude AI"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Claude <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center text-slate-500 gap-2">
                  <ArrowRightLeft className="w-6 h-6 sm:w-8 sm:h-8 opacity-40 text-blue-400" />
                  <p className="text-xs sm:text-sm px-2">
                    {isRecording
                      ? "Translating in real-time..."
                      : "English translation will appear here simultaneously."}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" /> Real-Time Stream
              </span>
              {currentEnglish && (
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => speakEnglish(currentEnglish)}
                    className="flex items-center gap-1 text-slate-400 hover:text-blue-400 transition py-1 px-2 rounded-lg active:bg-slate-800"
                    title="Speak Aloud"
                  >
                    <Volume2 className="w-4 h-4" /> Speak
                  </button>
                  <button
                    onClick={() => copyText(currentEnglish, "current-en")}
                    className="flex items-center gap-1 text-slate-400 hover:text-blue-400 transition py-1 px-2 rounded-lg active:bg-slate-800"
                  >
                    {copiedId === "current-en" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 bg-[#0b0d13] py-5 text-center text-[11px] sm:text-xs text-slate-500 px-4">
        <p>
          BolTranslate &bull; Built for Aurangzaib Mughal &bull; Powered by Whisper AI, FastAPI &amp; SQLite
        </p>
      </footer>
    </div>
  );
}
