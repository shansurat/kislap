import { useMemo } from 'react';

export interface GraphNode {
  id: string;
  name: string;
  val: number;
  group?: string;
  hometown?: string | null;
  total_views?: number | null;
  avatar_url?: string | null;
  x?: number;
  y?: number;
  z?: number;
  battleCount?: number;
}

export interface GraphLink {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source: string | any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: string | any;
  type: string;
  year?: number | null;
  match_type?: string | null;
  match_format?: string | null;
  battle_name?: string | null;
  view_count?: number | null;
  event_name?: string | null;
  battle_id?: string | null;
  winner?: string[] | null;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface UseGraphDataProps {
  graphData: GraphData;
  selectedFormats: string[];
  selectedYear: string;
  selectedMatchType: string;
  officialOnly: boolean;
  searchQuery: string;
  sortBy: 'name' | 'winRate' | 'views' | 'wins' | 'losses';
  selectedNodeId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedLink: any | null;
}

const HUB_FORMATS = ['royal_rumble', '3way'];

export function useGraphData({
  graphData,
  selectedFormats,
  selectedYear,
  selectedMatchType,
  officialOnly,
  searchQuery,
  sortBy,
  selectedNodeId,
  selectedLink,
}: UseGraphDataProps) {
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
      if (link.type === 'MEMBER_OF') return true;
      
      if (link.match_type === 'tryout' || link.match_type === 'promo') return false;

      if (officialOnly) {
        const winners = link.winner || [];
        const isUnjudged = winners.includes('Unjudged');
        const hasResult = winners.length > 0;
        if (isUnjudged || !hasResult) return false;
      }

      if (selectedYear !== 'All' && link.year !== parseInt(selectedYear)) return false;

      if (selectedMatchType !== 'All' && link.match_type !== selectedMatchType) return false;

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

    // Calculate degree (total active battles) for each node
    const degreeCount: Record<string, number> = {};
    links.forEach(link => {
      if (link.type !== 'MEMBER_OF') {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;
        degreeCount[sId] = (degreeCount[sId] || 0) + 1;
        degreeCount[tId] = (degreeCount[tId] || 0) + 1;
      }
    });

    nodes = nodes.map(node => ({
      ...node,
      battleCount: degreeCount[node.id] || 0
    }));

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

  return {
    availableYears,
    availableMatchTypes,
    displayData,
    nodeStats,
    filteredEmceesList,
    selectedNode,
    battleParticipants,
    highlightNodes,
    highlightLinks,
  };
}
