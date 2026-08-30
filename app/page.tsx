"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, CheckCircle2 } from "lucide-react";

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
          <div className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Boss Listers
          </div>
          <div className="hidden md:flex gap-8">
            <a href="#features" className="hover:text-emerald-400">Features</a>
            <a href="#pricing" className="hover:text-emerald-400">Pricing</a>
          </div>
          <Link href="/dashboard" className="hidden md:block px-6 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-center">
            Start Free
          </Link>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-4 text-center">
        <h1 className="text-5xl sm:text-7xl font-bold mb-6">
          Post Everywhere Instantly
        </h1>
        <p className="text-xl text-slate-400 mb-8">
          Take a photo. AI extracts. Post to 27 marketplaces + 8 social platforms with one click.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/dashboard" className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-lg font-semibold text-center text-white transition-colors">
            Start Free Trial
          </Link>
          <a href="#features" className="px-8 py-3 border border-slate-600 rounded-lg font-semibold text-center hover:bg-slate-800 transition-colors">
            Watch Demo
          </a>
        </div>
      </section>

      <section id="features" className="py-20 px-4 bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "AI Photo Analysis", desc: "Extract product details instantly" },
              { title: "Multi-Channel Posting", desc: "Distribute to 27+ marketplaces" },
              { title: "Social Integration", desc: "Post videos to 8 social platforms" },
            ].map((f, i) => (
              <div key={i} className="p-6 bg-slate-800/50 border border-slate-700 rounded-lg">
                <CheckCircle2 className="text-emerald-400 mb-4" />
                <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
                <p className="text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { step: "1", title: "Upload Photo" },
              { step: "2", title: "AI Extracts" },
              { step: "3", title: "Post Everywhere" },
            ].map((item, i) => (
              <div key={i}>
                <div className="text-6xl font-bold text-emerald-500/20">{item.step}</div>
                <h3 className="text-2xl font-semibold">{item.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 px-4 bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">Pricing</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { name: "Free", price: "$0", features: ["5 listings", "1 marketplace"] },
              { name: "Pro", price: "$29", period: "/mo", pop: true, features: ["Unlimited", "27 marketplaces", "8 social platforms"] },
              { name: "Enterprise", price: "Custom", features: ["Everything", "API Access", "Support"] },
            ].map((p, i) => (
              <div key={i} className={`p-8 rounded-lg border ${p.pop ? "bg-emerald-500/10 border-emerald-500 scale-105" : "bg-slate-800/50 border-slate-700"}`}>
                <h3 className="text-2xl font-bold mb-2">{p.name}</h3>
                <div className="text-4xl font-bold mb-6">{p.price}</div>
                <ul className="space-y-2">
                  {p.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-emerald-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-2xl p-12 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to Automate?</h2>
          <Link href="/dashboard" className="inline-block px-8 py-4 bg-white text-emerald-600 font-bold rounded-lg hover:bg-gray-100 transition-colors">
            Start Free Trial
          </Link>
        </div>
      </section>

      <footer className="bg-slate-900 border-t border-slate-800 py-12">
        <div className="text-center text-slate-500">
          <p>&copy; 2024 Boss Listers. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
