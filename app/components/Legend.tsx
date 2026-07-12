import React from 'react';

interface LegendProps {
  selectedFormats: string[];
  colorMode: 'group' | 'winRate';
  linkColorMode: 'relation' | 'battle_type' | 'format';
}

export function Legend({ selectedFormats, colorMode, linkColorMode }: LegendProps) {
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
          <div className="flex items-center gap-2 text-[10px] text-neutral-400">
            <div className="w-2 h-2 rounded-none border border-neutral-700 bg-[#38bdf8]"></div> Team
          </div>
        )}
        {(selectedFormats.includes('royal_rumble') || selectedFormats.includes('3way')) && (
          <div className="flex items-center gap-2 text-[10px] text-neutral-400">
            <div className="w-2.5 h-2.5 bg-[#eab308] border border-[#eab308]/20 rounded-none rotate-45 shrink-0"></div> Royal Rumble / 3-Way Battle
          </div>
        )}

        <div className="h-px bg-neutral-800 w-full my-1"></div>

        {linkColorMode === 'relation' && (
          <>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#0ea5e9]"></div> Member Of Team
            </div>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#4ade80]"></div> Won Battle (Selected)
            </div>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#f87171]"></div> Lost Battle (Selected)
            </div>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#eab308]"></div> Tournament / Judged
            </div>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#ec4899]"></div> Promo
            </div>
          </>
        )}

        {linkColorMode === 'battle_type' && (
          <>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#eab308]"></div> Tournament / Judged
            </div>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#ec4899]"></div> Promo
            </div>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#3b82f6]"></div> Tryout
            </div>
          </>
        )}

        {linkColorMode === 'format' && (
          <>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400">
              <div className="w-3 h-0.5 bg-[#6b7280]"></div> 1v1
            </div>
            {selectedFormats.includes('2v2') && (
              <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                <div className="w-3 h-0.5 bg-[#a855f7]"></div> 2v2
              </div>
            )}
            {selectedFormats.includes('3way') && (
              <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                <div className="w-3 h-0.5 bg-[#ec4899]"></div> 3-Way
              </div>
            )}
            {selectedFormats.includes('royal_rumble') && (
              <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                <div className="w-3 h-0.5 bg-[#eab308]"></div> Royal Rumble
              </div>
            )}
            {(selectedFormats.includes('3v3') || selectedFormats.includes('5v5')) && (
              <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                <div className="w-3 h-0.5 bg-[#3b82f6]"></div> 3v3 / 5v5
              </div>
            )}
            {selectedFormats.includes('handicap') && (
              <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                <div className="w-3 h-0.5 bg-[#10b981]"></div> Handicap
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
