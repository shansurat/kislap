import React, { useRef, useEffect, useCallback, useMemo } from 'react';
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

const getBattlesColor = (battles: number) => {
  // Map 0 to 40 battles smoothly using the same power curve
  const t = Math.min(1, Math.pow(battles / 40, 0.6));
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
  hoveredLink: any | null;
  showLabels: boolean;
  showNeighborLabels: boolean;
  sizeBasis: 'battles' | 'views';
  colorMode: 'group' | 'winRate' | 'views' | 'battles';
  linkColorMode: 'relation' | 'battle_type' | 'format';
  nodeStats: Record<string, { wins: number; losses: number; draws: number; total: number; winRate: number }>;
  highlightNodes: Set<string>;
  highlightLinks: Set<any>;
  isCameraLocked: boolean;
  showBackgroundLinks: boolean;
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
  showNeighborLabels,
  sizeBasis,
  colorMode,
  linkColorMode,
  nodeStats,
  highlightNodes,
  highlightLinks,
  isCameraLocked,
  showBackgroundLinks,
  handleSearchSelect,
  setHoveredNodeId,
  setHoveredLink,
  setSelectedNodeId,
  setSelectedLink,
}: ThreeForceGraphProps) {

  // --- LIVE STATE REF ---
  const graphState = useRef({ selectedNodeId, selectedLink, highlightNodes, highlightLinks, showLabels, showNeighborLabels, sizeBasis, colorMode, linkColorMode, nodeStats, hoveredNodeId, displayData, isCameraLocked, showBackgroundLinks });
  useEffect(() => {
    graphState.current = { selectedNodeId, selectedLink, highlightNodes, highlightLinks, showLabels, showNeighborLabels, sizeBasis, colorMode, linkColorMode, nodeStats, hoveredNodeId, displayData, isCameraLocked, showBackgroundLinks };
  }, [selectedNodeId, selectedLink, highlightNodes, highlightLinks, showLabels, showNeighborLabels, sizeBasis, colorMode, linkColorMode, nodeStats, hoveredNodeId, displayData, isCameraLocked, showBackgroundLinks]);

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

      // Handle Camera Lock
      if (state.isCameraLocked && state.selectedNodeId) {
        const controls = fgRef.current?.controls();
        if (controls) {
          // Find the selected node object to get its exact world position
          const selectedObj = nodeGroupsRef.current.find(obj => obj.userData?.node?.id === state.selectedNodeId);
          if (selectedObj && selectedObj.parent) {
            const worldPos = new THREE.Vector3();
            selectedObj.getWorldPosition(worldPos);
            // Lerp the target for a smooth tracking effect if it's moving fast
            controls.target.lerp(worldPos, 0.1);
            controls.update();
            needsNextFrame = true;
          }
        }
      }

      // Subgraph Foregrounding for Links
      const linkGroup = getLinkGroup();
      if (linkGroup) {
        linkGroup.children.forEach((obj: any) => {
          const link = obj.__data;
          if (!link) return;

          let targetRenderOrder = 0;
          let targetDepthWrite = true;
          if (state.selectedNodeId || state.selectedLink) {
            if (state.highlightLinks.has(link)) {
              targetRenderOrder = 10;
              targetDepthWrite = true;
            } else {
              targetRenderOrder = 0;
              targetDepthWrite = false;
            }
          }

          if (obj.renderOrder !== targetRenderOrder) {
            obj.renderOrder = targetRenderOrder;
            needsNextFrame = true;
          }

          if (obj.material) {
            if (!obj.userData.clonedMaterial) {
              const origMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
              if (origMat) {
                const newMat = origMat.clone();
                if (Array.isArray(obj.material)) {
                  obj.material = [newMat];
                } else {
                  obj.material = newMat;
                }
                obj.userData.clonedMaterial = true;
                obj.userData.baseOpacity = newMat.opacity;
              }
            }

            const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
            if (mat) {
              if (mat.depthTest !== true) {
                mat.depthTest = true;
                mat.needsUpdate = true;
                needsNextFrame = true;
              }
              if (mat.depthWrite !== targetDepthWrite) {
                mat.depthWrite = targetDepthWrite;
                mat.needsUpdate = true;
                needsNextFrame = true;
              }

              let distance = 1000;
              if (link.source && link.target && link.source.x !== undefined && link.target.x !== undefined) {
                const centerX = (link.source.x + link.target.x) / 2;
                const centerY = (link.source.y + link.target.y) / 2;
                const centerZ = (link.source.z + link.target.z) / 2;
                distance = camPos.distanceTo(new THREE.Vector3(centerX, centerY, centerZ));
              }

              let distanceScale = 1.0;
              if (distance < 1200) {
                distanceScale = Math.max(0.05, Math.pow(distance / 1200, 1.5));
              }

              let opacityMultiplier = distanceScale;
              const hasSelection = state.selectedNodeId || state.selectedLink;
              const isHighlighted = hasSelection ? state.highlightLinks.has(link) : false;

              if (!obj.userData.originalRaycast) {
                obj.userData.originalRaycast = obj.raycast;
              }

              let targetOpacity = (obj.userData.baseOpacity || 0.3) * opacityMultiplier;

              if (hasSelection && !isHighlighted) {
                targetOpacity = state.showBackgroundLinks ? 0.18 : 0.0;
                obj.raycast = () => { }; // Disable all interaction
              } else if (isHighlighted) {
                opacityMultiplier = 1.0;
                obj.raycast = obj.userData.originalRaycast; // Restore interaction
              } else {
                obj.raycast = obj.userData.originalRaycast; // Restore interaction
              }

              if (Math.abs(mat.opacity - targetOpacity) > 0.01) {
                mat.opacity = targetOpacity;
                mat.transparent = true;
                mat.needsUpdate = true;
                needsNextFrame = true;
              }
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
        let targetDepthWrite = true;
        if (state.selectedNodeId || state.selectedLink) {
          if (isCenter || isHighlighted) {
            targetRenderOrder = 20;
            targetDepthWrite = true;
          } else {
            targetRenderOrder = 0;
            targetDepthWrite = false;
          }
        }

        if (obj.renderOrder !== targetRenderOrder) {
          obj.renderOrder = targetRenderOrder;
          mesh.renderOrder = targetRenderOrder;
          sprite.renderOrder = 30; // Sprites always render on top
          needsNextFrame = true;
        }

        if (!obj.userData.originalRaycast) {
          obj.userData.originalRaycast = obj.raycast;
          mesh.userData.originalRaycast = mesh.raycast;
          sprite.userData.originalRaycast = sprite.raycast;
        }

        if (state.selectedNodeId || state.selectedLink) {
          if (!isCenter && !isHighlighted) {
            obj.raycast = () => { }; // Disable all interaction
            mesh.raycast = () => { };
            sprite.raycast = () => { };
          } else {
            obj.raycast = obj.userData.originalRaycast;
            mesh.raycast = mesh.userData.originalRaycast;
            sprite.raycast = sprite.userData.originalRaycast;
          }
        } else {
          obj.raycast = obj.userData.originalRaycast;
          mesh.raycast = mesh.userData.originalRaycast;
          sprite.raycast = sprite.userData.originalRaycast;
        }

        if (mesh.material) {
          const activeMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if (activeMat) {
            if (activeMat.depthTest !== true) {
              activeMat.depthTest = true;
              activeMat.needsUpdate = true;
              needsNextFrame = true;
            }
            if (activeMat.depthWrite !== targetDepthWrite) {
              activeMat.depthWrite = targetDepthWrite;
              activeMat.needsUpdate = true;
              needsNextFrame = true;
            }

            let targetNodeOpacity = 0.9;
            if (state.selectedNodeId || state.selectedLink) {
              if (!isCenter && !isHighlighted) {
                targetNodeOpacity = 0.03;
              } else if (isHighlighted && !isCenter) {
                targetNodeOpacity = state.hoveredNodeId === node.id ? 1.0 : 0.7;
              }
            }

            if (Math.abs(activeMat.opacity - targetNodeOpacity) > 0.01) {
              activeMat.opacity = targetNodeOpacity;
              activeMat.transparent = true;
              activeMat.needsUpdate = true;
              needsNextFrame = true;
            }
          }
        }

        if (sprite.material) {
          if (sprite.material.depthTest !== false) {
            sprite.material.depthTest = false;
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
            // Map 0 to 300M views on a steeper curve up to size 12.0 to make differences more obvious
            targetScale = Math.max(1.0, Math.min(12.0, 1.0 + Math.pow(basisVal / 300000000, 0.4) * 11.0));
          } else {
            basisVal = node.battleCount ?? 0;
            // Map 0 to 40 battles on a steeper curve up to size 12.0 to make differences more obvious
            targetScale = Math.max(1.0, Math.min(12.0, 1.0 + Math.pow(basisVal / 40, 0.6) * 11.0));
          }
        }



        const currentScale = mesh.scale.x;
        if (Math.abs(currentScale - targetScale) > 0.01) {
          const nextScale = currentScale + (targetScale - currentScale) * 0.15;
          mesh.scale.setScalar(nextScale);
          needsNextFrame = true;
        }

        // Node styling colors
        let targetColorStr = '#ffffff';
        if (state.selectedNodeId || state.selectedLink) {
          if (!isCenter && !isHighlighted) targetColorStr = '#333333';
          else if (node.group === 'Battle') targetColorStr = '#eab308';
          else if (node.group === 'Team') targetColorStr = '#38bdf8';
          else if (state.colorMode === 'views') targetColorStr = getViewsColor(node.total_views ?? 0);
          else if (state.colorMode === 'battles') targetColorStr = getBattlesColor(node.battleCount ?? 0);
          else targetColorStr = state.colorMode === 'winRate' ? getWinRateColor(state.nodeStats[node.id]?.winRate ?? 0.5) : '#a3a3a3';
        } else {
          if (node.group === 'Battle') targetColorStr = '#eab308';
          else if (node.group === 'Team') targetColorStr = '#38bdf8';
          else if (state.colorMode === 'views') targetColorStr = getViewsColor(node.total_views ?? 0);
          else if (state.colorMode === 'battles') targetColorStr = getBattlesColor(node.battleCount ?? 0);
          else targetColorStr = state.colorMode === 'winRate' ? getWinRateColor(state.nodeStats[node.id]?.winRate ?? 0.5) : '#a3a3a3';
        }

        // Only modify materials for non-shared nodes (like Emcees and Teams)
        if (node.group !== 'Battle' && mesh.userData.currentColor !== targetColorStr) {
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
        let tgtHeight = 5.5;
        let targetY = nodeHeight + 3.5;
        let targetOpacity = 0.7;

        if (state.selectedNodeId || state.selectedLink) {
          // Linear scale for consistent screen size at any distance
          const constantScreenScale = distance / 400;

          if (isCenter) {
            // Center node fades out very late
            let distanceOpacity = 1.0;
            if (distance > 1500) distanceOpacity = Math.max(0, 1.0 - (distance - 1500) / 500);

            targetVisible = distanceOpacity > 0;
            tgtColor = '#ffffff';
            tgtHeight = 8.0 * constantScreenScale;
            targetY = nodeHeight + (4.5 * constantScreenScale);
            targetOpacity = distanceOpacity;
          } else if (isHighlighted) {
            if (!state.showNeighborLabels && state.hoveredNodeId !== node.id) {
              targetVisible = false;
            } else {
              // Highlighted opponents fade out much sooner to prevent clutter
              // Start fading at 200, fully invisible at 450
              let distanceOpacity = 1.0;
              if (distance > 200) {
                distanceOpacity = Math.max(0, 1.0 - (distance - 200) / 250);
              }

              targetVisible = distanceOpacity > 0;
              tgtColor = '#ffffff';
              tgtHeight = 5.5 * constantScreenScale;
              targetY = nodeHeight + (3.5 * constantScreenScale);
              targetOpacity = state.hoveredNodeId === node.id ? 1.0 : (0.85 * distanceOpacity);
            }
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
  }, [selectedNodeId, selectedLink, hoveredNodeId, hoveredLink, showLabels, showNeighborLabels, sizeBasis, colorMode, linkColorMode, highlightNodes, highlightLinks, isCameraLocked, showBackgroundLinks, triggerUpdate]);

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
      material = new THREE.MeshLambertMaterial({
        color,
        transparent: true,
        opacity: 0.9,
      });
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
    sprite.textHeight = 3.5;
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
      backgroundColor="#000000"
      onEngineTick={triggerUpdate}

      nodeLabel={(node: any) => {
        if ((selectedNodeId || selectedLink) && !highlightNodes.has(node.id) && selectedNodeId !== node.id) return '';
        return handleNodeLabel(node);
      }}
      linkLabel={(link: any) => {
        if ((selectedNodeId || selectedLink) && !highlightLinks.has(link)) return '';
        return handleLinkLabel(link);
      }}

      onNodeClick={(node: any) => {
        if ((selectedNodeId || selectedLink) && !highlightNodes.has(node.id) && selectedNodeId !== node.id) {
          // Do nothing, entirely non-interactive
          return;
        }
        handleSearchSelect(node);
      }}
      onNodeHover={(node: any) => {
        if (node && (selectedNodeId || selectedLink) && !highlightNodes.has(node.id) && selectedNodeId !== node.id) {
          setHoveredNodeId(null);
          return;
        }
        setHoveredNodeId(node ? node.id : null);
      }}
      onLinkHover={(link: any) => {
        if (link && (selectedNodeId || selectedLink) && !highlightLinks.has(link)) {
          setHoveredLink(null);
          return;
        }
        setHoveredLink(link);
      }}
      onBackgroundClick={() => {
        setSelectedNodeId(null);
        setSelectedLink(null);
      }}
      onLinkClick={(link: any) => {
        if ((selectedNodeId || selectedLink) && !highlightLinks.has(link)) {
          // Do nothing, entirely non-interactive
          return;
        }
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
          return showBackgroundLinks ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0,0,0,0)';
        }

        if (linkColorMode === 'battle_type') {
          if (link.match_type === 'tournament' || link.match_type === 'non_tournament_judged') return 'rgba(234, 179, 8, 0.6)';
          if (link.match_type === 'promo') return 'rgba(236, 72, 153, 0.6)';
          if (link.match_type === 'tryout') return 'rgba(59, 130, 246, 0.6)';
          return 'rgba(107, 114, 128, 0.4)';
        } else if (linkColorMode === 'format') {
          if (link.match_format === '2v2') return 'rgba(168, 85, 247, 0.6)';
          if (link.match_format === 'royal_rumble') return 'rgba(234, 179, 8, 0.6)';
          if (link.match_format === '3way') return 'rgba(236, 72, 153, 0.6)';
          if (link.match_format === '3v3' || link.match_format === '5v5') return 'rgba(59, 130, 246, 0.6)';
          if (link.match_format === 'handicap') return 'rgba(16, 185, 129, 0.6)';
          return 'rgba(107, 114, 128, 0.4)';
        } else {
          // relation (default)
          if (link.type === 'MEMBER_OF') return 'rgba(14, 165, 233, 0.3)';
          if (link.type === 'WON') return 'rgba(74, 222, 128, 0.6)';
          if (link.type === 'LOST') return 'rgba(248, 113, 113, 0.4)';
          if (link.match_type === 'tournament' || link.match_type === 'non_tournament_judged') return 'rgba(234, 179, 8, 0.4)';
          if (link.match_type === 'promo') return 'rgba(236, 72, 153, 0.4)';
          return '#6b7280';
        }
      }}
      linkWidth={(link: any) => {
        if (selectedNodeId || selectedLink) {
          return highlightLinks.has(link) ? 1.5 : (showBackgroundLinks ? 0.8 : 0);
        }
        return 1.5;
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
