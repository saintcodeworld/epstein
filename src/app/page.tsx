"use client";

import React, { useState, useEffect } from "react";
import RunnerGame from "@/components/RunnerGame";
import Auth from "@/components/Auth";

export default function Home() {
  const [userPublicKey, setUserPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Simple session persistence using localStorage
  useEffect(() => {
    const stored = localStorage.getItem("runner_session_pubkey");
    if (stored) {
      setUserPublicKey(stored);
    }
    setLoading(false);
  }, []);

  const handleLogin = (key: string) => {
    setUserPublicKey(key);
    localStorage.setItem("runner_session_pubkey", key);
  };

  const handleLogout = () => {
    setUserPublicKey(null);
    localStorage.removeItem("runner_session_pubkey");
  }

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;

  return (
    <main className="min-h-screen w-full bg-neutral-950 flex items-center justify-center overflow-hidden">
      {!userPublicKey ? (
        <Auth onLogin={handleLogin} />
      ) : (
        <div className="w-full h-full">
          <RunnerGame />
          <div className="absolute top-4 right-4 z-50 text-right pointer-events-none">
            <div className="text-[10px] text-zinc-500 font-mono">PLAYER ID</div>
            <div className="text-xs text-zinc-300 font-mono opacity-50">{userPublicKey.slice(0, 4)}...{userPublicKey.slice(-4)}</div>
          </div>

          <button
            onClick={handleLogout}
            className="absolute bottom-4 right-4 z-50 text-xs text-red-500 hover:text-white underline pointer-events-auto"
          >
            LOGOUT
          </button>
        </div>
      )}
    </main>
  );
}
