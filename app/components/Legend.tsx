import React from 'react';

interface LegendProps {
  selectedFormats: string[];
  colorMode: 'group' | 'winRate';
}

export function Legend({ selectedFormats, colorMode }: LegendProps) {
  return (
    <div className="absolute bottom-6 left-6 z-[55] pointer-events-none hidden md:flex flex-col gap-3 bg-[#0d0d0d] border border-neutral-800 rounded-none p-3 shadow-2xl">
      <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold border-b border-neutral-800 pb-1">Legend</span>

      {colorMode === 'winRate' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold">Win Rate</span>
          <div className="w-full h-1 bg-gradient-to-r from-[#f87171] via-[#facc15] to-[#4ade80] rounded-none"></div>
          <div className="flex justify-between text-[9px] text-neutral-600">
            <span>Low</span><span>Avg</span><span>High</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5 mt-1">
        <div className="flex items-center gap-2 text-[10px] text-neutral-400">
          <div className="w-2 h-2 rounded-full border border-neutral-700"></div> Individual Emcee
        </div>
        {selectedFormats.some(f => f !== '1v1') && (
          <>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-2 h-2 rounded-none border border-neutral-700 bg-[#38bdf8]"></div> Team
            </div>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#0ea5e9]"></div> Member Of Team
            </div>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#8b5cf6]"></div> Multi-Participant (2v2, 3way, etc.)
            </div>
          </>
        )}
        <div className="flex items-center gap-2 text-[10px] text-neutral-400">
          <div className="w-3 h-0.5 bg-[#b59210]"></div> Tournament Battle
        </div>
        {(selectedFormats.includes('royal_rumble') || selectedFormats.includes('3way')) && (
          <div className="flex items-center gap-2 text-[10px] text-neutral-400">
            <div className="w-2.5 h-2.5 bg-[#eab308] border border-[#eab308]/20 rounded-none rotate-45 shrink-0"></div> Royal Rumble / 3-Way Battle
          </div>
        )}
      </div>
    </div>
  );
}
