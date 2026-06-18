'use server'

import { getNeo4jDriver } from '@/lib/neo4j';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';

export async function fetchGraphDataForVisualization() {
  if (redis) {
    try {
      const cached = await redis.get<{ nodes: any[], links: any[] }>('kislap:graph_data');
      if (cached) {
        return { success: true, data: cached };
      }
    } catch (e) {
      console.warn('Redis cache read failed:', e);
    }
  }

  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const nodesRes = await session.run(`
      MATCH (n) WHERE labels(n)[0] IN ['Emcee', 'Event']
      OPTIONAL MATCH (n:Emcee)-[r:DEFEATED|BATTLED]-()
      WITH n, count(r) AS battleCount
      RETURN n.id AS id, 
             labels(n)[0] AS group, 
             COALESCE(n.stage_name, n.event_name, 'Unknown') AS name, 
             n.hometown AS hometown,
             n.total_views AS total_views,
             n.avatar_url AS avatar_url,
             battleCount
    `);

    const linksRes = await session.run(`
      MATCH (source:Emcee)-[r]->(target:Emcee)
      WHERE type(r) IN ['DEFEATED', 'BATTLED']
      MATCH (b:Battle {id: r.battle_id})
      OPTIONAL MATCH (b)-[:HELD_AT]->(ev:Event)
      RETURN source.id AS source, target.id AS target, type(r) AS type, ev.year AS year, b.match_type AS match_type, b.match_format AS match_format, b.name AS battle_name, b.view_count AS view_count, ev.event_name AS event_name
      UNION
      MATCH (source:Emcee)-[r]-(:Emcee)
      WHERE type(r) IN ['DEFEATED', 'BATTLED']
      MATCH (b:Battle {id: r.battle_id})-[:HELD_AT]->(target:Event)
      RETURN DISTINCT source.id AS source, target.id AS target, 'ATTENDED' AS type, target.year AS year, null AS match_type, null AS match_format, null AS battle_name, null AS view_count, null AS event_name
    `);

    const nodes = nodesRes.records.map(rec => {
      const group = rec.get('group');
      const battleCount = rec.get('battleCount').toNumber();
      let val = 1;
      
      if (group === 'Emcee') {
        val = 2 + (battleCount * 0.4); // Emcees scale with total battles
      } else if (group === 'Event') {
        val = 8; // Events are large hubs
      } else if (group === 'Battle') {
        val = 1; // Battles are small
      }
      
      return {
        id: rec.get('id'),
        group,
        name: rec.get('name'),
        hometown: rec.get('hometown') || null,
        total_views: rec.get('total_views') != null ? (rec.get('total_views').toNumber ? rec.get('total_views').toNumber() : Number(rec.get('total_views'))) : null,
        avatar_url: rec.get('avatar_url') || null,
        val
      };
    });

    const links = linksRes.records.map(rec => {
      const yearRaw = rec.get('year');
      const year = yearRaw ? (yearRaw.toNumber ? yearRaw.toNumber() : Number(yearRaw)) : null;
      return {
        source: rec.get('source'),
        target: rec.get('target'),
        type: rec.get('type'),
        year,
        match_type: rec.get('match_type') || null,
        match_format: rec.get('match_format') || null,
        battle_name: rec.get('battle_name') || null,
        view_count: rec.get('view_count') != null ? (rec.get('view_count').toNumber ? rec.get('view_count').toNumber() : Number(rec.get('view_count'))) : null,
        event_name: rec.get('event_name') || null
      };
    });

    const payload = { nodes, links };
    
    if (redis) {
      try {
        await redis.set('kislap:graph_data', payload);
      } catch (e) {
        console.warn('Redis cache write failed:', e);
      }
    }

    return { success: true, data: payload };
  } catch (error) {
    console.error('Visualization error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error fetching graph data';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}
