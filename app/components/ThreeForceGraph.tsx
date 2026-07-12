import React, { useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { formatSeparators, formatViews } from '../utils/helpers';
import { GraphNode, GraphLink } from '../hooks/useGraphData';

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

const BATTLE_MATERIAL = new THREE.MeshLambertMaterial({
  color: '#eab308',
  transparent: true,
  opacity: 0.9,
});
const TEAM_MATERIAL = new THREE.MeshLambertMaterial({
  color: '#38bdf8',
  transparent: true,
  opacity: 0.9,
});

const interpolateHex = (hex1: string, hex2: string, t: number) => {
  const r1 = parseInt(hex1.slice(1, 3), 16), g1 = parseInt(hex1.slice(3, 5), 16), b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16), g2 = parseInt(hex2.slice(3, 5), 16), b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const getViewsColor = (views: number) => {
  // Use a power curve to spread out the colors better since views are heavily right-skewed
  const t = Math.min(1, Math.pow(views / 150000000, 0.4));
  if (t < 0.5) {
    return interpolateHex('#38bdf8', '#eab308', t * 2);
  } else {
    return interpolateHex('#eab308', '#f43f5e', (t - 0.5) * 2);
  }
};

const getWinRateColor = (rate: number) => {
  let h, s, l;
  if (rate < 0.5) {
    const t = rate / 0.5; // 0 to 1
    h = t * 40;           // 0 to 40
    s = 75;
    l = 60 - t * 5;       // 60 to 55
  } else {
    const t = (rate - 0.5) / 0.5; // 0 to 1
    h = 40 + t * 105;             // 40 to 145
    s = 75 - t * 10;              // 75 to 65
    l = 55;
  }
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
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

interface ThreeForceGraphProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fgRef: React.RefObject<any>;
  dimensions: { width: number; height: number };
  displayData: { nodes: GraphNode[]; links: GraphLink[] };
  selectedNodeId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedLink: any | null;
  hoveredNodeId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hoveredLink: any | null;
  showLabels: boolean;
  sizeBasis: 'battles' | 'views';
  colorMode: 'group' | 'winRate' | 'views';
  linkColorMode: 'relation' | 'battle_type' | 'format';
  nodeStats: Record<string, { wins: number; losses: number; draws: number; total: number; winRate: number }>;
  highlightNodes: Set<string>;
  highlightLinks: Set<any>;
  handleSearchSelect: (node: any) => void;
  setHoveredNodeId: (id: string | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setHoveredLink: (link: any | null) => void;
  setSelectedNodeId: (id: string | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSelectedLink: (link: any | null) => void;
}

function ThreeForceGraphComponent({
  fgRef,
  dimensions,
  displayData,
  selectedNodeId,
  selectedLink,
  hoveredNodeId,
  hoveredLink,
  showLabels,
  sizeBasis,
  colorMode,
  linkColorMode,
  nodeStats,
  highlightNodes,
  highlightLinks,
  handleSearchSelect,
  setHoveredNodeId,
  setHoveredLink,
  setSelectedNodeId,
  setSelectedLink,
}: ThreeForceGraphProps) {

  // --- LIVE STATE REF ---
  const graphState = useRef({ selectedNodeId, selectedLink, highlightNodes, highlightLinks, showLabels, sizeBasis, colorMode, linkColorMode, nodeStats, hoveredNodeId, displayData });
  useEffect(() => {
    graphState.current = { selectedNodeId, selectedLink, highlightNodes, highlightLinks, showLabels, sizeBasis, colorMode, linkColorMode, nodeStats, hoveredNodeId, displayData };
  }, [selectedNodeId, selectedLink, highlightNodes, highlightLinks, showLabels, sizeBasis, colorMode, linkColorMode, nodeStats, hoveredNodeId, displayData]);

  // Flat array of active node groups to avoid full scene traversal
  const nodeGroupsRef = useRef<THREE.Group[]>([]);

  // Clear array on data change to remove stale node groups
  useEffect(() => {
    nodeGroupsRef.current = [];
    linkGroupRef.current = null;
  }, [displayData]);

  // Cache link group reference
  const linkGroupRef = useRef<THREE.Group | null>(null);

  // Helper to find the group containing all link lines in the Three.js scene without traversing
  const getLinkGroup = useCallback((): THREE.Group | null => {
    if (linkGroupRef.current) return linkGroupRef.current;
    
    // Find the first active node group
    const activeNodeGroup = nodeGroupsRef.current.find(obj => obj.parent !== null);
    if (!activeNodeGroup) return null;
    
    const nodeGroup = activeNodeGroup.parent;
    const graphScene = nodeGroup?.parent;
    if (!graphScene) return null;
    
    // The linkGroup is the sibling of nodeGroup in graphScene.children
    const foundGroup = graphScene.children.find(child => child !== nodeGroup && child.type === 'Group') as THREE.Group | undefined;
    if (foundGroup) {
      linkGroupRef.current = foundGroup;
      return foundGroup;
    }
    
    return null;
  }, []);
  
  // Track camera state to detect motion and pause/resume animation frames
  const lastCameraState = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  });
  
  const isLoopRunning = useRef(false);

  const triggerUpdate = useCallback(() => {
    if (isLoopRunning.current) return;
    isLoopRunning.current = true;

    let frameId: number;

    const updateSpritePositions = () => {
      const camera = fgRef.current?.camera();
      const scene = fgRef.current?.scene();
      if (!camera || !scene) {
        isLoopRunning.current = false;
        return;
      }

      const state = graphState.current;
      const camPos = camera.position;
      const camQuat = camera.quaternion;
      const VIS_DIST_SQ = 1100 * 1100; // Increased visibility threshold from 650

      let needsNextFrame = false;

      // Detect if camera moved (zoom, pan, rotate)
      const distSq = lastCameraState.current.position.distanceToSquared(camPos);
      const angle = lastCameraState.current.quaternion.angleTo(camQuat);
      const cameraChanged = distSq > 0.00001 || angle > 0.0001;

      if (cameraChanged) {
        lastCameraState.current.position.copy(camPos);
        lastCameraState.current.quaternion.copy(camQuat);
        needsNextFrame = true;
      }

      // Subgraph Foregrounding for Links
      const linkGroup = getLinkGroup();
      if (linkGroup) {
        linkGroup.children.forEach((obj: any) => {
          const link = obj.__data;
          if (!link) return;
          
          let targetRenderOrder = 0;
          let targetDepthTest = true;
          if (state.selectedNodeId) {
            if (state.highlightLinks.has(link)) {
              targetRenderOrder = 10;
              targetDepthTest = false;
            }
          }
          
          if (obj.renderOrder !== targetRenderOrder) {
            obj.renderOrder = targetRenderOrder;
            needsNextFrame = true;
          }

          if (obj.material) {
            const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
            if (mat && mat.depthTest !== targetDepthTest) {
              mat.depthTest = targetDepthTest;
              mat.needsUpdate = true;
              needsNextFrame = true;
            }
          }
        });
      }

      // Build a map of fresh node references from displayData to avoid O(N^2) search
      const nodeMap = new Map<string, any>();
      state.displayData.nodes.forEach((n: any) => nodeMap.set(n.id, n));

      nodeGroupsRef.current.forEach((obj) => {
        if (obj.parent === null) return; // Skip unattached nodes, three-forcegraph will attach them shortly

        const sprite = obj.getObjectByName('node-label') as SpriteText | undefined;
        const mesh = obj.getObjectByName('node-mesh') as THREE.Mesh | undefined;
        const initialNode = obj.userData.node;

        if (!sprite || !mesh || !initialNode) return;

        // Retrieve fresh node properties (e.g. updated battleCount)
        const node = nodeMap.get(initialNode.id) || initialNode;

        if (node.group === 'Battle') {
          if (mesh.visible !== false) mesh.visible = false;
          if (sprite.visible !== false) sprite.visible = false;
          return; // Skip all other visual logic for invisible hub nodes
        }

        const isCenter = state.selectedNodeId === node.id;
        const isHighlighted = state.highlightNodes.has(node.id);

        // Handle Render Order for Subgraph Foregrounding
        let targetRenderOrder = 0;
        let targetDepthTest = true;
        if (state.selectedNodeId) {
          targetRenderOrder = (isCenter || isHighlighted) ? 20 : 0;
          targetDepthTest = !(isCenter || isHighlighted);
        }
        if (obj.renderOrder !== targetRenderOrder) {
          obj.renderOrder = targetRenderOrder;
          mesh.renderOrder = targetRenderOrder;
          sprite.renderOrder = targetRenderOrder;
          needsNextFrame = true;
        }

        if (mesh.material) {
          const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if (mat) {
            if (targetDepthTest === false && (mat === BATTLE_MATERIAL || mat === TEAM_MATERIAL)) {
              mesh.material = mat.clone();
            }
            const activeMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            if (activeMat && activeMat.depthTest !== targetDepthTest) {
              activeMat.depthTest = targetDepthTest;
              activeMat.needsUpdate = true;
              needsNextFrame = true;
            }
          }
        }

        if (sprite.material) {
          if (sprite.material.depthTest !== targetDepthTest) {
            sprite.material.depthTest = targetDepthTest;
            sprite.material.needsUpdate = true;
            needsNextFrame = true;
          }
        }

        // Scale node geometry
        let targetScale = 1.0;
        if (node.group === 'Battle') {
          targetScale = 2.0;
        } else {
          let basisVal = 0;
          if (state.sizeBasis === 'views') {
            basisVal = node.total_views ?? 0;
            // Map 0 to 450M views smoothly on a 0.35 power curve from 1.5 to 8.5
            targetScale = Math.max(1.5, Math.min(8.5, 1.5 + Math.pow(basisVal / 450000000, 0.35) * 7.0));
          } else {
            basisVal = node.battleCount ?? 0;
            // Map 0 to 45 battles smoothly on a square root curve from 1.5 to 8.5
            targetScale = Math.max(1.5, Math.min(8.5, 1.5 + Math.sqrt(basisVal / 45) * 7.0));
          }
        }

        if (state.selectedNodeId) {
          if (isCenter) targetScale *= 1.35;
          else if (!isHighlighted) targetScale *= 0.65;
        }

        const currentScale = mesh.scale.x;
        if (Math.abs(currentScale - targetScale) > 0.01) {
          const nextScale = currentScale + (targetScale - currentScale) * 0.15;
          mesh.scale.setScalar(nextScale);
          needsNextFrame = true;
        }

        // Node styling colors
        let targetColorStr = '#ffffff';
        if (node.group === 'Battle') {
          targetColorStr = '#eab308';
        } else if (node.group === 'Team') {
          targetColorStr = '#38bdf8';
        } else if (state.selectedNodeId) {
          if (isCenter) targetColorStr = '#FFFFFF';
          else if (!isHighlighted) targetColorStr = '#333333';
          else if (state.colorMode === 'views') targetColorStr = getViewsColor(node.total_views ?? 0);
          else targetColorStr = state.colorMode === 'winRate' ? getWinRateColor(state.nodeStats[node.id]?.winRate ?? 0.5) : '#a3a3a3';
        } else {
          if (state.colorMode === 'views') targetColorStr = getViewsColor(node.total_views ?? 0);
          else targetColorStr = state.colorMode === 'winRate' ? getWinRateColor(state.nodeStats[node.id]?.winRate ?? 0.5) : '#a3a3a3';
        }

        // Only modify materials for non-shared nodes (like Emcees)
        if (node.group !== 'Battle' && node.group !== 'Team' && mesh.userData.currentColor !== targetColorStr) {
          (mesh.material as THREE.MeshLambertMaterial).color.set(targetColorStr);
          mesh.userData.currentColor = targetColorStr;
          needsNextFrame = true;
        }

        // Text labels visibility
        if (!state.showLabels) {
          if (sprite.visible) {
            sprite.visible = false;
            needsNextFrame = true;
          }
          return;
        }

        const distance = Math.max(10, camPos.distanceTo(obj.position));
        const nodeHeight = targetScale;
        let targetVisible = false;
        let tgtColor = '#e5e5e5';
        let tgtHeight = 3.5;
        let targetY = nodeHeight + 2.8;
        let targetOpacity = 0.7;

        if (state.selectedNodeId) {
          // Clamp size scaling past distance 800
          const clampedDistanceScale = Math.min(distance / 400, 800 / 400);
          
          // Fade opacity out linearly from distance 1000 to 1800
          let distanceOpacity = 1.0;
          if (distance > 1000) {
            distanceOpacity = Math.max(0, 1.0 - (distance - 1000) / 800);
          }

          if (isCenter) {
            targetVisible = distanceOpacity > 0;
            tgtColor = '#ffffff';
            tgtHeight = 7.5 * clampedDistanceScale;
            targetY = (nodeHeight + 6.0) * clampedDistanceScale;
            targetOpacity = distanceOpacity;
          } else if (isHighlighted) {
            targetVisible = distanceOpacity > 0;
            tgtColor = '#ffffff';
            tgtHeight = 5.5 * clampedDistanceScale;
            targetY = (nodeHeight + 4.5) * clampedDistanceScale;
            targetOpacity = 0.85 * distanceOpacity;
          }
        } else {
          const distSq = camPos.distanceToSquared(obj.position);
          if (distSq < VIS_DIST_SQ) {
            targetVisible = true;
            if (state.hoveredNodeId === node.id) {
              tgtColor = '#ffffff';
              targetOpacity = 1.0;
            } else {
              const dist = Math.sqrt(distSq);
              targetOpacity = 0.45 * Math.max(0, Math.min(1, (1100 - dist) / 300));
              tgtColor = '#e5e5e5';
            }
          }
        }

        if (sprite.visible !== targetVisible) {
          sprite.visible = targetVisible;
          needsNextFrame = true;
        }

        if (targetVisible) {
          if (sprite.color !== tgtColor) {
            sprite.color = tgtColor;
            needsNextFrame = true;
          }
          if (sprite.textHeight !== tgtHeight) {
            sprite.textHeight = tgtHeight;
            needsNextFrame = true;
          }
          if (sprite.material.opacity !== targetOpacity) {
            sprite.material.opacity = targetOpacity;
            needsNextFrame = true;
          }
          if (sprite.material.depthTest !== targetDepthTest) {
            sprite.material.depthTest = targetDepthTest;
            sprite.material.needsUpdate = true;
            needsNextFrame = true;
          }

          // Interpolate position relative to viewport up-vector
          if (sprite.userData.currentY === undefined) sprite.userData.currentY = targetY;
          const diff = targetY - sprite.userData.currentY;
          if (Math.abs(diff) > 0.01) {
            sprite.userData.currentY += diff * 0.15;
            needsNextFrame = true;
          }

          const upVector = new THREE.Vector3();
          upVector.setFromMatrixColumn(camera.matrixWorld, 1);
          upVector.normalize().multiplyScalar(sprite.userData.currentY);
          sprite.position.copy(upVector);
        }
      });

      if (needsNextFrame) {
        frameId = requestAnimationFrame(updateSpritePositions);
      } else {
        isLoopRunning.current = false;
      }
    };

    frameId = requestAnimationFrame(updateSpritePositions);
  }, [fgRef, getLinkGroup]);

  // Hook up OrbitControls listener to trigger animation frame requests when the user drags the camera
  useEffect(() => {
    let timer: any;
    let controls: any;

    const setupControlsListener = () => {
      if (fgRef.current && fgRef.current.controls) {
        controls = fgRef.current.controls();
        if (controls) {
          controls.addEventListener('change', triggerUpdate);
          clearInterval(timer);
        }
      }
    };

    timer = setInterval(setupControlsListener, 100);

    return () => {
      clearInterval(timer);
      if (controls) {
        controls.removeEventListener('change', triggerUpdate);
      }
    };
  }, [fgRef, triggerUpdate]);

  // Wake up render loop when visual props or highlight state change
  useEffect(() => {
    triggerUpdate();
  }, [selectedNodeId, selectedLink, hoveredNodeId, hoveredLink, showLabels, sizeBasis, colorMode, linkColorMode, highlightNodes, highlightLinks, triggerUpdate]);

  // Reset local list of node groups and trigger frame request on new dataset
  useEffect(() => {
    nodeGroupsRef.current = [];
    linkGroupRef.current = null;
    triggerUpdate();
  }, [displayData, triggerUpdate]);

  // Initial trigger after graph engine is fully initialized
  useEffect(() => {
    const timer = setInterval(() => {
      if (fgRef.current && fgRef.current.camera && fgRef.current.scene) {
        clearInterval(timer);
        // Set initial camera position back, so we aren't inside the graph cluster
        fgRef.current.cameraPosition({ x: 0, y: 0, z: 800 });
        triggerUpdate();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [fgRef, triggerUpdate]);

  const handleNodeThreeObject = useCallback((node: any) => {
    const group = new THREE.Group();
    group.name = 'node-group';
    group.userData = { node };

    // Select material based on group
    let geometry: THREE.BufferGeometry = SHARED_SPHERE_GEOMETRY;
    let color = '#a3a3a3';
    let material: THREE.Material;

    if (node.group === 'Battle') {
      geometry = SHARED_OCTAHEDRON_GEOMETRY;
      color = '#eab308';
      material = BATTLE_MATERIAL;
    } else if (node.group === 'Team') {
      geometry = SHARED_DODECAHEDRON_GEOMETRY;
      color = '#38bdf8';
      material = TEAM_MATERIAL;
    } else {
      material = new THREE.MeshLambertMaterial({
        color,
        transparent: true,
        opacity: 0.9,
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'node-mesh';
    mesh.userData = { currentColor: color };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Create text label
    const cleanLabel = node.name.replaceAll(' & ', ' / ');
    const sprite = new SpriteText(cleanLabel);
    sprite.name = 'node-label';
    sprite.fontFace = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    sprite.textHeight = 2.5;
    sprite.color = 'rgba(255, 255, 255, 0.7)';
    sprite.backgroundColor = 'rgba(0, 0, 0, 0)'; // Explicitly transparent
    sprite.material.depthWrite = false; // Fixes the WebGL depth clipping artifacts (black box background)
    sprite.renderOrder = 999; // Render labels on top of links and nodes
    sprite.visible = false; // Visibility and position handled dynamically by frame animation loop
    group.add(sprite);

    // Completely hide the node visually if it's a Battle hub
    if (node.group === 'Battle') {
      mesh.visible = false;
      sprite.visible = false;
    }

    // Register node group in flat array for fast loop updates
    nodeGroupsRef.current.push(group);

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
    <ForceGraph3D
      ref={fgRef}
      width={dimensions.width}
      height={dimensions.height}
      graphData={displayData}
      onEngineTick={triggerUpdate}

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

        if (linkColorMode === 'battle_type') {
          if (link.match_type === 'tournament' || link.match_type === 'non_tournament_judged') return '#eab308';
          if (link.match_type === 'promo') return '#ec4899';
          if (link.match_type === 'tryout') return '#3b82f6';
          return '#6b7280';
        } else if (linkColorMode === 'format') {
          if (link.match_format === '2v2') return '#a855f7';
          if (link.match_format === 'royal_rumble') return '#eab308';
          if (link.match_format === '3way') return '#ec4899';
          if (link.match_format === '3v3' || link.match_format === '5v5') return '#3b82f6';
          if (link.match_format === 'handicap') return '#10b981';
          return '#6b7280';
        } else {
          // relation (default)
          if (link.type === 'MEMBER_OF') return 'rgba(14, 165, 233, 0.15)';
          if (link.type === 'WON') return 'rgba(74, 222, 128, 0.4)';
          if (link.type === 'LOST') return 'rgba(248, 113, 113, 0.2)';
          if (link.match_type === 'tournament' || link.match_type === 'non_tournament_judged') return 'rgba(234, 179, 8, 0.25)';
          if (link.match_type === 'promo') return 'rgba(236, 72, 153, 0.25)';
          return '#6b7280';
        }
      }}
      linkWidth={(link: any) => {
        if (selectedNodeId || selectedLink) {
          return highlightLinks.has(link) ? 1.5 : 0.3;
        }
        return 0.8;
      }}

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      linkDirectionalArrowLength={() => 0}
      linkDirectionalArrowRelPos={1}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      linkDirectionalParticles={(link: any) => {
        const isHovered = hoveredLink === link;
        if ((selectedNodeId || selectedLink) && highlightLinks.has(link)) return link.type === 'MEMBER_OF' ? 2 : 4;
        if (isHovered) return 4;
        return 0;
      }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      linkDirectionalParticleSpeed={(link: any) => {
        const isHovered = hoveredLink === link;
        if ((selectedNodeId || selectedLink) && highlightLinks.has(link)) {
          return link.type === 'MEMBER_OF' ? 0.005 : -0.003;
        }
        if (isHovered) return link.type === 'MEMBER_OF' ? 0.008 : -0.006;
        return 0;
      }}
    />
  );
}

export const ThreeForceGraph = React.memo(ThreeForceGraphComponent);
