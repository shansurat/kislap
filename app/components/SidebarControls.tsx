import React from 'react';
import Image from 'next/image';
import { renderStyledName } from '../utils/helpers';
import { GraphNode } from '../hooks/useGraphData';

const MATCH_TYPE_LABELS: Record<string, string> = {
  regular: 'Regular Battle',
  promo: 'Promo',
  tryout: 'Tryout',
};

const FORMAT_LABELS: Record<string, string> = {
  '1v1': '1v1',
  '2v2': '2v2',
  '3v3': '3v3',
  '5v5': '5v5',
  '3way': '3-Way',
  royal_rumble: 'Royal Rumble',
  handicap: 'Handicap',
};

interface SidebarControlsProps {
  selectedFormats: string[];
  setSelectedFormats: (formats: string[]) => void;
  isFormatDropdownOpen: boolean;
  setIsFormatDropdownOpen: (open: boolean) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMatchType: string;
  setSelectedMatchType: (type: string) => void;
  availableYears: number[];
  availableMatchTypes: string[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortBy: 'name' | 'winRate' | 'views' | 'wins' | 'losses';
  setSortBy: (sort: 'name' | 'winRate' | 'views' | 'wins' | 'losses') => void;
  filteredEmceesList: GraphNode[];
  handleSearchSelect: (node: GraphNode) => void;
  selectedNodeId: string | null;
  nodeStats: Record<string, { wins: number; losses: number; draws: number; total: number; winRate: number }>;
  officialOnly: boolean;
  setOfficialOnly: (official: boolean) => void;
  sizeBasis: 'battles' | 'views';
  setSizeBasis: (basis: 'battles' | 'views') => void;
  colorMode: 'group' | 'winRate' | 'views';
  setColorMode: (mode: 'group' | 'winRate' | 'views') => void;
  linkColorMode: 'relation' | 'battle_type' | 'format';
  setLinkColorMode: (mode: 'relation' | 'battle_type' | 'format') => void;
  showLabels: boolean;
  setShowLabels: (show: boolean) => void;
}

export function SidebarControls({
  selectedFormats,
  setSelectedFormats,
  isFormatDropdownOpen,
  setIsFormatDropdownOpen,
  dropdownRef,
  selectedYear,
  setSelectedYear,
  selectedMatchType,
  setSelectedMatchType,
  availableYears,
  availableMatchTypes,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  filteredEmceesList,
  handleSearchSelect,
  selectedNodeId,
  nodeStats,
  officialOnly,
  setOfficialOnly,
  sizeBasis,
  setSizeBasis,
  colorMode,
  setColorMode,
  linkColorMode,
  setLinkColorMode,
  showLabels,
  setShowLabels,
}: SidebarControlsProps) {
  return (
    <>
      <div ref={dropdownRef} className="flex bg-[#0d0d0d] border border-neutral-800 p-1 items-center justify-between relative rounded-none">
        <div className="relative w-full flex-1">
          <button
            onClick={() => setIsFormatDropdownOpen(!isFormatDropdownOpen)}
            className="w-full text-left bg-transparent text-neutral-400 text-[10px] uppercase tracking-wider font-semibold py-1.5 px-2 rounded-none hover:text-white hover:bg-neutral-900 flex justify-between items-center transition-all duration-200"
          >
            <span>Matchup Formats ({selectedFormats.length})</span>
            <svg className={`w-3 h-3 transition-transform duration-200 ${isFormatDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isFormatDropdownOpen && (
            <div className="absolute left-0 right-0 mt-2 z-[70] bg-[#0d0d0d] border border-neutral-800 rounded-none p-2 flex flex-col gap-1.5 shadow-2xl max-h-48 overflow-y-auto">
              {Object.keys(FORMAT_LABELS).map(formatKey => {
                const label = FORMAT_LABELS[formatKey];
                const isChecked = selectedFormats.includes(formatKey);
                return (
                  <label key={formatKey} className="flex items-center gap-2.5 text-xs text-neutral-400 hover:text-white cursor-pointer select-none py-1 px-1.5 rounded-none hover:bg-neutral-900 transition-all">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        if (isChecked) {
                          setSelectedFormats(selectedFormats.filter(f => f !== formatKey));
                        } else {
                          setSelectedFormats([...selectedFormats, formatKey]);
                        }
                      }}
                      className="rounded-none border-neutral-800 text-neutral-200 focus:ring-0 focus:ring-offset-0 bg-transparent w-3 h-3"
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#0d0d0d] border border-neutral-800 p-3 flex flex-col gap-3 shadow-2xl rounded-none">
        <div>
          <span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">Time Horizon</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs py-1.5 px-2.5 rounded-none focus:outline-none focus:border-neutral-700 transition-colors"
          >
            <option value="All">All Time</option>
            {availableYears.map(year => (
              <option key={year} value={String(year)}>{year}</option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">Match Classification</span>
          <select
            value={selectedMatchType}
            onChange={(e) => setSelectedMatchType(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs py-1.5 px-2.5 rounded-none focus:outline-none focus:border-neutral-700 transition-colors"
          >
            <option value="All">All Classes</option>
            {availableMatchTypes.map(type => (
              <option key={type} value={type}>{MATCH_TYPE_LABELS[type] || type}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-900 pt-2">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold select-none">Official Battles Only</span>
          <button
            onClick={() => setOfficialOnly(!officialOnly)}
            className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${officialOnly ? 'bg-neutral-400' : 'bg-neutral-800'}`}
          >
            <div className={`w-3 h-3 rounded-full bg-black transition-transform duration-200 ${officialOnly ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      <div className="bg-[#0d0d0d] border border-neutral-800 p-3 flex flex-col gap-3 shadow-2xl rounded-none">
        <div>
          <span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">Node Sizing Basis</span>
          <div className="flex gap-1 bg-neutral-950 p-1 border border-neutral-800 rounded-none">
            <button 
              onClick={() => setSizeBasis('battles')}
              className={`flex-1 text-[10px] uppercase font-semibold py-1 transition-colors ${sizeBasis === 'battles' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >Total Battles</button>
            <button 
              onClick={() => setSizeBasis('views')}
              className={`flex-1 text-[10px] uppercase font-semibold py-1 transition-colors ${sizeBasis === 'views' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >Total Views</button>
          </div>
        </div>
        
        <div>
          <span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">Node Color Mode</span>
          <div className="flex gap-1 bg-neutral-950 p-1 border border-neutral-800 rounded-none">
            <button 
              onClick={() => setColorMode('winRate')}
              className={`flex-1 text-[10px] uppercase font-semibold py-1 transition-colors ${colorMode === 'winRate' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >Win Rate</button>
            <button 
              onClick={() => setColorMode('group')}
              className={`flex-1 text-[10px] uppercase font-semibold py-1 transition-colors ${colorMode === 'group' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >Entity Group</button>
            <button 
              onClick={() => setColorMode('views')}
              className={`flex-1 text-[10px] uppercase font-semibold py-1 transition-colors ${colorMode === 'views' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >Views</button>
          </div>
        </div>

        <div>
          <span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">Link Color Mode</span>
          <div className="flex gap-1 bg-neutral-950 p-1 border border-neutral-800 rounded-none">
            <button 
              onClick={() => setLinkColorMode('relation')}
              className={`flex-1 text-[10px] uppercase font-semibold py-1 transition-colors ${linkColorMode === 'relation' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >Relation</button>
            <button 
              onClick={() => setLinkColorMode('battle_type')}
              className={`flex-1 text-[10px] uppercase font-semibold py-1 transition-colors ${linkColorMode === 'battle_type' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >Battle Type</button>
            <button 
              onClick={() => setLinkColorMode('format')}
              className={`flex-1 text-[10px] uppercase font-semibold py-1 transition-colors ${linkColorMode === 'format' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >Format</button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-900 pt-2">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold select-none">Show Node Labels</span>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${showLabels ? 'bg-neutral-400' : 'bg-neutral-800'}`}
          >
            <div className={`w-3 h-3 rounded-full bg-black transition-transform duration-200 ${showLabels ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      <div className="bg-[#0d0d0d] border border-neutral-800 flex flex-col min-h-0 flex-1 shadow-2xl rounded-none">
        <div className="p-3 border-b border-neutral-900 flex flex-col gap-2 shrink-0">
          <span className="block text-[9px] uppercase tracking-wider text-neutral-500 font-semibold">Combatants</span>
          <input
            type="text"
            placeholder="Search emcee or team..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs py-1.5 px-2.5 rounded-none focus:outline-none focus:border-neutral-700 placeholder-neutral-600 transition-colors"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full bg-neutral-950 border border-neutral-800 text-neutral-400 text-[10px] uppercase py-1 px-1.5 rounded-none focus:outline-none focus:border-neutral-700 transition-colors"
          >
            <option value="name">Sort: Name</option>
            <option value="winRate">Sort: Win Rate</option>
            <option value="views">Sort: Views</option>
            <option value="wins">Sort: Wins</option>
            <option value="losses">Sort: Losses</option>
          </select>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-neutral-900 custom-scrollbar">
          {filteredEmceesList.map(node => {
            return (
              <button key={node.id} onClick={() => handleSearchSelect(node)} className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 rounded-none transition-colors border-none ${selectedNodeId === node.id ? 'bg-neutral-900 text-white border-l-2 border-neutral-400' : 'text-neutral-400 hover:bg-neutral-900/50'}`}>
                {node.avatar_url ? (
                  <Image src={node.avatar_url} alt={node.name} width={20} height={20} className="w-5 h-5 rounded-full object-cover shrink-0" />
                ) : (
                  <div className={`w-5 h-5 bg-neutral-900 border border-neutral-800 flex items-center justify-center text-[9px] shrink-0 rounded-none text-neutral-400`}>
                    {node.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="truncate flex-1 font-medium">
                  {node.group === 'Team' ? '[Team] ' : ''}
                  {renderStyledName(node.name)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
