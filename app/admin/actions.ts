'use server'

import { getNeo4jDriver } from '@/lib/neo4j';
import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { redis } from '@/lib/redis';

async function invalidateCache() {
  if (redis) {
    try {
      await redis.del('kislap:graph_data');
    } catch (e) {
      console.warn('Redis cache invalidation failed:', e);
    }
  }
}

async function fetchAllSupabaseRecords(tableName: string) {
  let allRecords: Record<string, unknown>[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allRecords = [...allRecords, ...data];
    }

    if (!data || data.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allRecords;
}

export async function syncFromSupabase() {
  try {
    let allEmcees: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('emcees')
        .select('*, avatar:images!emcees_avatar_id_fkey(public_url), battle_participants(battles(view_count))')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        const formattedData = data.map((emcee: any) => {
          const views = emcee.battle_participants?.reduce((sum: number, bp: any) => sum + (bp.battles?.view_count || 0), 0) || 0;
          const avatarUrl = emcee.avatar?.public_url || null;
          const { battle_participants, avatar, ...rest } = emcee;
          return { ...rest, total_views: views, avatar_url: avatarUrl };
        });
        allEmcees = [...allEmcees, ...formattedData];
      }

      if (!data || data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    if (!allEmcees || allEmcees.length === 0) {
      return { success: true, count: 0 };
    }

    const emcees = allEmcees;

    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      const result = await session.executeWrite(async (tx) => {
        const query = `
          UNWIND $batch AS row
          MERGE (e:Emcee {id: row.id})
          SET e += row
          RETURN count(e) as syncedCount
        `;
        const res = await tx.run(query, { batch: emcees });
        return res.records[0].get('syncedCount').toNumber();
      });

      await invalidateCache();
      revalidatePath('/admin/neo4j');
      return { success: true, count: result };
    } finally {
      await session.close();
    }
  } catch (error: unknown) {
    console.error('Sync error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during sync';
    return { success: false, error: message };
  }
}

export async function updateEmcee(id: string, stage_name: string, hometown: string) {
  if (!id) return { success: false, error: 'ID is required' };
  
  const driver = getNeo4jDriver();
  const session = driver.session();
  
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        MATCH (e:Emcee {id: $id})
        SET e.stage_name = $stage_name, e.hometown = $hometown
        RETURN e
        `,
        { id, stage_name, hometown }
      );
    });
    
    await invalidateCache();
    revalidatePath('/admin');
    return { success: true };
  } catch (error: unknown) {
    console.error('Update error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update Emcee';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}

export async function createEmcee(stage_name: string, hometown: string) {
  const driver = getNeo4jDriver();
  const session = driver.session();
  
  try {
    const id = crypto.randomUUID();
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        CREATE (e:Emcee {id: $id, stage_name: $stage_name, hometown: $hometown})
        RETURN e
        `,
        { id, stage_name, hometown }
      );
    });
    
    await invalidateCache();
    revalidatePath('/admin');
    return { success: true, id };
  } catch (error: unknown) {
    console.error('Create error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create Emcee';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}

export async function syncBattlesFromSupabase() {
  try {
    const battles = await fetchAllSupabaseRecords('battles');

    // Only include 1v1 battles
    const filteredBattles = battles.filter(b => b.match_format === '1v1' || !b.match_format);

    if (!filteredBattles || filteredBattles.length === 0) {
      return { success: true, count: 0 };
    }

    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      await session.executeWrite(async (tx) => {
        // Delete any non-1v1 battles that might already exist in Neo4j
        await tx.run(`
          MATCH (b:Battle) 
          WHERE b.match_format <> '1v1' AND b.match_format IS NOT NULL 
          DETACH DELETE b
        `);
      });

      const result = await session.executeWrite(async (tx) => {
        const query = `
          UNWIND $batch AS row
          MERGE (b:Battle {id: row.id})
          SET b += row
          RETURN count(b) as syncedCount
        `;
        const res = await tx.run(query, { batch: filteredBattles });
        return res.records[0].get('syncedCount').toNumber();
      });

      await invalidateCache();
      revalidatePath('/admin/neo4j/battles');
      return { success: true, count: result };
    } finally {
      await session.close();
    }
  } catch (error: unknown) {
    console.error('Sync error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during sync';
    return { success: false, error: message };
  }
}

export async function updateBattle(id: string, name: string, match_type: string, match_format: string) {
  if (!id) return { success: false, error: 'ID is required' };
  
  const driver = getNeo4jDriver();
  const session = driver.session();
  
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        MATCH (b:Battle {id: $id})
        SET b.name = $name, b.match_type = $match_type, b.match_format = $match_format
        RETURN b
        `,
        { id, name, match_type, match_format }
      );
    });
    
    await invalidateCache();
    revalidatePath('/admin/battles');
    return { success: true };
  } catch (error: unknown) {
    console.error('Update error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update Battle';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}

export async function createBattle(name: string, match_type: string, match_format: string = '1v1') {
  const driver = getNeo4jDriver();
  const session = driver.session();
  
  try {
    const id = crypto.randomUUID();
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        CREATE (b:Battle {id: $id, name: $name, match_type: $match_type, match_format: $match_format})
        RETURN b
        `,
        { id, name, match_type, match_format }
      );
    });
    
    await invalidateCache();
    revalidatePath('/admin/battles');
    return { success: true, id };
  } catch (error: unknown) {
    console.error('Create error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create Battle';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}

export async function syncBattleRelationships() {
  try {
    const participants = await fetchAllSupabaseRecords('battle_participants');

    const battlesMap = new Map<string, Record<string, unknown>[]>();
    for (const p of participants) {
      if (!p.battle_id || !p.emcee_id) continue;
      if (!battlesMap.has(p.battle_id as string)) {
        battlesMap.set(p.battle_id as string, []);
      }
      battlesMap.get(p.battle_id as string)!.push(p);
    }

    const defeatedEdges: Record<string, unknown>[] = [];
    const battledEdges: Record<string, unknown>[] = [];

    for (const [battleId, parts] of battlesMap.entries()) {
      if (parts.length > 2) continue; // Only process 1v1 battles

      const teamA = parts.filter(p => (p.team_side as string)?.toLowerCase() === 'a');
      const teamB = parts.filter(p => (p.team_side as string)?.toLowerCase() === 'b');
      
      let side1 = teamA;
      let side2 = teamB;

      if ((side1.length === 0 || side2.length === 0) && parts.length === 2) {
         side1 = [parts[0]];
         side2 = [parts[1]];
      } else if (side1.length === 0 || side2.length === 0) {
         continue;
      }

      for (const a of side1) {
        for (const b of side2) {
          if (a.is_winner === true && b.is_winner !== true) {
             defeatedEdges.push({ winner_id: a.emcee_id, loser_id: b.emcee_id, battle_id: battleId, outcome: 'DEFEATED' });
          } else if (b.is_winner === true && a.is_winner !== true) {
             defeatedEdges.push({ winner_id: b.emcee_id, loser_id: a.emcee_id, battle_id: battleId, outcome: 'DEFEATED' });
          } else {
             battledEdges.push({ e1: a.emcee_id, e2: b.emcee_id, battle_id: battleId, outcome: 'BATTLED' });
          }
        }
      }
    }

    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      const result = await session.executeWrite(async (tx) => {
        let count = 0;
        
        if (defeatedEdges.length > 0) {
          const res = await tx.run(`
            UNWIND $batch AS row
            MATCH (winner:Emcee {id: row.winner_id})
            MATCH (loser:Emcee {id: row.loser_id})
            MERGE (winner)-[r:DEFEATED {battle_id: row.battle_id}]->(loser)
            RETURN count(r) as c
          `, { batch: defeatedEdges });
          count += res.records[0].get('c').toNumber();
        }

        if (battledEdges.length > 0) {
          const res = await tx.run(`
            UNWIND $batch AS row
            MATCH (e1:Emcee {id: row.e1})
            MATCH (e2:Emcee {id: row.e2})
            MERGE (e1)-[r:BATTLED {battle_id: row.battle_id}]-(e2)
            RETURN count(r) as c
          `, { batch: battledEdges });
          count += res.records[0].get('c').toNumber();
        }

        return count;
      });

      await invalidateCache();
      revalidatePath('/admin/battles');
      return { success: true, count: result };
    } finally {
      await session.close();
    }
  } catch (error: unknown) {
    console.error('Sync error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during sync';
    return { success: false, error: message };
  }
}

export async function updateRelationshipOutcome(e1_id: string, e2_id: string, battle_id: string, newOutcome: 'e1_won' | 'e2_won' | 'draw') {
  const driver = getNeo4jDriver();
  const session = driver.session();
  
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(`
        MATCH (e1:Emcee {id: $e1_id})-[r {battle_id: $battle_id}]-(e2:Emcee {id: $e2_id})
        WHERE type(r) IN ['BATTLED', 'DEFEATED']
        DELETE r
      `, { e1_id, e2_id, battle_id });

      if (newOutcome === 'e1_won') {
        await tx.run(`
          MATCH (winner:Emcee {id: $e1_id})
          MATCH (loser:Emcee {id: $e2_id})
          MERGE (winner)-[:DEFEATED {battle_id: $battle_id}]->(loser)
        `, { e1_id, e2_id, battle_id });
      } else if (newOutcome === 'e2_won') {
        await tx.run(`
          MATCH (winner:Emcee {id: $e2_id})
          MATCH (loser:Emcee {id: $e1_id})
          MERGE (winner)-[:DEFEATED {battle_id: $battle_id}]->(loser)
        `, { e1_id, e2_id, battle_id });
      } else {
        await tx.run(`
          MATCH (e1:Emcee {id: $e1_id})
          MATCH (e2:Emcee {id: $e2_id})
          MERGE (e1)-[:BATTLED {battle_id: $battle_id}]-(e2)
        `, { e1_id, e2_id, battle_id });
      }
    });
    
    await invalidateCache();
    revalidatePath('/admin/battles');
    return { success: true };
  } catch (error: unknown) {
    console.error('Update error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update relationship';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}

export async function createRelationship(e1_id: string, e2_id: string, battle_id: string, outcome: 'e1_won' | 'e2_won' | 'draw') {
  const driver = getNeo4jDriver();
  const session = driver.session();
  
  try {
    await session.executeWrite(async (tx) => {
      if (outcome === 'e1_won') {
        await tx.run(`
          MATCH (winner:Emcee {id: $e1_id})
          MATCH (loser:Emcee {id: $e2_id})
          MERGE (winner)-[:DEFEATED {battle_id: $battle_id}]->(loser)
        `, { e1_id, e2_id, battle_id });
      } else if (outcome === 'e2_won') {
        await tx.run(`
          MATCH (winner:Emcee {id: $e2_id})
          MATCH (loser:Emcee {id: $e1_id})
          MERGE (winner)-[:DEFEATED {battle_id: $battle_id}]->(loser)
        `, { e1_id, e2_id, battle_id });
      } else {
        await tx.run(`
          MATCH (e1:Emcee {id: $e1_id})
          MATCH (e2:Emcee {id: $e2_id})
          MERGE (e1)-[:BATTLED {battle_id: $battle_id}]-(e2)
        `, { e1_id, e2_id, battle_id });
      }
    });
    
    await invalidateCache();
    revalidatePath('/admin/battles');
    return { success: true };
  } catch (error: unknown) {
    console.error('Create error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create relationship';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}

export async function fetchGraphDataForVisualization() {
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
             battleCount
    `);

    const linksRes = await session.run(`
      MATCH (source:Emcee)-[r]->(target:Emcee)
      WHERE type(r) IN ['DEFEATED', 'BATTLED']
      MATCH (b:Battle {id: r.battle_id})
      OPTIONAL MATCH (b)-[:HELD_AT]->(ev:Event)
      RETURN source.id AS source, target.id AS target, type(r) AS type, ev.year AS year, b.match_type AS match_type, b.match_format AS match_format
      UNION
      MATCH (source:Emcee)-[r]-(:Emcee)
      WHERE type(r) IN ['DEFEATED', 'BATTLED']
      MATCH (b:Battle {id: r.battle_id})-[:HELD_AT]->(target:Event)
      RETURN DISTINCT source.id AS source, target.id AS target, 'ATTENDED' AS type, target.year AS year, null AS match_type, null AS match_format
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
        match_format: rec.get('match_format') || null
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

export async function deleteEmcee(id: string) {
  if (!id) return { success: false, error: 'ID is required' };
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(`MATCH (e:Emcee {id: $id}) DETACH DELETE e`, { id });
    });
    await invalidateCache();
    revalidatePath('/admin');
    return { success: true };
  } catch (error: unknown) {
    console.error('Delete error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete Emcee';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}

export async function deleteBattle(id: string) {
  if (!id) return { success: false, error: 'ID is required' };
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      // Delete the battle node
      await tx.run(`MATCH (b:Battle {id: $id}) DETACH DELETE b`, { id });
      // Delete any associated participant relationships referencing this battle_id
      await tx.run(`
        MATCH ()-[r {battle_id: $id}]-()
        WHERE type(r) IN ['BATTLED', 'DEFEATED']
        DELETE r
      `, { id });
    });
    await invalidateCache();
    revalidatePath('/admin/battles');
    return { success: true };
  } catch (error: unknown) {
    console.error('Delete error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete Battle';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}

export async function saveBattleAndResult(
  id: string,
  name: string,
  match_type: string,
  match_format: string,
  e1_id: string | null,
  e2_id: string | null,
  outcome: 'e1_won' | 'e2_won' | 'draw' | null
) {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      // 1. Update/Create the Battle node
      await tx.run(
        `
        MERGE (b:Battle {id: $id})
        SET b.name = $name, b.match_type = $match_type, b.match_format = $match_format
        RETURN b
        `,
        { id, name, match_type, match_format }
      );

      // 2. Delete any existing outcome relationships for this battle_id
      await tx.run(
        `
        MATCH ()-[r {battle_id: $id}]-()
        WHERE type(r) IN ['BATTLED', 'DEFEATED']
        DELETE r
        `,
        { id }
      );

      // 3. Create the new outcome relationship if both emcees are selected
      if (e1_id && e2_id && e1_id !== e2_id && outcome) {
        if (outcome === 'e1_won') {
          await tx.run(
            `
            MATCH (winner:Emcee {id: $e1_id})
            MATCH (loser:Emcee {id: $e2_id})
            MERGE (winner)-[:DEFEATED {battle_id: $id}]->(loser)
            `,
            { e1_id, e2_id, id }
          );
        } else if (outcome === 'e2_won') {
          await tx.run(
            `
            MATCH (winner:Emcee {id: $e2_id})
            MATCH (loser:Emcee {id: $e1_id})
            MERGE (winner)-[:DEFEATED {battle_id: $id}]->(loser)
            `,
            { e1_id, e2_id, id }
          );
        } else {
          await tx.run(
            `
            MATCH (e1:Emcee {id: $e1_id})
            MATCH (e2:Emcee {id: $e2_id})
            MERGE (e1)-[:BATTLED {battle_id: $id}]-(e2)
            `,
            { e1_id, e2_id, id }
          );
        }
      }
    });

    await invalidateCache();
    revalidatePath('/admin/battles');
    return { success: true };
  } catch (error: unknown) {
    console.error('Error saving battle and result:', error);
    const message = error instanceof Error ? error.message : 'Failed to save battle and result';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}



export async function deleteRelationship(e1_id: string, e2_id: string, battle_id: string) {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(`
        MATCH (e1:Emcee {id: $e1_id})-[r {battle_id: $battle_id}]-(e2:Emcee {id: $e2_id})
        DELETE r
      `, { e1_id, e2_id, battle_id });
    });
    await invalidateCache();
    revalidatePath('/admin/battles');
    return { success: true };
  } catch (error: unknown) {
    console.error('Delete error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete relationship';
    return { success: false, error: message };
  } finally {
    await session.close();
  }
}
