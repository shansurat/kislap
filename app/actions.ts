'use server'

import { getNeo4jDriver } from '@/lib/neo4j';
import { redis } from '@/lib/redis';

export async function fetchGraphDataForVisualization() {
  const CACHE_KEY = 'kislap:graph_data';

  if (redis) {
    try {
      const cached = await redis.get<{ nodes: any[], links: any[] }>(CACHE_KEY);
      if (cached) return { success: true, data: cached };
    } catch (e) {
      console.warn('Redis cache read failed:', e);
    }
  }

  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    // 1. Fetch Nodes (Distinguishing individual Emcees vs Teams vs Events)
    const nodesRes = await session.run(`
      MATCH (n) 
      WHERE n:Emcee OR n:Event
      OPTIONAL MATCH (n)-[r:DEFEATED|BATTLED]-()
      WITH n, count(r) AS battleCount
      RETURN n.id AS id, 
             CASE 
               WHEN n:Event THEN 'Event'
               WHEN n:Team THEN 'Team'
               ELSE 'Emcee'
             END AS group, 
             COALESCE(n.stage_name, n.event_name, 'Unknown') AS name, 
             n.hometown AS hometown,
             n.total_views AS total_views,
             n.avatar_url AS avatar_url,
             battleCount
    `);

    // 2. Fetch Links (Battles, Event Attendances, and Team Memberships)
    const linksRes = await session.run(`
      /* Arm 1: Combat relationships (Who fought/defeated whom) */
      MATCH (source:Emcee)-[r]->(target:Emcee)
      WHERE type(r) = 'DEFEATED' OR (type(r) = 'BATTLED' AND source.id < target.id)
      MATCH (b:Battle {id: r.battle_id})
      OPTIONAL MATCH (b)-[:HELD_AT]->(ev:Event)
      RETURN source.id AS source, target.id AS target, type(r) AS type, ev.year AS year, b.match_type AS match_type, b.match_format AS match_format, b.name AS battle_name, b.view_count AS view_count, ev.event_name AS event_name, b.id AS battle_id

      UNION

      /* Arm 2: Attendance relationships (Emcees/Teams attending an Event) */
      MATCH (source:Emcee)-[r]-(:Emcee)
      WHERE type(r) IN ['DEFEATED', 'BATTLED']
      MATCH (b:Battle {id: r.battle_id})-[:HELD_AT]->(target:Event)
      RETURN DISTINCT source.id AS source, target.id AS target, 'ATTENDED' AS type, target.year AS year, null AS match_type, null AS match_format, null AS battle_name, null AS view_count, null AS event_name, b.id AS battle_id

      UNION

      /* Arm 3: Team Structure (Which individual Emcees belong to which Team node) */
      MATCH (source:Emcee)-[r:MEMBER_OF]->(target:Team)
      RETURN source.id AS source, target.id AS target, 'MEMBER_OF' AS type, null AS year, null AS match_type, null AS match_format, null AS battle_name, null AS view_count, null AS event_name, null AS battle_id
    `);

    // 3. Process Nodes
    const nodes = nodesRes.records.map(rec => {
      const group = rec.get('group');
      const battleCount = rec.get('battleCount').toNumber();
      let val = 1;

      if (group === 'Emcee') {
        val = 2 + (battleCount * 0.4);
      } else if (group === 'Team') {
        val = 4 + (battleCount * 0.4); // Teams are slightly larger structural hubs
      } else if (group === 'Event') {
        val = 8;
      }

      const rawViews = rec.get('total_views');
      return {
        id: rec.get('id'),
        group,
        name: rec.get('name'),
        hometown: rec.get('hometown') || null,
        total_views: rawViews != null ? (rawViews.toNumber ? rawViews.toNumber() : Number(rawViews)) : null,
        avatar_url: rec.get('avatar_url') || null,
        val
      };
    });

    // 4. Process Links
    const links = linksRes.records.map(rec => {
      const yearRaw = rec.get('year');
      const viewRaw = rec.get('view_count');
      return {
        source: rec.get('source'),
        target: rec.get('target'),
        type: rec.get('type'), // Will be 'DEFEATED', 'BATTLED', 'ATTENDED', or 'MEMBER_OF'
        year: yearRaw ? (yearRaw.toNumber ? yearRaw.toNumber() : Number(yearRaw)) : null,
        match_type: rec.get('match_type') || null,
        match_format: rec.get('match_format') || null,
        battle_name: rec.get('battle_name') || null,
        view_count: viewRaw != null ? (viewRaw.toNumber ? viewRaw.toNumber() : Number(viewRaw)) : null,
        event_name: rec.get('event_name') || null,
        battle_id: rec.get('battle_id') || null
      };
    });

    const payload = { nodes, links };

    if (redis) {
      try {
        await redis.set(CACHE_KEY, payload, { ex: 60 * 60 });
      } catch (e) {
        console.warn('Redis cache write failed:', e);
      }
    }

    return { success: true, data: payload };
  } catch (error) {
    console.error('Visualization error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  } finally {
    await session.close();
  }
}