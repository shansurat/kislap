'use server'

import { getNeo4jDriver } from '@/lib/neo4j';
import { supabase } from '@/lib/supabase';

export async function getNeo4jStats() {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const nodeRes = await session.run(`
      MATCH (n)
      RETURN labels(n)[0] AS label, count(n) AS count
    `);
    const relRes = await session.run(`
      MATCH ()-[r]->()
      RETURN type(r) AS type, count(r) AS count
    `);
    
    const nodes = nodeRes.records.map(rec => ({
      label: rec.get('label'),
      count: rec.get('count').toNumber()
    }));
    
    const relationships = relRes.records.map(rec => ({
      type: rec.get('type'),
      count: rec.get('count').toNumber()
    }));

    return { success: true, data: { nodes, relationships } };
  } catch (error) {
    console.error('Error fetching Neo4j stats:', error);
    return { success: false, error: 'Failed to fetch Neo4j statistics' };
  } finally {
    await session.close();
  }
}

export async function getSyncLogs() {
  try {
    const { data, error } = await supabase
      .from('neo4j_sync_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    
    return { success: true, data };
  } catch (error: any) {
    console.error('Error fetching sync logs:', error);
    return { success: false, error: error.message || 'Failed to fetch sync logs' };
  }
}

export async function fetchGraphDataForVisualization() {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const nodesRes = await session.run(`
      MATCH (n:Emcee)
      OPTIONAL MATCH (n)-[r:DEFEATED|BATTLED]-()
      WITH n, count(r) AS battleCount
      RETURN n.id AS id, 
             CASE WHEN n:Team THEN 'Team' ELSE 'Emcee' END AS group, 
             COALESCE(n.stage_name, 'Unknown') AS name, 
             battleCount
      UNION ALL
      MATCH (n:Event)
      RETURN n.id AS id, 
             'Event' AS group, 
             COALESCE(n.event_name, 'Unknown') AS name, 
             0 AS battleCount
    `);

    const linksRes = await session.run(`
      MATCH (source:Emcee)-[r:DEFEATED|BATTLED]->(target:Emcee)
      WHERE type(r) = 'DEFEATED' OR (type(r) = 'BATTLED' AND source.id < target.id)
      MATCH (b:Battle {id: r.battle_id})
      OPTIONAL MATCH (b)-[:HELD_AT]->(ev:Event)
      RETURN source.id AS source, target.id AS target, type(r) AS type, ev.year AS year, 
             CASE WHEN b.is_promo THEN 'promo' WHEN b.is_tryout THEN 'tryout' ELSE 'regular' END AS match_type, 
             b.match_format AS match_format, b.winner AS winner
      UNION
      MATCH (source:Emcee)-[r:DEFEATED|BATTLED]-(:Emcee)
      MATCH (b:Battle {id: r.battle_id})-[:HELD_AT]->(target:Event)
      RETURN DISTINCT source.id AS source, target.id AS target, 'ATTENDED' AS type, target.year AS year, null AS match_type, null AS match_format, null AS winner
    `);

    const nodes = nodesRes.records.map(rec => {
      const group = rec.get('group');
      const battleCount = rec.get('battleCount').toNumber();
      let val = 1;
      
      if (group === 'Emcee') {
        val = 2 + (battleCount * 0.4); // Emcees scale with total battles
      } else if (group === 'Battle') {
        val = 1; // Battles are small
      }
      
      return {
        id: rec.get('id'),
        group,
        name: rec.get('name'),
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
        winner: rec.get('winner') || null
      };
    });

    return { success: true, data: { nodes, links } };
  } catch (error) {
    console.error('Visualization error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error fetching graph data';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}
