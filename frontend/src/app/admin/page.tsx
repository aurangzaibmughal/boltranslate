"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession, signIn } from "next-auth/react";
import {
  ShieldCheck,
  Database,
  Users,
  Activity,
  ArrowLeft,
  Trash2,
  Star,
  Search,
  Download,
  RotateCcw,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Lock,
} from "lucide-react";

interface AdminRecord {
  id: string;
  urduText: string;
  englishText: string;
  timestamp: string;
  isFavorite: boolean;
  audioDuration: number;
}

export default function AdminDashboardPage() {
  const { data: session, status } = useSession();
  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Strictly locked to only aurangzaib.mughal@gmail.com
  const SUPER_ADMIN_EMAIL = "aurangzaib.mughal@gmail.com";
  const isAdmin = session?.user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setRecords(data);
        }
      }
    } catch (e) {
      console.error("Admin fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const deleteRecord = async (id: string) => {
    if (!confirm("Are you sure you want to delete this record as Admin?")) return;
    setRecords((prev) => prev.filter((r) => r.id !== id));
    showToast("Record deleted from Turso Cloud DB");
    try {
      await fetch(`/api/history?id=${id}`, { method: "DELETE" });
    } catch (e) {
      console.error(e);
    }
  };

  const toggleFavorite = async (id: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isFavorite: !r.isFavorite } : r))
    );
    try {
      await fetch(`/api/history?id=${id}`, { method: "PATCH" });
    } catch (e) {
      console.error(e);
    }
  };

  const exportAllJSON = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BolTranslate_Admin_Dump_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const filteredRecords = records.filter(
    (r) =>
      r.urduText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.englishText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.includes(searchQuery)
  );

  const starredCount = records.filter((r) => r.isFavorite).length;

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#090b10] flex items-center justify-center text-slate-300">
        <Activity className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  // Admin Access Gate
  if (!session || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#090b10] text-slate-100 flex flex-col items-center justify-center p-6 relative">
        <div className="w-full max-w-md bg-[#0e121b] border border-slate-800 rounded-3xl p-8 text-center shadow-2xl relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Admin Portal</h1>
          <p className="text-xs text-slate-400 mb-6">
            Yeh page sirf Aurangzaib Bhai (Super Admin) ke liye makhsoos hai. Baraye meherbani apne Admin Google Account se login karein.
          </p>

          {!session ? (
            <button
              onClick={() => signIn("google")}
              className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm transition flex items-center justify-center gap-2"
            >
              Google Account se Sign In karein
            </button>
          ) : (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs">
              Logged in as: <span className="font-mono text-white">{session.user?.email}</span> (Access Denied - Not Super Admin)
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-800">
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-emerald-400 flex items-center justify-center gap-1.5 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to BolTranslate App
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090b10] text-slate-100 flex flex-col">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-black font-semibold text-xs sm:text-sm px-4 py-2 rounded-full shadow-2xl flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Admin Header */}
      <header className="border-b border-slate-800 bg-[#0d1017]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              title="Back to App"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-white">
                Bol<span className="text-emerald-400">Translate</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Admin Panel
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
              {session.user?.image && (
                <img
                  src={session.user.image}
                  alt="Admin Avatar"
                  className="w-5 h-5 rounded-full"
                />
              )}
              <span className="hidden sm:inline font-medium">
                {session.user?.name}
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">(Super Admin)</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Admin Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
        
        {/* Metric Cards Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Translations */}
          <div className="bg-[#0e121b] border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Total Translations</p>
              <h3 className="text-3xl font-black text-white mt-1">{records.length}</h3>
              <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> In Turso Cloud DB
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Database className="w-6 h-6" />
            </div>
          </div>

          {/* Card 2: Starred Items */}
          <div className="bg-[#0e121b] border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Starred Records</p>
              <h3 className="text-3xl font-black text-amber-400 mt-1">{starredCount}</h3>
              <p className="text-[11px] text-slate-400 mt-1">Bookmarked by users</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <Star className="w-6 h-6 fill-amber-400" />
            </div>
          </div>

          {/* Card 3: Database Engine */}
          <div className="bg-[#0e121b] border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Cloud Database</p>
              <h3 className="text-lg font-bold text-blue-400 mt-1">Turso libSQL</h3>
              <p className="text-[11px] text-slate-400 mt-1">AWS Mumbai (ap-south-1)</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <Activity className="w-6 h-6" />
            </div>
          </div>

          {/* Card 4: Auth Status */}
          <div className="bg-[#0e121b] border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Security</p>
              <h3 className="text-lg font-bold text-emerald-400 mt-1">Google OAuth</h3>
              <p className="text-[11px] text-slate-400 mt-1">NextAuth Production</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
        </section>

        {/* Master Database Table Section */}
        <section className="bg-[#0e121b] border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
          {/* Table Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" /> Master Records Log
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Turso Cloud SQLite database ke tamam live records
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Bar */}
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Urdu or English..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={fetchAdminData}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                title="Refresh Records"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={exportAllJSON}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" /> Export JSON
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-16 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400 animate-spin" />
                Loading Turso records...
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm">
                No records found matching your search.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                    <th className="py-3 px-3">ID</th>
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-4 text-right">Urdu Text (اردو)</th>
                    <th className="py-3 px-4">English Translation</th>
                    <th className="py-3 px-3 text-center">Favorite</th>
                    <th className="py-3 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRecords.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="py-3.5 px-3 font-mono text-slate-500">
                        #{item.id}
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                        {item.timestamp}
                      </td>
                      <td className="py-3.5 px-4 font-serif text-emerald-300 text-right text-sm">
                        {item.urduText}
                      </td>
                      <td className="py-3.5 px-4 text-blue-300 text-xs font-medium">
                        {item.englishText}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <button
                          onClick={() => toggleFavorite(item.id)}
                          className="p-1 rounded hover:bg-slate-800 transition"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              item.isFavorite
                                ? "text-amber-400 fill-amber-400"
                                : "text-slate-600"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <button
                          onClick={() => deleteRecord(item.id)}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition"
                          title="Admin Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 bg-[#0b0d13] py-5 text-center text-xs text-slate-500">
        BolTranslate Admin Panel &bull; Super Admin: Aurangzaib Mughal
      </footer>
    </div>
  );
}
