import React from 'react';
import { renderStyledName, formatViews } from '../utils/helpers';
import { GraphNode, GraphLink } from '../hooks/useGraphData';

interface DetailOverlayProps {
  selectedNode: GraphNode | null;
  selectedLink: GraphLink | null;
  setSelectedNodeId: (id: string | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSelectedLink: (link: any | null) => void;
  nodeStats: Record<string, { wins: number; losses: number; draws: number; total: number; winRate: number }>;
  battleParticipants: GraphNode[];
  displayData: { nodes: GraphNode[]; links: GraphLink[] };
}

export function DetailOverlay({
  selectedNode,
  selectedLink,
  setSelectedNodeId,
  setSelectedLink,
  nodeStats,
  battleParticipants,
  displayData,
}: DetailOverlayProps) {
  return (
    <>
      {/* Node Details Overlay */}
      {selectedNode && !selectedLink && (
        <div className="absolute top-4 left-4 max-md:left-1/2 max-md:-translate-x-1/2 z-[60] w-72 bg-[#0d0d0d] border border-neutral-800 p-4 text-neutral-200 shadow-2xl pointer-events-auto transition-all">
          <button onClick={() => setSelectedNodeId(null)} className="absolute top-3 right-3 text-neutral-500 hover:text-white transition-colors">✕</button>

          <div className="flex items-center gap-3 pb-3 mb-3 border-b border-neutral-800">
            {selectedNode.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedNode.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover border border-neutral-800" />
            ) : (
              <div className={`w-12 h-12 bg-neutral-900 border border-neutral-800 flex items-center justify-center text-lg font-bold ${
                selectedNode.group === 'Battle' ? 'text-[#eab308]' : 'text-neutral-400'
              }`}>
                {selectedNode.group === 'Battle' ? '⚔️' : selectedNode.name.charAt(0)}
              </div>
            )}
            <div>
              <h3 className="font-bold text-base leading-tight pr-4 text-white">{renderStyledName(selectedNode.name)}</h3>
              <span className="inline-block mt-1 text-[9px] uppercase tracking-wider bg-neutral-900 border border-neutral-800 text-neutral-400 px-1.5 py-0.5 font-semibold">{selectedNode.group}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400 mb-4">
            {selectedNode.hometown && <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-0.5">Hometown</span><span className="text-neutral-200">{selectedNode.hometown}</span></div>}
            {selectedNode.total_views != null && <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-0.5">Total Views</span><span className="text-neutral-200">{selectedNode.total_views.toLocaleString()}</span></div>}
            {selectedNode.battleCount != null && selectedNode.group !== 'Event' && <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-0.5">Total Battles</span><span className="text-neutral-200">{selectedNode.battleCount.toLocaleString()}</span></div>}
          </div>

          {nodeStats[selectedNode.id] && (
            <div className="bg-neutral-900/50 p-2 flex justify-between text-center text-xs border border-neutral-800">
              <div><span className="block text-[#4ade80] font-bold">{nodeStats[selectedNode.id].wins}</span><span className="text-[9px] text-neutral-500 uppercase">Wins</span></div>
              <div><span className="block text-[#f87171] font-bold">{nodeStats[selectedNode.id].losses}</span><span className="text-[9px] text-neutral-500 uppercase">Losses</span></div>
              <div><span className="block text-neutral-400 font-bold">{nodeStats[selectedNode.id].draws}</span><span className="text-[9px] text-neutral-500 uppercase">Draws</span></div>
              <div><span className="block text-neutral-200 font-bold">{((nodeStats[selectedNode.id].winRate || 0) * 100).toFixed(0)}%</span><span className="text-[9px] text-neutral-500 uppercase">Win Rate</span></div>
            </div>
          )}

          {selectedNode.group === 'Battle' && battleParticipants.length > 0 && (
            <div className="mt-3 pt-3 border-t border-neutral-800">
              <span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5">Participants</span>
              <div className="flex flex-wrap gap-1">
                {battleParticipants.map(p => {
                  const winsLink = displayData.links.find(
                    l => l.battle_id === selectedNode.id && l.type === 'WON'
                  );
                  const winnerId = winsLink ? (typeof winsLink.source === 'object' ? winsLink.source.id : winsLink.source) : null;
                  const isWinner = p.id === winnerId;
                  
                  return (
                    <div
                      key={p.id}
                      className={`text-[10px] px-2 py-0.5 border flex items-center gap-1 ${
                        isWinner
                          ? 'bg-green-950/20 border-green-800/30 text-green-400 font-semibold'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                      }`}
                    >
                      {isWinner && <span>🏆</span>}
                      <span>{p.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Link Details Overlay */}
      {selectedLink && (
        <div className="absolute top-4 left-4 max-md:left-1/2 max-md:-translate-x-1/2 z-[60] w-72 bg-[#0d0d0d] border border-neutral-800 p-4 text-neutral-200 shadow-2xl pointer-events-auto transition-all">
          <button onClick={() => setSelectedLink(null)} className="absolute top-3 right-3 text-neutral-500 hover:text-white transition-colors">✕</button>

          <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold mb-3 border-b border-neutral-800 pb-1.5">Connection Details</div>

          <div className="flex flex-col gap-1 mb-4 text-sm bg-neutral-900/50 p-2 border border-neutral-800">
            <div className="flex justify-between items-center text-center">
              <span className={`font-bold flex-1 truncate ${selectedLink.type === 'WON' ? 'text-[#4ade80]' : ''}`}>
                {renderStyledName(selectedLink.source.name || selectedLink.source)}
              </span>
              <span className="text-[10px] text-neutral-500 px-2 whitespace-nowrap">
                {selectedLink.type === 'DEFEATED' ? '🏆 DEFEATED' :
                 selectedLink.type === 'WON' ? '🏆 WON' :
                 selectedLink.type === 'LOST' ? '❌ LOST' :
                 selectedLink.type === 'PARTICIPATED_IN' ? '⚔️ PARTICIPATED IN' :
                 selectedLink.type === 'BATTLED' ? '⚔️ BATTLED' : 'MEMBER OF'}
              </span>
              <span className={`font-bold flex-1 truncate ${
                selectedLink.type === 'DEFEATED' || selectedLink.type === 'LOST' ? 'text-[#f87171]' : ''
              }`}>
                {renderStyledName(selectedLink.target.name || selectedLink.target)}
              </span>
            </div>
          </div>

          {selectedLink.type !== 'MEMBER_OF' && (
            <div className="space-y-3 text-xs text-neutral-400">
              {selectedLink.battle_name && (
                <div>
                  <span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-0.5">Battle Name</span>
                  <span className="text-white font-medium">{renderStyledName(selectedLink.battle_name)}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                {selectedLink.event_name && <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-0.5">Event</span><span className="text-neutral-200">{selectedLink.event_name} {selectedLink.year ? `('${String(selectedLink.year).slice(-2)})` : ''}</span></div>}
                {selectedLink.match_format && <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-0.5">Format</span><span className="text-neutral-200">{selectedLink.match_format}</span></div>}
                {selectedLink.match_type && <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-0.5">Type</span><span className="text-neutral-200">{selectedLink.match_type}</span></div>}
                {selectedLink.view_count != null && <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-0.5">Views</span><span className="text-neutral-200">{formatViews(selectedLink.view_count)}</span></div>}
              </div>
              {battleParticipants.length > 0 && (
                <div className="mt-3 pt-3 border-t border-neutral-800">
                  <span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5">Participants</span>
                  <div className="flex flex-wrap gap-1">
                    {battleParticipants.map(p => {
                      const winsLink = displayData.links.find(
                        l => l.battle_id === selectedLink.battle_id && l.type === 'WON'
                      );
                      const winnerId = winsLink
                        ? (typeof winsLink.source === 'object' ? winsLink.source.id : winsLink.source)
                        : (selectedLink.type === 'DEFEATED'
                          ? (typeof selectedLink.source === 'object' ? selectedLink.source.id : selectedLink.source)
                          : null);
                      const isWinner = p.id === winnerId;
                      return (
                        <div
                          key={p.id}
                          className={`text-[10px] px-2 py-0.5 border flex items-center gap-1 ${
                            isWinner
                              ? 'bg-green-950/20 border-green-800/30 text-green-400 font-semibold'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                          }`}
                        >
                          {isWinner && <span>🏆</span>}
                          <span>{p.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
