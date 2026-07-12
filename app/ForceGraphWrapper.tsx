'use client'

import { useRef, useEffect, useState } from 'react';
import { useGraphData, GraphData, GraphNode } from './hooks/useGraphData';
import { SidebarControls } from './components/SidebarControls';
import { DetailOverlay } from './components/DetailOverlay';
import { Legend } from './components/Legend';
import { ThreeForceGraph } from './components/ThreeForceGraph';
import { formatViews, renderStyledName } from './utils/helpers';

export default function GraphClient({ graphData }: { graphData: GraphData }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const hasInitiallyZoomed = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['1v1', '2v2', '3v3', '5v5', '3way', 'royal_rumble', 'handicap']);
  const [isFormatDropdownOpen, setIsFormatDropdownOpen] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedMatchType, setSelectedMatchType] = useState<string>('All');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedLink, setSelectedLink] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'winRate' | 'views' | 'wins' | 'losses'>('name');
  const [sizeBasis, setSizeBasis] = useState<'battles' | 'views'>('battles');
  const [colorMode, setColorMode] = useState<'group' | 'winRate'>('winRate');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [officialOnly, setOfficialOnly] = useState<boolean>(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [hoveredLink, setHoveredLink] = useState<any | null>(null);

  // Synchronize state and filter modifications with graph node selections
  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedLink(null);
  }, [selectedYear, selectedMatchType, selectedFormats, officialOnly]);

  // Click outside to close format dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsFormatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute graph data
  const {
    availableYears,
    availableMatchTypes,
    displayData,
    nodeStats,
    filteredEmceesList,
    selectedNode,
    battleParticipants,
    highlightNodes,
    highlightLinks,
  } = useGraphData({
    graphData,
    selectedFormats,
    selectedYear,
    selectedMatchType,
    officialOnly,
    searchQuery,
    sortBy,
    selectedNodeId,
    selectedLink,
  });

  // Handle window resizing
  useEffect(() => {
    if (containerRef.current) {
      const updateDimensions = () => setDimensions({ 
        width: containerRef.current?.clientWidth || 800, 
        height: containerRef.current?.clientHeight || 600 
      });
      updateDimensions();
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }
  }, []);

  // Zoom to fit when graph data first loads
  useEffect(() => {
    if (displayData.nodes.length > 0 && !hasInitiallyZoomed.current) {
      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.zoomToFit(800, 150);
          hasInitiallyZoomed.current = true;
        }
      }, 1200); // Wait 1200ms to allow layout expansion before fitting
    }
  }, [displayData]);

  // Focus and zoom in on selected node
  const handleSearchSelect = (node: any) => {
    setSearchQuery('');
    if (selectedNodeId === node.id) {
      setSelectedNodeId(null);
    } else {
      setSelectedNodeId(node.id);
      setSelectedLink(null);
      if (fgRef.current && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
        const distance = 200;
        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
        fgRef.current.cameraPosition({ x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, node, 1500);
      }
    }
  };

  // Connection offline overlay
  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-neutral-400 font-mono text-xs select-none">
        <div className="text-red-500 text-lg mb-2">⚠</div>
        <div className="tracking-widest uppercase text-neutral-200 mb-1 font-bold">Database Connection Offline</div>
        <div className="text-neutral-600 max-w-xs text-center leading-relaxed">
          The visualization engine was unable to establish a secure link to the graph network. Please verify that the Neo4j database is active and reload the page.
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative group font-sans">
      
      {/* Node and Link Details Overlay */}
      <DetailOverlay
        selectedNode={selectedNode}
        selectedLink={selectedLink}
        setSelectedNodeId={setSelectedNodeId}
        setSelectedLink={setSelectedLink}
        nodeStats={nodeStats}
        battleParticipants={battleParticipants}
        displayData={displayData}
      />

      {/* Control Panel Menu Toggle for Mobile */}
      <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden absolute bottom-6 left-6 z-[60] w-10 h-10 rounded-md bg-[#121212]/30 backdrop-blur-md border border-white/5 flex items-center justify-center text-[#EFEFEF] opacity-60 hover:opacity-100 transition-all">
        {isMobileMenuOpen ? <span className="text-xl">✕</span> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>}
      </button>

      {/* Sidebar Controls Panel */}
      <div className={`absolute z-[55] flex flex-col gap-2 transition-all w-64 pointer-events-auto md:top-4 md:right-4 ${isMobileMenuOpen ? 'bottom-20 left-6 opacity-100' : 'max-md:opacity-0 max-md:pointer-events-none'}`}>
        <SidebarControls
          selectedFormats={selectedFormats}
          setSelectedFormats={setSelectedFormats}
          isFormatDropdownOpen={isFormatDropdownOpen}
          setIsFormatDropdownOpen={setIsFormatDropdownOpen}
          dropdownRef={dropdownRef}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMatchType={selectedMatchType}
          setSelectedMatchType={setSelectedMatchType}
          availableYears={availableYears}
          availableMatchTypes={availableMatchTypes}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          filteredEmceesList={filteredEmceesList}
          handleSearchSelect={handleSearchSelect}
          selectedNodeId={selectedNodeId}
          nodeStats={nodeStats}
          officialOnly={officialOnly}
          setOfficialOnly={setOfficialOnly}
          sizeBasis={sizeBasis}
          setSizeBasis={setSizeBasis}
          colorMode={colorMode}
          setColorMode={setColorMode}
          showLabels={showLabels}
          setShowLabels={setShowLabels}
        />
      </div>

      {/* Map Legend */}
      <Legend selectedFormats={selectedFormats} colorMode={colorMode} />

      {/* WebGL Scene Graph */}
      <ThreeForceGraph
        fgRef={fgRef}
        dimensions={dimensions}
        displayData={displayData}
        selectedNodeId={selectedNodeId}
        selectedLink={selectedLink}
        hoveredNodeId={hoveredNodeId}
        hoveredLink={hoveredLink}
        showLabels={showLabels}
        sizeBasis={sizeBasis}
        colorMode={colorMode}
        nodeStats={nodeStats}
        highlightNodes={highlightNodes}
        highlightLinks={highlightLinks}
        handleSearchSelect={handleSearchSelect}
        setHoveredNodeId={setHoveredNodeId}
        setHoveredLink={setHoveredLink}
        setSelectedNodeId={setSelectedNodeId}
        setSelectedLink={setSelectedLink}
      />
    </div>
  );
}