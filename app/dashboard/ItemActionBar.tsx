import React from 'react';

export default function ItemActionBar({ onSave, onDiscard }: { onSave: () => void, onDiscard: () => void }) {
  return (
    <div className="fixed bottom-0 left-0 w-full p-4 bg-zinc-900/90 backdrop-blur-md border-t border-zinc-800 flex justify-between items-center gap-4 z-50">
      <button onClick={onDiscard} className="flex-1 py-3 px-4 rounded-xl border border-rose-500/30 text-rose-400 font-semibold text-sm hover:bg-rose-500/10 transition-all">Discard</button>
      <button onClick={onSave} className="flex-1 py-3 px-4 rounded-xl bg-emerald-500 text-zinc-900 font-bold text-sm shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:bg-emerald-400 transition-all">Save & Export</button>
    </div>
  );
}
