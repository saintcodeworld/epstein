"use client";

import React, { useState } from "react";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Eye, EyeOff, Copy, Check, AlertTriangle } from "lucide-react";

interface AuthProps {
    onLogin: (publicKey: string) => void;
}

export default function Auth({ onLogin }: AuthProps) {
    const [view, setView] = useState<"LOGIN" | "SIGNUP">("SIGNUP");
    const [privateKeyInput, setPrivateKeyInput] = useState("");
    const [error, setError] = useState("");
    const [generatedAccount, setGeneratedAccount] = useState<{
        publicKey: string;
        secretKey: string;
    } | null>(null);
    const [showSecret, setShowSecret] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleGenerateValues = () => {
        try {
            const keypair = Keypair.generate();
            const publicKey = keypair.publicKey.toString();
            const secretKey = bs58.encode(keypair.secretKey);
            setGeneratedAccount({ publicKey, secretKey });
            setError("");
        } catch (err) {
            console.error(err);
            setError("Failed to generate wallet");
        }
    };

    const handleLogin = () => {
        try {
            if (!privateKeyInput.trim()) {
                setError("Please enter a private key");
                return;
            }
            const decoded = bs58.decode(privateKeyInput.trim());
            const keypair = Keypair.fromSecretKey(decoded);
            onLogin(keypair.publicKey.toString());
        } catch (err) {
            console.error(err);
            setError("Invalid Private Key. Please check your input.");
        }
    };

    const copyToClipboard = () => {
        if (generatedAccount?.secretKey) {
            navigator.clipboard.writeText(generatedAccount.secretKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }

    const handleSignupContinue = () => {
        if (generatedAccount) {
            onLogin(generatedAccount.publicKey);
        }
    }

    return (
        <div className="w-full flex min-h-screen items-center justify-center bg-[url('/signup_background_clean.png')] bg-cover bg-center bg-no-repeat p-4 font-sans text-white">
            <div className="w-full max-w-md space-y-8 bg-neutral-900 p-8 border-4 border-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-center text-white mb-2">
                        {view === "SIGNUP" ? null : "ACCESS RUNNER ID"}

                    </h2>
                    <p className="mt-2 text-sm text-neutral-400">
                        {view === "SIGNUP"
                            ? null
                            : "Enter your Private Key to resume."}
                    </p>
                </div>

                {error && (
                    <div className="bg-red-900/20 border-2 border-red-500 text-red-200 p-3 text-sm flex items-center gap-2">
                        <AlertTriangle size={16} /> {error}
                    </div>
                )}

                {view === "SIGNUP" ? (
                    <div className="space-y-6">
                        {!generatedAccount ? (
                            <div className="space-y-4">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="text-center font-bold text-2xl text-white mb-2">
                                        Escape From Epstein
                                    </div>
                                    <div className="text-center font-bold text-sm text-white mb-1">
                                        MADE BY $Epstein DEV
                                    </div>
                                    <div className="text-center font-mono text-[10px] text-neutral-400 break-all">
                                        CA: Ev6MVY6qcS7mnajDGPkvQMZ2f9LAX4U8w3rtXZfApump
                                    </div>
                                    <a
                                        href="https://x.com/i/communities/2018454999895015835"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-[10px] font-bold border-2 border-neutral-700 hover:border-white transition-all rounded-sm"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                        </svg>
                                        JOIN X COMMUNITY
                                    </a>
                                </div>
                                <button
                                    onClick={handleGenerateValues}
                                    className="w-full bg-white py-3 font-bold text-black border-b-4 border-r-4 border-gray-400 active:border-0 active:translate-y-1 active:translate-x-1"
                                >
                                    GENERATE WALLET
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="space-y-2">
                                    <label className="text-xs uppercase tracking-widest text-neutral-500">Public Key (ID)</label>
                                    <div className="p-3 bg-neutral-800 border-2 border-neutral-600 font-mono text-xs break-all text-neutral-300">
                                        {generatedAccount.publicKey}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs uppercase tracking-widest text-red-400 font-bold flex items-center gap-2">
                                        Private Key (SECRET)
                                    </label>
                                    <div className="relative">
                                        <div className={`p-3 bg-neutral-950 border-2 border-red-900/30 font-mono text-xs break-all pr-10 ${showSecret ? "text-red-300" : "text-neutral-700 blur-sm select-none"}`}>
                                            {generatedAccount.secretKey}
                                        </div>
                                        <button
                                            onClick={() => setShowSecret(!showSecret)}
                                            className="absolute right-2 top-2 text-neutral-500 hover:text-white"
                                        >
                                            {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={copyToClipboard}
                                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-neutral-800 hover:bg-neutral-700 border-2 border-transparent hover:border-white text-xs font-bold transition-colors"
                                        >
                                            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                            {copied ? "COPIED" : "COPY SECRET"}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-neutral-500 text-center">
                                        ⚠️ SAVE THIS KEY! If you lose it, you lose your account forever.
                                    </p>
                                </div>

                                <button
                                    onClick={handleSignupContinue}
                                    className="w-full bg-purple-600 hover:bg-purple-500 py-3 font-bold text-white border-b-4 border-r-4 border-purple-800 active:border-0 active:translate-y-1 active:translate-x-1 transition-all"
                                >
                                    PLAY
                                </button>
                            </div>
                        )}

                        <div className="text-center text-xs text-neutral-500 mt-4">
                            Already have an ID?{" "}
                            <button
                                onClick={() => { setView("LOGIN"); setError(""); setGeneratedAccount(null); }}
                                className="text-cyan-400 hover:underline"
                            >
                                Login here
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <label className="text-xs uppercase tracking-widest text-neutral-500 mb-2 block">Private Key</label>
                            <input
                                type="password"
                                value={privateKeyInput}
                                onChange={(e) => setPrivateKeyInput(e.target.value)}
                                placeholder="Base58 Secret Key..."
                                className="w-full p-3 bg-neutral-800 border-2 border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-cyan-500 transition-colors font-mono text-sm"
                            />
                        </div>

                        <button
                            onClick={handleLogin}
                            className="w-full bg-cyan-500 hover:bg-cyan-400 py-3 font-bold text-black border-b-4 border-r-4 border-cyan-700 active:border-0 active:translate-y-1 active:translate-x-1 transition-all"
                        >
                            ACCESS GAME
                        </button>

                        <div className="text-center text-xs text-neutral-500 mt-4">
                            Need new ID?{" "}
                            <button
                                onClick={() => { setView("SIGNUP"); setError(""); }}
                                className="text-purple-400 hover:underline"
                            >
                                Create one
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
