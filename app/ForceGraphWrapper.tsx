'use client'

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { 
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-neutral-400 font-mono text-xs select-none">
      <div className="w-8 h-8 border border-t-transparent border-neutral-700 animate-spin mb-3"></div>
      <div className="tracking-widest uppercase opacity-60">Initializing 3D Engine...</div>
    </div>
  )
});

// Cache & reuse geometries globally to save CPU cycles and GC pauses
const SHARED_SPHERE_GEOMETRY = new THREE.SphereGeometry(1, 16, 16);
const SHARED_OCTAHEDRON_GEOMETRY = new THREE.OctahedronGeometry(1);
const SHARED_DODECAHEDRON_GEOMETRY = new THREE.DodecahedronGeometry(1);

interface GraphData {
  nodes: { id: string; name: string; val: number; group?: string; hometown?: string | null; total_views?: number | null; avatar_url?: string | null }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  links: { source: string | any; target: string | any; type: string; year?: number | null; match_type?: string | null; match_format?: string | null; battle_name?: string | null; view_count?: number | null; event_name?: string | null; battle_id?: string | null; winner?: string[] | null }[];
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  tournament: 'Tournament',
  non_tournament_judged: 'Non-Tournament',
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

const HUB_FORMATS = ['royal_rumble', '3way'];

const getWinRateColor = (rate: number) => `hsl(${Math.round(rate * 120)}, 80%, 50%)`;

const formatSeparators = (text: string) => {
  if (!text) return '';
  // First replace " & " with " / "
  let formatted = text.replaceAll(' & ', ' / ');
  
  // Then replace " / " with styled span
  formatted = formatted.split(' / ').map(part => {
    return part;
  }).join(' <span style="color: #737373; font-weight: 300; margin: 0 4px;">/</span> ');
  
  // Then replace " vs " or " vs. " (case-insensitive) with styled span
  formatted = formatted.replace(/\s+(?:vs|v\.?s\.?|versus)\s+/i, ' <span style="color: #737373; font-weight: 500; font-style: italic; text-transform: lowercase; margin: 0 4px;">vs</span> ');
  
  return formatted;
};

const renderStyledName = (text: string) => {
  if (!text) return null;
  // Replace " & " with " / "
  const cleanText = text.replaceAll(' & ', ' / ');
  
  // Split by " vs " or " vs. " (case-insensitive)
  const battleParts = cleanText.split(/\s+(?:vs|v\.?s\.?|versus)\s+/i);
  
  return (
    <>
      {battleParts.map((battlePart, bIdx) => {
        // Split each part by " / "
        const teamParts = battlePart.split(' / ');
        return (
          <span key={bIdx}>
            {teamParts.map((name, tIdx) => (
              <span key={tIdx}>
                <span className="whitespace-nowrap">{name}</span>
                {tIdx < teamParts.length - 1 && (
                  <span className="text-neutral-500/60 font-light mx-1">/</span>
                )}
              </span>
            ))}
            {bIdx < battleParts.length - 1 && (
              <span className="text-neutral-500/60 font-medium italic lowercase mx-1.5">vs</span>
            )}
          </span>
        );
      })}
    </>
  );
};

export default function GraphClient({ graphData }: { graphData: GraphData }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const hasInitiallyZoomed = useRef<boolean>(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredLink, setHoveredLink] = useState<any | null>(null);

  const [selectedFormats, setSelectedFormats] = useState<string[]>(['1v1', '2v2', '3v3', '5v5', '3way', 'royal_rumble', 'handicap']);
  const [isFormatDropdownOpen, setIsFormatDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedMatchType, setSelectedMatchType] = useState<string>('All');

  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedLink, setSelectedLink] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'winRate' | 'views' | 'wins' | 'losses'>('name');
  const [sizeBasis, setSizeBasis] = useState<'battles' | 'views'>('battles');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [officialOnly, setOfficialOnly] = useState<boolean>(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedLink(null);
  }, [selectedYear, selectedMatchType, selectedFormats, officialOnly]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsFormatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    graphData.links.forEach(link => { if (link.year != null) years.add(link.year); });
    return Array.from(years).sort((a, b) => b - a);
  }, [graphData]);

  const availableMatchTypes = useMemo(() => {
    const types = new Set<string>();
    graphData.links.forEach(link => {
      if (link.match_type && ['tournament', 'non_tournament_judged'].includes(link.match_type)) types.add(link.match_type);
    });
    return Array.from(types).sort();
  }, [graphData]);

  const displayData = useMemo(() => {
    // 1. Filter links based on selected filters (Year, Match Type, and Match Format list)
    let initialLinks = graphData.links.filter(link => {
      if (link.type === 'MEMBER_OF') return true; // Kept for now; filtered later if team is inactive
      
      // Exclude tryout and promo (default behavior)
      if (link.match_type === 'tryout' || link.match_type === 'promo') return false;

      // Filter by Official Battles ONLY
      if (officialOnly) {
        const winners = link.winner || [];
        const isUnjudged = winners.includes('Unjudged');
        const hasResult = winners.length > 0;
        if (isUnjudged || !hasResult) return false;
      }

      // Filter by Year
      if (selectedYear !== 'All' && link.year !== parseInt(selectedYear)) return false;

      // Filter by Match Type
      if (selectedMatchType !== 'All' && link.match_type !== selectedMatchType) return false;

      // Filter by selected Match Formats
      const format = link.match_format || '1v1';
      return selectedFormats.includes(format);
    });

    // 2. Scan links to find royal rumbles / 3-way matches and group them
    const battleHubs: Record<string, {
      id: string;
      name: string;
      event_name: string;
      year: number;
      winnerId: string | null;
      participants: Set<string>;
      view_count: number | null;
      match_type: string;
      match_format: string;
      winner: string[] | null;
    }> = {};

    initialLinks.forEach(link => {
      if (link.type === 'MEMBER_OF') return;
      if (HUB_FORMATS.includes(link.match_format || '')) {
        const battleId = link.battle_id;
        if (!battleId) return;

        if (!battleHubs[battleId]) {
          const defaultName = link.match_format === '3way' ? '3-Way Battle' : 'Royal Rumble';
          battleHubs[battleId] = {
            id: battleId,
            name: link.battle_name || defaultName,
            event_name: link.event_name || '',
            year: link.year || 0,
            winnerId: null,
            participants: new Set<string>(),
            view_count: link.view_count || null,
            match_type: link.match_type || 'other',
            match_format: link.match_format || 'royal_rumble',
            winner: link.winner || null
          };
        }

        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;

        battleHubs[battleId].participants.add(sId);
        battleHubs[battleId].participants.add(tId);

        if (link.type === 'DEFEATED') {
          battleHubs[battleId].winnerId = sId;
        }
      }
    });

    const getBattleName = (hub: typeof battleHubs[string]) => {
      const defaultGenericNames = ['Royal Rumble', '3-Way Battle', '3way', 'royal_rumble'];
      const hasSpecificName = hub.name && !defaultGenericNames.includes(hub.name);
      
      if (hasSpecificName) return hub.name;

      const names = Array.from(hub.participants).map(pId => {
        const node = graphData.nodes.find(n => n.id === pId);
        return node ? node.name : pId;
      });

      if (hub.winnerId) {
        const winnerNode = graphData.nodes.find(n => n.id === hub.winnerId);
        const winnerName = winnerNode ? winnerNode.name : hub.winnerId;
        const otherNames = names.filter(n => n !== winnerName);
        return [winnerName, ...otherNames].join(' vs ');
      }

      return names.sort().join(' vs ');
    };

    // 3. Separate standard links from hub links, and generate redirected links
    const nonRumbleLinks = initialLinks.filter(link => !HUB_FORMATS.includes(link.match_format || '') || link.type === 'MEMBER_OF');
    const rumbleRedirectedLinks: typeof graphData.links = [];

    Object.values(battleHubs).forEach(rumble => {
      const resolvedBattleName = getBattleName(rumble);
      rumble.participants.forEach(participantId => {
        const isWinner = rumble.winnerId === participantId;
        const linkType = isWinner ? 'WON' : 'LOST';
        const type = rumble.winnerId ? linkType : 'PARTICIPATED_IN';

        rumbleRedirectedLinks.push({
          source: isWinner ? participantId : rumble.id,
          target: isWinner ? rumble.id : participantId,
          type: type,
          battle_id: rumble.id,
          match_format: rumble.match_format,
          battle_name: resolvedBattleName,
          event_name: rumble.event_name,
          year: rumble.year,
          view_count: rumble.view_count,
          match_type: rumble.match_type,
          winner: rumble.winner
        });
      });
    });

    let links = [...nonRumbleLinks, ...rumbleRedirectedLinks];

    // 4. Initial node filter (Emcees and Teams)
    let nodes = graphData.nodes.filter(node => node.group === 'Emcee' || node.group === 'Team');

    // If '1v1' is the ONLY checked format, hide teams and member links completely
    const showTeams = selectedFormats.some(f => f !== '1v1');
    if (!showTeams) {
      nodes = nodes.filter(node => node.group !== 'Team');
      links = links.filter(link => link.type !== 'MEMBER_OF');
    }

    // 5. Keep only links connecting valid nodes (or connecting valid nodes to active Battle nodes)
    const validNodeIds = new Set(nodes.map(n => n.id));
    const activeBattleIds = new Set(Object.keys(battleHubs));

    links = links.filter(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      const isSourceValid = validNodeIds.has(sId) || activeBattleIds.has(sId);
      const isTargetValid = validNodeIds.has(tId) || activeBattleIds.has(tId);
      return isSourceValid && isTargetValid;
    });

    // 6. Prune Teams and MEMBER_OF links if the team has no active battles
    const activeTeamIds = new Set<string>();
    links.forEach(link => {
      if (link.type !== 'MEMBER_OF') {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;
        if (sId.startsWith('team_')) activeTeamIds.add(sId);
        if (tId.startsWith('team_')) activeTeamIds.add(tId);
      }
    });

    // Prune MEMBER_OF links whose team has no active battles
    links = links.filter(link => {
      if (link.type === 'MEMBER_OF') {
        const tId = typeof link.target === 'object' ? link.target.id : link.target;
        return activeTeamIds.has(tId);
      }
      return true;
    });

    // Prune Team nodes and Emcees that have no active links
    nodes = nodes.filter(node => {
      if (node.group === 'Team') {
        return activeTeamIds.has(node.id);
      }
      return links.some(link => {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;
        return sId === node.id || tId === node.id;
      });
    });

    // 7. Inject Battle nodes into the nodes array
    Object.values(battleHubs).forEach(rumble => {
      const battleNodeName = getBattleName(rumble);
      nodes.push({
        id: rumble.id,
        name: battleNodeName,
        group: 'Battle',
        val: 3.5,
        total_views: rumble.view_count,
        hometown: null,
        avatar_url: null
      });
    });

    return { nodes, links };
  }, [graphData, selectedYear, selectedMatchType, selectedFormats, officialOnly]);

  const nodeStats = useMemo(() => {
    const stats: Record<string, { wins: number; losses: number; draws: number; total: number; winRate: number }> = {};
    displayData.nodes.forEach(node => { stats[node.id] = { wins: 0, losses: 0, draws: 0, total: 0, winRate: 0.5 }; });

    displayData.links.forEach(link => {
      if (link.type === 'MEMBER_OF' || link.type === 'ATTENDED') return;
      if (link.match_type === 'promo' || link.match_type === 'tryout') return;

      const winners = link.winner || [];
      if (winners.includes('Unjudged')) return;

      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      if (!stats[sourceId]) stats[sourceId] = { wins: 0, losses: 0, draws: 0, total: 0, winRate: 0.5 };
      if (!stats[targetId]) stats[targetId] = { wins: 0, losses: 0, draws: 0, total: 0, winRate: 0.5 };

      if (link.type === 'DEFEATED') {
        stats[sourceId].wins += 1; stats[targetId].losses += 1;
        stats[sourceId].total += 1; stats[targetId].total += 1;
      } else if (link.type === 'BATTLED') {
        if (winners.includes('Draw')) {
          stats[sourceId].draws += 1; stats[targetId].draws += 1;
          stats[sourceId].total += 1; stats[targetId].total += 1;
        }
      } else if (link.type === 'WON') {
        stats[sourceId].wins += 1;
        stats[sourceId].total += 1;
      } else if (link.type === 'LOST') {
        stats[targetId].losses += 1;
        stats[targetId].total += 1;
      } else if (link.type === 'PARTICIPATED_IN') {
        if (winners.includes('Draw')) {
          stats[sourceId].draws += 1;
          stats[sourceId].total += 1;
        }
      }
    });

    Object.values(stats).forEach(stat => { if (stat.total > 0) stat.winRate = stat.wins / stat.total; });
    return stats;
  }, [displayData]);

  const filteredEmceesList = useMemo(() => {
    let emcees = displayData.nodes.filter(n => n.group === 'Emcee' || n.group === 'Team');
    emcees = [...emcees].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'winRate') return (nodeStats[b.id]?.winRate ?? 0) - (nodeStats[a.id]?.winRate ?? 0);
      if (sortBy === 'views') return (b.total_views ?? 0) - (a.total_views ?? 0);
      if (sortBy === 'wins') return (nodeStats[b.id]?.wins ?? 0) - (nodeStats[a.id]?.wins ?? 0);
      if (sortBy === 'losses') return (nodeStats[b.id]?.losses ?? 0) - (nodeStats[a.id]?.losses ?? 0);
      return 0;
    });

    if (searchQuery) emcees = emcees.filter(n => n.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return emcees;
  }, [displayData.nodes, searchQuery, sortBy, nodeStats]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return displayData.nodes.find(n => n.id === selectedNodeId) || null;
  }, [selectedNodeId, displayData.nodes]);

  const battleParticipants = useMemo(() => {
    let battleId: string | null = null;
    if (selectedLink && selectedLink.battle_id) {
      battleId = selectedLink.battle_id;
    } else if (selectedNode && selectedNode.group === 'Battle') {
      battleId = selectedNode.id;
    }

    if (!battleId) return [];

    const siblingLinks = displayData.links.filter(
      link => link.battle_id === battleId
    );

    const participantIds = new Set<string>();
    siblingLinks.forEach(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      if (sId !== battleId) participantIds.add(sId);
      if (tId !== battleId) participantIds.add(tId);
    });

    return displayData.nodes.filter(node => participantIds.has(node.id));
  }, [selectedLink, selectedNode, displayData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSearchSelect = (node: any) => {
    setSearchQuery('');
    if (selectedNodeId === node.id) {
      setSelectedNodeId(null);
    } else {
      setSelectedNodeId(node.id);
      setSelectedLink(null);
      if (fgRef.current && node.x !== undefined) {
        const distance = 200;
        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
        fgRef.current.cameraPosition({ x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, node, 1500);
      }
    }
  };

  const formatViews = (views: number | null | undefined) => {
    if (!views) return '0';
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(0)}K`;
    return views.toLocaleString();
  };

  const { highlightNodes, highlightLinks } = useMemo(() => {
    const hNodes = new Set<string>();
    const hLinks = new Set<any>();

    if (selectedLink) {
      hLinks.add(selectedLink);
      hNodes.add(typeof selectedLink.source === 'object' ? selectedLink.source.id : selectedLink.source);
      hNodes.add(typeof selectedLink.target === 'object' ? selectedLink.target.id : selectedLink.target);
    } else if (selectedNodeId) {
      hNodes.add(selectedNodeId);
      displayData.links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        if (sourceId === selectedNodeId) { hLinks.add(link); hNodes.add(targetId); }
        else if (targetId === selectedNodeId) { hLinks.add(link); hNodes.add(sourceId); }
      });
    }

    return { highlightNodes: hNodes, highlightLinks: hLinks };
  }, [selectedNodeId, selectedLink, displayData]);

  // --- LIVE STATE REF ---
  // Stores React state purely so the 3D Engine can read it instantly every frame without rebuilding nodes
  const graphState = useRef({ selectedNodeId, selectedLink, highlightNodes, showLabels, sizeBasis, nodeStats, hoveredNodeId });
  useEffect(() => {
    graphState.current = { selectedNodeId, selectedLink, highlightNodes, showLabels, sizeBasis, nodeStats, hoveredNodeId };
  }, [selectedNodeId, selectedLink, highlightNodes, showLabels, sizeBasis, nodeStats, hoveredNodeId]);

  // 1. Handle resize listener (mount only)
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

  // 2. Initial zoom to fit when graph data first loads
  useEffect(() => {
    if (displayData.nodes.length > 0 && !hasInitiallyZoomed.current) {
      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.d3Force('charge').strength(-40);
          fgRef.current.d3ReheatSimulation();
          fgRef.current.zoomToFit(800, 80); // Comfortable padding
          hasInitiallyZoomed.current = true;
        }
      }, 600);
    }
  }, [displayData]);

  // 3. Reheat simulation without moving the camera when filters change
  useEffect(() => {
    if (hasInitiallyZoomed.current && fgRef.current) {
      fgRef.current.d3ReheatSimulation();
    }
  }, [displayData]);

  // --- MEMOIZED NODE GENERATOR --- 
  // Prevents the engine from destroying and rebuilding Canvases on click
  const handleNodeThreeObject = useCallback((node: any) => {
    const group = new THREE.Group();
    const isTeam = node.group === 'Team';
    const isBattle = node.group === 'Battle';

    // 1. Static Geometry Generation (reusing shared read-only geometries)
    let geometry;
    if (isTeam) {
      geometry = SHARED_OCTAHEDRON_GEOMETRY;
    } else if (isBattle) {
      geometry = SHARED_DODECAHEDRON_GEOMETRY;
    } else {
      geometry = SHARED_SPHERE_GEOMETRY;
    }
    const material = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    const sprite = new SpriteText(node.name);
    sprite.material.depthWrite = false;
    sprite.material.depthTest = false;
    sprite.renderOrder = 999;
    group.add(sprite);

    // 2. High-Performance Render Loop
    // Reads directly from the live ref every frame (0ms lag, no recreation)
    mesh.onBeforeRender = (renderer, scene, camera) => {
      const state = graphState.current;
      const hasSelection = state.selectedNodeId !== null || state.selectedLink !== null;
      const isCenter = state.selectedNodeId === node.id;
      const isHighlighted = state.highlightNodes.has(node.id);

      // --- Sizing ---
      let baseVal = 1.5;
      if (isBattle) {
        baseVal = 2 + (Math.sqrt(node.total_views || 0) * 0.004);
      } else if (state.sizeBasis === 'battles') {
        baseVal = 2 + ((state.nodeStats[node.id]?.total || 0) * 0.4);
      } else {
        baseVal = 1.5 + (Math.sqrt(node.total_views || 0) * 0.004);
      }
      if (isTeam) baseVal *= 3.5;
      if (isBattle) baseVal *= 2.0;
      baseVal = Math.pow(baseVal, 1.8) * 0.02;
      baseVal = Math.max(0.1, baseVal);

      if (state.selectedNodeId) {
        if (isCenter) baseVal *= 2.5;
        if (isHighlighted) baseVal *= 1.8;
      }

      const baseSize = Math.cbrt(baseVal) * 4;
      const targetScale = isTeam ? baseSize * 1.5 : isBattle ? baseSize * 1.25 : baseSize;

      if (mesh.userData.currentScale !== targetScale) {
        mesh.scale.set(targetScale, targetScale, targetScale);
        mesh.userData.currentScale = targetScale;
      }

      // --- Coloring ---
      let targetColorStr = '#888888';
      if (isBattle) {
        if (state.selectedNodeId && !isCenter && !isHighlighted) {
          targetColorStr = '#333333';
        } else {
          targetColorStr = '#eab308'; // Gold for Battle Hubs
        }
      } else if (state.selectedNodeId) {
        if (isCenter) targetColorStr = '#FFFFFF';
        else if (!isHighlighted) targetColorStr = '#333333';
        else targetColorStr = getWinRateColor(state.nodeStats[node.id]?.winRate ?? 0.5);
      } else {
        targetColorStr = getWinRateColor(state.nodeStats[node.id]?.winRate ?? 0.5);
      }

      if (mesh.userData.currentColor !== targetColorStr) {
        (mesh.material as THREE.MeshLambertMaterial).color.set(targetColorStr);
        mesh.userData.currentColor = targetColorStr;
      }

      // --- Text Visibility & Fading ---
      if (!state.showLabels) {
        sprite.visible = false;
        return;
      }

      const nodeHeight = targetScale;

      let targetVisible = false;
      let tgtColor = 'rgba(255, 255, 255, 0.7)';
      let tgtHeight = 2.5;
      let targetY = nodeHeight + 2.0;
      let targetOpacity = 1;

      if (hasSelection) {
        if (isHighlighted) {
          targetVisible = true;
          targetOpacity = 1;

          const isPrimary = isCenter || state.selectedLink !== null;
          tgtColor = isPrimary ? '#FFFFFF' : '#A3A3A3';
          tgtHeight = isPrimary ? 4.2 : 3.5;
          targetY = nodeHeight + (isPrimary ? 3.0 : 2.0);
        }
      } else {
        // Camera Distance logic using ultra-fast Squared Distance
        const distSq = camera.position.distanceToSquared(group.position);
        const VIS_DIST = 180;
        const FADE_DIST = 60;
        const VIS_DIST_SQ = VIS_DIST * VIS_DIST;

        if (distSq < VIS_DIST_SQ) {
          targetVisible = true;
          tgtColor = 'rgba(255, 255, 255, 0.7)';
          tgtHeight = 2.5;
          targetY = nodeHeight + 2.0;

          const dist = Math.sqrt(distSq);
          let opacity = 1;
          if (dist > (VIS_DIST - FADE_DIST)) {
            opacity = (VIS_DIST - dist) / FADE_DIST;
          }
          targetOpacity = opacity;
        }
      }

      sprite.visible = targetVisible;

      if (targetVisible) {
        // Color transition (discrete update to prevent endless canvas redraws)
        if (sprite.userData.currentColor !== tgtColor) {
          sprite.color = tgtColor;
          sprite.userData.currentColor = tgtColor;
        }

        // Opacity transition (immediate or eased, material opacity doesn't redraw canvas)
        sprite.material.opacity = targetOpacity;

        // Smooth text height easing (Grow animation)
        const currentHeight = sprite.textHeight;
        const newHeight = currentHeight + (tgtHeight - currentHeight) * 0.35;
        if (Math.abs(newHeight - currentHeight) > 0.01) {
          sprite.textHeight = newHeight;
        } else if (sprite.textHeight !== tgtHeight) {
          sprite.textHeight = tgtHeight;
        }

        // Smooth float distance easing
        const currentY = sprite.userData.currentY ?? targetY;
        const newY = currentY + (targetY - currentY) * 0.35;
        sprite.userData.currentY = newY;

        // Position along camera's up vector in world space to keep it always "on top"
        sprite.position.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(newY);
      } else {
        // If not visible, immediately reset to base values so it's ready for the next hover
        sprite.textHeight = tgtHeight;
        sprite.userData.currentY = targetY;
        sprite.position.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(targetY);
      }
    };

    return group;
  }, []);

  const handleNodeLabel = useCallback((node: any) => {
    const groupColor = node.group === 'Team' ? '#38bdf8' : node.group === 'Event' ? '#eab308' : '#a3a3a3';
    const formattedName = formatSeparators(node.name);
    return `
      <div style="
        background: rgba(13, 13, 13, 0.95);
        border: 1px solid #262626;
        padding: 8px 12px;
        color: #e5e5e5;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 12px;
        border-radius: 0px;
      ">
        <div style="font-weight: 600; color: #ffffff;">${formattedName}</div>
        <div style="font-size: 9px; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; color: ${groupColor}; font-weight: 700;">
          ${node.group}
        </div>
        ${node.hometown ? `<div style="font-size: 10px; color: #737373; margin-top: 2px;">${node.hometown}</div>` : ''}
      </div>
    `;
  }, []);

  const handleLinkLabel = useCallback((link: any) => {
    if (link.type === 'MEMBER_OF') {
      const sourceName = typeof link.source === 'object' ? link.source.name : link.source;
      const targetName = typeof link.target === 'object' ? link.target.name : link.target;
      return `
        <div style="
          background: rgba(13, 13, 13, 0.95);
          border: 1px solid #262626;
          padding: 8px 12px;
          color: #e5e5e5;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 12px;
          border-radius: 0px;
        ">
          <div style="font-weight: 600; color: #ffffff;">
            ${formatSeparators(sourceName)} <span style="color: #737373; font-weight: 300; margin: 0 4px;">/</span> ${formatSeparators(targetName)}
          </div>
          <div style="font-size: 9px; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; color: #0ea5e9; font-weight: 700;">
            Member Of Team
          </div>
        </div>
      `;
    }
    
    // For combat/battle links (DEFEATED, BATTLED, WON, LOST, etc.)
    const sourceName = typeof link.source === 'object' ? link.source.name : link.source;
    const targetName = typeof link.target === 'object' ? link.target.name : link.target;
    const battleName = link.battle_name || `${sourceName} vs ${targetName}`;
    const formattedName = formatSeparators(battleName);
    
    const details = [];
    if (link.event_name) details.push(link.event_name);
    if (link.year) details.push(link.year);
    if (link.match_format) details.push(FORMAT_LABELS[link.match_format] || link.match_format);
    
    const viewsText = link.view_count != null ? `${formatViews(link.view_count)} views` : '';
    const groupColor = link.type === 'BATTLED' ? '#a3a3a3' : '#b59210';
    
    return `
      <div style="
        background: rgba(13, 13, 13, 0.95);
        border: 1px solid #262626;
        padding: 8px 12px;
        color: #e5e5e5;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 12px;
        border-radius: 0px;
      ">
        <div style="font-weight: 600; color: #ffffff;">${formattedName}</div>
        <div style="font-size: 9px; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; color: ${groupColor}; font-weight: 700;">
          ${link.type === 'DEFEATED' ? 'Battle (Defeat)' : link.type === 'BATTLED' ? 'Battle (Draw/Promo)' : 'Battle'}
        </div>
        ${details.length > 0 ? `<div style="font-size: 10px; color: #a3a3a3; margin-top: 2px;">${details.join(' • ')}</div>` : ''}
        ${viewsText ? `<div style="font-size: 10px; color: #737373; margin-top: 2px;">${viewsText}</div>` : ''}
      </div>
    `;
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative group font-sans">

      {/* Node Details Overlay */}
      {selectedNode && !selectedLink && (
        <div className="absolute top-4 left-4 max-md:left-1/2 max-md:-translate-x-1/2 z-[60] w-72 bg-[#0d0d0d] border border-neutral-800 p-4 text-neutral-200 shadow-2xl pointer-events-auto transition-all">
          <button onClick={() => setSelectedNodeId(null)} className="absolute top-3 right-3 text-neutral-500 hover:text-white transition-colors">✕</button>

          <div className="flex items-center gap-3 pb-3 mb-3 border-b border-neutral-800">
            {selectedNode.avatar_url ? (
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
                {selectedLink.match_format && <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-0.5">Format</span><span className="text-neutral-200">{FORMAT_LABELS[selectedLink.match_format] || selectedLink.match_format}</span></div>}
                {selectedLink.match_type && <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500 mb-0.5">Type</span><span className="text-neutral-200">{MATCH_TYPE_LABELS[selectedLink.match_type] || selectedLink.match_type}</span></div>}
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

      <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden absolute bottom-6 left-6 z-[60] w-10 h-10 rounded-md bg-[#121212]/30 backdrop-blur-md border border-white/5 flex items-center justify-center text-[#EFEFEF] opacity-60 hover:opacity-100 transition-all">
        {isMobileMenuOpen ? <span className="text-xl">✕</span> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>}
      </button>

      {/* Control Panel */}
      <div className={`absolute z-[55] flex flex-col gap-2 transition-all w-64 pointer-events-auto md:top-4 md:right-4 ${isMobileMenuOpen ? 'bottom-20 left-6 opacity-100' : 'max-md:opacity-0 max-md:pointer-events-none'}`}>

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
                        className="accent-neutral-500 rounded-none border-neutral-800 bg-neutral-900 w-3.5 h-3.5"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowLabels(!showLabels)}
            title={showLabels ? "Hide Node Labels" : "Show Node Labels"}
            className="ml-1 p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-900 rounded-none transition-all flex items-center justify-center shrink-0"
          >
            {showLabels ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
            )}
          </button>
        </div>

        <div className='flex gap-2'>
          <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-[#0d0d0d] text-neutral-400 border border-neutral-800 rounded-none px-3 py-2 text-xs w-32 outline-none focus:border-neutral-700 hover:bg-neutral-900">
            <option value="All">All Years</option>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={selectedMatchType} onChange={(e) => setSelectedMatchType(e.target.value)} className="bg-[#0d0d0d] text-neutral-400 border border-neutral-800 rounded-none px-3 py-2 text-xs w-32 outline-none focus:border-neutral-700 hover:bg-neutral-900">
            <option value="All">All Types</option>
            {availableMatchTypes.map(t => <option key={t} value={t}>{MATCH_TYPE_LABELS[t] || t}</option>)}
          </select>
        </div>

        <select value={sizeBasis} onChange={(e) => setSizeBasis(e.target.value as 'battles' | 'views')} className="w-full bg-[#0d0d0d] text-neutral-400 border border-neutral-800 rounded-none px-3 py-2 text-xs outline-none focus:border-neutral-700 hover:bg-neutral-900 transition-colors">
          <option value="battles">Node Size: Total Battles</option>
          <option value="views">Node Size: Total Views</option>
        </select>

        <label className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white cursor-pointer select-none py-1.5 px-3 bg-[#0d0d0d] border border-neutral-800 rounded-none w-full transition-colors">
          <input
            type="checkbox"
            checked={officialOnly}
            onChange={(e) => setOfficialOnly(e.target.checked)}
            className="accent-neutral-500 rounded-none border-neutral-800 bg-neutral-900 w-3.5 h-3.5"
          />
          <span>Official Records Only</span>
        </label>

        <input type="text" placeholder="Search Emcee or Team..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#0d0d0d] text-neutral-200 placeholder-neutral-600 border border-neutral-800 rounded-none px-3 py-2 text-xs outline-none focus:border-neutral-700" />

        <div className="bg-[#0d0d0d] border border-neutral-800 rounded-none flex flex-col max-h-[300px]">
          <div className="px-3 py-1.5 border-b border-neutral-800 flex justify-between items-center shrink-0">
            <span className="text-xs text-neutral-500 font-semibold">Combatants ({filteredEmceesList.length})</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="bg-transparent text-neutral-400 border border-neutral-800 rounded-none px-2 py-0.5 text-[10px] w-24 outline-none hover:bg-neutral-900 focus:border-neutral-700">
              <option value="name">Sort: Name</option>
              <option value="winRate">Sort: Win Rate</option>
              <option value="views">Sort: Views</option>
              <option value="wins">Sort: Wins</option>
              <option value="losses">Sort: Losses</option>
            </select>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-neutral-900 custom-scrollbar">
            {filteredEmceesList.map(node => {
              const rate = nodeStats[node.id]?.winRate ?? 0.5;
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
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-6 left-6 z-[55] pointer-events-none hidden md:flex flex-col gap-3 bg-[#0d0d0d] border border-neutral-800 rounded-none p-3 shadow-2xl">
        <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold border-b border-neutral-800 pb-1">Legend</span>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold">Win Rate</span>
          <div className="w-full h-1 bg-gradient-to-r from-[#f87171] via-[#facc15] to-[#4ade80] rounded-none"></div>
          <div className="flex justify-between text-[9px] text-neutral-600">
            <span>Low</span><span>Avg</span><span>High</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mt-1">
          <div className="flex items-center gap-2 text-[10px] text-neutral-400">
            <div className="w-2 h-2 rounded-full border border-neutral-700"></div> Individual Emcee
          </div>
          {selectedFormats.some(f => f !== '1v1') && (
            <>
              <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                <div className="w-2 h-2 rounded-none border border-neutral-700"></div> Team
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

      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={displayData}

        nodeLabel={handleNodeLabel}
        linkLabel={handleLinkLabel}

        onNodeClick={handleSearchSelect}
        onNodeHover={(node: any) => setHoveredNodeId(node ? node.id : null)}
        onLinkHover={(link: any) => setHoveredLink(link)}
        onBackgroundClick={() => {
          setSelectedNodeId(null);
          setSelectedLink(null);
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onLinkClick={(link: any) => {
          setSelectedLink(link);
          setSelectedNodeId(null);
        }}

        nodeThreeObject={handleNodeThreeObject}

        linkColor={(link: any) => {
          if (selectedNodeId || selectedLink) {
            if (highlightLinks.has(link)) {
              if (link.type === 'MEMBER_OF') return '#0ea5e9';
              if (link.type === 'WON') return '#4ade80';
              if (link.type === 'LOST') return '#f87171';
              if (link.type === 'DEFEATED') {
                const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                return sourceId === selectedNodeId ? '#4ade80' : '#f87171';
              }
              return '#FFFFFF';
            }
            return '#1a1a1a';
          }

          if (link.type === 'MEMBER_OF') return 'rgba(14, 165, 233, 0.08)';
          if (link.type === 'WON') return 'rgba(74, 222, 128, 0.4)';
          if (link.type === 'LOST') return 'rgba(248, 113, 113, 0.2)';
          if (link.match_format && link.match_format !== '1v1') return '#8b5cf6';
          if (link.match_type === 'tournament') return '#b59210';
          if (link.match_type === 'promo') return '#be185d';
          return '#4a5568';
        }}
        linkOpacity={0.6}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkWidth={(link: any) => {
          const isHovered = hoveredLink === link;
          if (selectedNodeId || selectedLink) {
            if (highlightLinks.has(link)) {
              return (link.type === 'MEMBER_OF' ? 0.4 : 1.2) * (isHovered ? 2.5 : 1);
            }
            return 0.05;
          }
          return (link.type === 'MEMBER_OF' ? 0.15 : 0.6) * (isHovered ? 2.5 : 1);
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkDirectionalArrowLength={() => 0}
        linkDirectionalArrowRelPos={1}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkDirectionalParticles={(link: any) => {
          if ((selectedNodeId || selectedLink) && highlightLinks.has(link)) return link.type === 'MEMBER_OF' ? 2 : 4;
          return 0;
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkDirectionalParticleSpeed={(link: any) => {
          if ((selectedNodeId || selectedLink) && highlightLinks.has(link)) {
            return link.type === 'MEMBER_OF' ? 0.005 : -0.003;
          }
          return 0;
        }}
      />
    </div>
  );
}