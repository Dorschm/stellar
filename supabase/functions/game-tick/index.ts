// Supabase Edge Function - Server-side game tick
// Handles all game logic server-side like OpenFront
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TERRITORY_DEBUG = Deno.env.get('TERRITORY_DEBUG') === 'true'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface Planet {
  id: string
  game_id: string
  owner_id: string | null
  x_pos: number
  y_pos: number
  z_pos: number
  troop_count: number
  in_nebula?: boolean
  has_minerals?: boolean
}

interface Vector3D {
  x: number
  y: number
  z: number
}

interface Attack {
  id: string
  target_planet_id: string
  source_planet_id: string
  attacker_id: string
  troops: number
  arrival_at: string
  status?: string
}

interface TerritorySector {
  id?: string
  game_id?: string
  x_pos: number
  y_pos: number
  z_pos: number
  owner_id: string | null
  controlled_by_planet_id: string
  captured_at?: string
}

// Territory expansion rate (sectors per tick)
const TERRITORY_EXPANSION_RATE = 0.1
const MAX_TROOPS = 500
const SECTOR_SIZE = 10 // Size of each territory sector
const MAX_EXPANSION_RADIUS = 200
const EXPANSION_INTERVAL_TICKS = 10
const OWNERSHIP_GUARD_DURATION_MS = 1000
const ENCIRCLEMENT_RADIUS = 50 // Radius to check for encirclement
const RETREAT_THRESHOLD = 0.3 // Retreat if troops < enemy troops * this ratio

// Bot difficulty scaling constants
const BOT_DIFFICULTY_MULTIPLIERS = {
  easy: 0.5,    // 50% efficiency
  normal: 0.75, // 75% efficiency  
  hard: 1.0     // 100% efficiency
}
const BOT_ACTION_INTERVAL = 5 // Bots act every 5 ticks

// Combat multipliers from OpenFront
const COMBAT_MULTIPLIERS = {
  flanking: 1.2,    // 20% bonus
  elevation: 1.1,   // 10% bonus
  nebula: 1.5,      // 50% defense bonus
  asteroid: 1.25    // 25% defense bonus
}

// GameEngine combat functions adapted for Deno
function calculateCombat(
  attackerForce: number,
  defenderForce: number,
  terrain: 'space' | 'nebula' | 'asteroid',
  hasDefenseStation: boolean,
  isFlanking: boolean,
  hasElevationAdvantage: boolean
): { attackerLosses: number; defenderLosses: number; winner: 'attacker' | 'defender' } {
  let attackMultiplier = 1
  let defenseMultiplier = 1
  
  // Apply terrain modifiers
  if (terrain === 'nebula') {
    defenseMultiplier *= COMBAT_MULTIPLIERS.nebula
  } else if (terrain === 'asteroid') {
    defenseMultiplier *= COMBAT_MULTIPLIERS.asteroid
  }
  
  // Apply tactical modifiers
  if (isFlanking) {
    attackMultiplier *= COMBAT_MULTIPLIERS.flanking
  }
  if (hasElevationAdvantage) {
    attackMultiplier *= COMBAT_MULTIPLIERS.elevation
  }
  if (hasDefenseStation) {
    defenseMultiplier *= 5  // Defense stations provide 5x multiplier
  }
  
  const effectiveAttack = attackerForce * attackMultiplier
  const effectiveDefense = defenderForce * defenseMultiplier
  
  // Calculate losses (mirror GameEngine implementation)
  const attackerLosses = Math.floor(effectiveDefense * 0.3)
  const defenderLosses = Math.floor(effectiveAttack * 0.4)
  
  const winner = effectiveAttack > effectiveDefense ? 'attacker' : 'defender'
  
  return { attackerLosses, defenderLosses, winner }
}

function checkFlanking(attackingSystems: Vector3D[], targetSystem: Vector3D): boolean {
  if (attackingSystems.length < 2) return false
  
  // Calculate angles between attacking systems relative to target
  const angles: number[] = []
  for (let i = 0; i < attackingSystems.length; i++) {
    for (let j = i + 1; j < attackingSystems.length; j++) {
      const v1 = {
        x: attackingSystems[i].x - targetSystem.x,
        y: attackingSystems[i].y - targetSystem.y,
        z: attackingSystems[i].z - targetSystem.z
      }
      const v2 = {
        x: attackingSystems[j].x - targetSystem.x,
        y: attackingSystems[j].y - targetSystem.y,
        z: attackingSystems[j].z - targetSystem.z
      }
      
      // Calculate angle between vectors
      const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z
      const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z)
      const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z)
      const angle = Math.acos(dot / (mag1 * mag2)) * (180 / Math.PI)
      
      angles.push(angle)
    }
  }
  
  // Flanking achieved if any angle > 90 degrees
  return angles.some(angle => angle > 90)
}

function checkEncirclement(surroundingSystems: Vector3D[], targetSystem: Vector3D): boolean {
  // Need at least 6 systems for 3D encirclement
  if (surroundingSystems.length < 6) return false
  
  // Check if systems surround target in all 6 directions (simplified)
  const directions = {
    posX: false, negX: false,
    posY: false, negY: false,
    posZ: false, negZ: false
  }
  
  for (const system of surroundingSystems) {
    const dx = system.x - targetSystem.x
    const dy = system.y - targetSystem.y
    const dz = system.z - targetSystem.z
    
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > Math.abs(dz)) {
      if (dx > 0) directions.posX = true
      else directions.negX = true
    } else if (Math.abs(dy) > Math.abs(dz)) {
      if (dy > 0) directions.posY = true
      else directions.negY = true
    } else {
      if (dz > 0) directions.posZ = true
      else directions.negZ = true
    }
  }
  
  // Check if all directions are covered
  return Object.values(directions).every(covered => covered)
}

// Helper function to calculate player statistics for victory checking
// Optimized to accept pre-fetched data to avoid redundant queries
function calculatePlayerStats(
  playerId: string,
  planets: Planet[],
  allSectors: { owner_id: string | null }[],
  allAttacks: { attacker_id: string; troops: number | null }[],
  allCombatLogs: { attacker_id: string; defender_id: string; combat_result: string }[],
  allStructures: { owner_id: string }[]
): {
  planetsControlled: number
  territoryPercentage: number
  troopsSent: number
  planetsCaptured: number
  structuresBuilt: number
  combatWins: number
  combatLosses: number
} {
  // Count planets controlled by player
  const planetsControlled = planets.filter((p: Planet) => p.owner_id === playerId).length

  // Calculate territory percentage from pre-fetched sectors
  const playerSectors = allSectors.filter((s: { owner_id: string | null }) => s.owner_id === playerId)
  const territoryPercentage = allSectors.length > 0
    ? (playerSectors.length / allSectors.length) * 100
    : 0

  // Calculate troops sent from pre-fetched attacks
  const playerAttacks = allAttacks.filter((attack: { attacker_id: string }) => attack.attacker_id === playerId)
  const troopsSent = playerAttacks.reduce((sum: number, attack: { troops: number | null }): number => {
    return sum + (attack.troops || 0)
  }, 0)

  // Count planets captured from pre-fetched combat logs
  const attackerLogs = allCombatLogs.filter((log: { attacker_id: string }) => log.attacker_id === playerId)
  const planetsCaptured = attackerLogs.filter((log: { combat_result: string }) => {
    return log.combat_result === 'attacker_victory'
  }).length
  const combatWins = planetsCaptured

  // Count combat losses from pre-fetched combat logs
  const defenderLogs = allCombatLogs.filter((log: { defender_id: string }) => log.defender_id === playerId)
  const combatLosses = defenderLogs.filter((log: { combat_result: string }) => {
    return log.combat_result === 'attacker_victory'
  }).length

  // Count structures built by player
  const structuresBuilt = allStructures.filter((s: { owner_id: string }) => s.owner_id === playerId).length

  return {
    planetsControlled,
    territoryPercentage,
    troopsSent,
    planetsCaptured,
    structuresBuilt,
    combatWins,
    combatLosses
  }
}

serve(async (req: Request) => {
  // CORS headers constant for consistent response formatting across all paths
  const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  }

  // Enable CORS for client-side invocation from localhost during development and production domains
  // Following the pattern from mark-inactive function for consistency
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    })
  }

  try {
    const { gameId } = await req.json()
    
    console.log(`[TICK] Handler invoked for gameId: ${gameId}`)
    
    if (!gameId) {
      console.error('[TICK] Error: gameId required')
      return new Response(
        JSON.stringify({ error: 'gameId required' }), 
        { 
          status: 400,
          headers: CORS_HEADERS
        }
      )
    }

    // Check if game is already completed - early exit
    const { data: gameData } = await supabase
      .from('games')
      .select('status, started_at')
      .eq('id', gameId)
      .single()

    if (!gameData || gameData.status === 'completed') {
      return new Response(
        JSON.stringify({ success: true, message: 'Game already completed' }),
        { 
          headers: CORS_HEADERS
        }
      )
    }

    // Activity cleanup and abandonment check (runs for both 'waiting' and 'active' games)
    // This ensures waiting lobbies are also auto-closed after 5 minutes of inactivity
    const { data: gamePlayers, error: gamePlayersError } = await supabase
      .from('game_players')
      .select('player_id, placement_order, is_active, last_seen')
      .eq('game_id', gameId)
      .order('placement_order', { ascending: true })

    if (gamePlayersError) {
      console.error('[TICK] Error fetching game players for activity check:', gamePlayersError)
    } else if (gamePlayers && gamePlayers.length > 0) {
      const now = Date.now()
      const sixtySecondsAgo = new Date(now - 60000).toISOString()
      
      // Count active players
      const activePlayersCount = gamePlayers.filter((p: any) => 
        p.is_active === true && p.last_seen && p.last_seen >= sixtySecondsAgo
      ).length

      console.log(`[TICK] Activity check: ${activePlayersCount} active players out of ${gamePlayers.length} (status: ${gameData.status})`)

      // Check if host is inactive (only for active games)
      if (gameData.status === 'active') {
        const host = gamePlayers[0]
        if (host) {
          const hostInactive = (!host.last_seen || host.last_seen < sixtySecondsAgo) && 
                               host.is_active === false

          if (hostInactive) {
            console.log(`[TICK] Host ${host.player_id} is inactive, promoting new host`)
            
            // Find next active player
            const nextActivePlayer = gamePlayers.find((p: any) => 
              p.player_id !== host.player_id && 
              p.is_active === true && 
              p.last_seen && 
              p.last_seen >= sixtySecondsAgo
            )

            if (nextActivePlayer) {
              // Promote new host by reordering placement_order
              const reorderPromises = gamePlayers.map((player: any) => {
                let newOrder: number
                if (player.player_id === nextActivePlayer.player_id) {
                  newOrder = 1 // New host gets order 1
                } else {
                  const currentIndex = gamePlayers.findIndex((p: any) => p.player_id === player.player_id)
                  newOrder = currentIndex < gamePlayers.findIndex((p: any) => p.player_id === nextActivePlayer.player_id)
                    ? currentIndex + 2
                    : currentIndex + 1
                }

                return supabase
                  .from('game_players')
                  .update({ placement_order: newOrder })
                  .eq('game_id', gameId)
                  .eq('player_id', player.player_id)
              })

              await Promise.all(reorderPromises)
              console.log(`[TICK] Promoted ${nextActivePlayer.player_id} to host (was ${host.player_id})`)
            } else {
              console.log(`[TICK] No active players to promote as host`)
            }
          }
        }
      }

      // Check if all players are inactive for > 5 minutes (applies to both waiting and active games)
      if (activePlayersCount === 0) {
        const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString()
        const allInactiveLongEnough = gamePlayers.every((p: any) => 
          !p.last_seen || p.last_seen < fiveMinutesAgo
        )

        if (allInactiveLongEnough) {
          console.log(`[TICK] All players inactive > 5 minutes, closing ${gameData.status} game ${gameId}`)
          
          // Update game status to completed with abandoned victory type
          await supabase
            .from('games')
            .update({ 
              status: 'completed',
              victory_type: 'abandoned',
              ended_at: new Date().toISOString()
            })
            .eq('id', gameId)

          console.log(`[TICK] Game ${gameId} marked as abandoned`)
          
          // Return early - no need to process ticks for abandoned game
          return new Response(
            JSON.stringify({ success: true, message: 'Game abandoned due to inactivity' }),
            { 
              headers: CORS_HEADERS
            }
          )
        }
      }
    }

    // Only process ticks for active games
    if (gameData.status !== 'active') {
      return new Response(
        JSON.stringify({ success: true, message: 'Game not active' }),
        { 
          headers: CORS_HEADERS
        }
      )
    }

    // Get or create game tick tracker with atomic increment
    let currentTick: number
    
    // First try to atomically increment the tick number
    const { data: updatedTick, error: incrementError } = await supabase.rpc('increment_game_tick', {
      p_game_id: gameId,
      p_timestamp: new Date().toISOString()
    })
    
    if (incrementError) {
      // If the increment fails, it might be because the row doesn't exist yet
      if (incrementError.code === 'P0001' && incrementError.message.includes('not found')) {
        console.log('[TICK] Creating initial tick tracker for game')
        const { data: newTick, error: insertError } = await supabase
          .from('game_ticks')
          .insert({ 
            game_id: gameId, 
            tick_number: 0,
            last_tick_at: new Date().toISOString()
          })
          .select('tick_number')
          .single()
        
        if (insertError || !newTick) {
          console.error('[TICK] ERROR: Failed to insert initial tick:', insertError)
          console.error('[TICK] This may indicate an RLS policy issue')
          return new Response(
            JSON.stringify({ error: 'Failed to initialize tick tracker', details: insertError }),
            { 
              status: 500, 
              headers: CORS_HEADERS
            }
          )
        }
        
        // After creating the initial row, try the increment again
        const { data: retryTick, error: retryError } = await supabase.rpc('increment_game_tick', {
          p_game_id: gameId,
          p_timestamp: new Date().toISOString()
        })
        
        if (retryError || !retryTick) {
          console.error('[TICK] ERROR: Failed to increment tick after initialization:', retryError)
          return new Response(
            JSON.stringify({ error: 'Failed to increment tick after initialization', details: retryError }),
            { 
              status: 500, 
              headers: CORS_HEADERS
            }
          )
        }
        
        currentTick = retryTick
      } else {
        // Some other error occurred during increment
        console.error('[TICK] ERROR: Failed to increment tick:', incrementError)
        return new Response(
          JSON.stringify({ error: 'Failed to increment tick', details: incrementError }),
          { 
            status: 500, 
            headers: CORS_HEADERS
          }
        )
      }
    } else if (updatedTick) {
      // Successfully incremented the tick
      currentTick = updatedTick
    } else {
      // Shouldn't happen, but handle it just in case
      console.error('[TICK] ERROR: Increment succeeded but no tick number was returned')
      return new Response(
        JSON.stringify({ error: 'Failed to get updated tick number' }),
        { 
          status: 500, 
          headers: CORS_HEADERS
        }
      )
    }
    
    console.log(`[TICK] Successfully updated tick to ${currentTick} for game ${gameId}`)
    }

    // 1. Generate troops on all owned planets with dynamic troop cap from Colony Stations
    const { data: planets, error: planetsError } = await supabase
      .from('systems')
      .select('*')
      .eq('game_id', gameId)
    
    if (planetsError) {
      console.error('[TICK] Error fetching planets:', planetsError)
    }
    
    console.log(`[TICK] Processing ${planets?.length || 0} planets for troop generation`)
    
    // Pre-generation summary: log player-owned planet counts
    const ownedPlanetsByPlayer = new Map<string, number>()
    planets?.forEach(p => {
      if (p.owner_id) {
        ownedPlanetsByPlayer.set(p.owner_id, (ownedPlanetsByPlayer.get(p.owner_id) || 0) + 1)
      }
    })
    ownedPlanetsByPlayer.forEach((count, playerId) => {
      const playerTroops = planets?.filter(p => p.owner_id === playerId).reduce((sum, p) => sum + (p.troop_count || 0), 0) || 0
      console.log(`[TICK] Troop generation summary: Player ${playerId} owns ${count} planets with ${playerTroops} total troops`)
    })

    // 2. Fetch structures early for use in troop generation and combat
    const { data: allStructures } = await supabase
      .from('structures')
      .select('*')
      .eq('game_id', gameId)
      .eq('is_active', true)

    if (planets && allStructures) {
      let planetsUpdated = 0
      for (const planet of planets) {
        if (!planet.owner_id) continue

        // Calculate dynamic troop cap based on Colony Stations
        const baseMax = MAX_TROOPS
        const colonyStations = allStructures.filter(
          (s: any) => s.system_id === planet.id && s.structure_type === 'colony_station'
        )
        const troopBonus = colonyStations.reduce((sum: number, station: any) => sum + (station.level * 100), 0)
        const effectiveMaxTroops = baseMax + troopBonus

        if (planet.troop_count < effectiveMaxTroops) {
          const base = 10 + Math.pow(planet.troop_count, 0.73) / 4
          const ratio = 1 - (planet.troop_count / effectiveMaxTroops)
          const growth = base * ratio
          const newTroops = Math.min(
            effectiveMaxTroops,
            planet.troop_count + Math.floor(growth)
          )
          
          if (planetsUpdated < 5) {
            console.log(`[TICK] Planet ${planet.id} (Owner: ${planet.owner_id}): ${planet.troop_count} -> ${newTroops} troops (base: ${base.toFixed(2)}, ratio: ${ratio.toFixed(2)}, growth: ${growth.toFixed(2)})`)
          }
          
          await supabase
            .from('systems')
            .update({ troop_count: newTroops })
            .eq('id', planet.id)
          planetsUpdated++
        }
      }
      const totalTroopsAdded = planets.filter(p => p.owner_id).reduce((sum, p) => {
        const base = 10 + Math.pow(p.troop_count, 0.73) / 4
        const effectiveMax = MAX_TROOPS + (allStructures?.filter((s: any) => s.system_id === p.id && s.structure_type === 'colony_station').reduce((s: number, st: any) => s + (st.level * 100), 0) || 0)
        const ratio = 1 - (p.troop_count / effectiveMax)
        return sum + (p.troop_count < effectiveMax ? Math.floor(base * ratio) : 0)
      }, 0)
      console.log(`[TICK] Troop generation complete: +${totalTroopsAdded} troops across ${planetsUpdated} planets`)
    }

    // 3. Process arriving attacks with advanced combat mechanics
    // 
    // OPTIMIZATION TODO: In high-attack scenarios, this section makes repeated queries per attack:
    // - Target planet lookup (one query per attack)
    // - Source planet lookup for retreats (one query per retreat)
    // - Defense platform queries (one query per attack)
    // - Nearby attacker planets for encirclement (one query per attack)
    // 
    // Future optimization strategy:
    // 1. Preload ALL systems for this game_id into memory before the attack loop
    // 2. Create an in-memory Map<planet_id, planet_data> for O(1) lookups
    // 3. Preload ALL structures for this game_id and filter in code by system_id and type
    // 4. Derive target, source, and nearby planets from the preloaded systems map
    // 5. This reduces N attack queries to 2 game-wide queries (systems + structures)
    // 
    // Performance impact: With 50 simultaneous attacks, this would save ~150+ database round-trips
    // Trade-off: Slightly higher memory usage (~1-2MB for typical game) vs massive latency reduction
    // Current implementation is correct and maintainable; optimize when attack volume increases.
    const now = new Date().toISOString()
    const { data: arrivingAttacks, error: attacksError } = await supabase
      .from('planet_attacks')
      .select('*')
      .eq('game_id', gameId)
      .eq('status', 'in_transit')
      .lte('arrival_at', now)
    
    if (attacksError) {
      console.error('[TICK] Error fetching attacks:', attacksError)
    }
    
    console.log(`[TICK] Processing ${arrivingAttacks?.length || 0} arriving attacks at tick ${currentTick}`, {
      now,
      attackIds: arrivingAttacks?.map(a => a.id) || []
    })

    if (arrivingAttacks) {
      for (const attack of arrivingAttacks) {
        // TODO OPTIMIZATION: Replace this per-attack query with lookup from preloaded systems map
        // Get target planet
        const { data: targetPlanet } = await supabase
          .from('systems')
          .select('*')
          .eq('id', attack.target_planet_id)
          .single()

        if (targetPlanet) {
          console.log(`[TICK] Processing attack ${attack.id}:`, {
            attacker: attack.attacker_id,
            source: attack.source_planet_id,
            target: attack.target_planet_id,
            troops: attack.troops,
            targetOwner: targetPlanet.owner_id,
            targetTroops: targetPlanet.troop_count
          })
          
          if (targetPlanet.owner_id === attack.attacker_id) {
            // Friendly - reinforce with dynamic troop cap
            const baseMax = MAX_TROOPS
            const colonyStations = allStructures.filter(
              (s: any) => s.system_id === targetPlanet.id && s.structure_type === 'colony_station'
            )
            const troopBonus = colonyStations.reduce((sum: number, station: any) => sum + (station.level * 100), 0)
            const effectiveMaxTroops = baseMax + troopBonus
            const newTroops = Math.min(effectiveMaxTroops, targetPlanet.troop_count + attack.troops)
            await supabase
              .from('systems')
              .update({ troop_count: newTroops })
              .eq('id', targetPlanet.id)
            
            // Mark attack as arrived
            await supabase
              .from('planet_attacks')
              .update({ status: 'arrived' })
              .eq('id', attack.id)
          } else {
            // Combat with advanced mechanics
            
            // Determine terrain type
            let terrain: 'space' | 'nebula' | 'asteroid' = 'space'
            if (targetPlanet.in_nebula) {
              terrain = 'nebula'
            } else if (targetPlanet.has_minerals) {
              terrain = 'asteroid'
            }
            
            // TODO OPTIMIZATION: Filter defense platforms from preloaded structures array
            // Check for Defense Platform in range (50 units)
            let hasDefenseStation = false
            if (allStructures) {
              const { data: nearbyDefensePlatforms } = await supabase
                .from('structures')
                .select('*, systems!inner(x_pos, y_pos, z_pos)')
                .eq('structure_type', 'defense_platform')
                .eq('is_active', true)
                .eq('owner_id', targetPlanet.owner_id)
                .eq('game_id', gameId)
              
              if (nearbyDefensePlatforms) {
                for (const platform of nearbyDefensePlatforms) {
                  const platSystem = platform.systems
                  if (platSystem && Array.isArray(platSystem) && platSystem.length > 0) {
                    const sys = platSystem[0]
                    const distance = Math.sqrt(
                      Math.pow(sys.x_pos - targetPlanet.x_pos, 2) +
                      Math.pow(sys.y_pos - targetPlanet.y_pos, 2) +
                      Math.pow(sys.z_pos - targetPlanet.z_pos, 2)
                    )
                    if (distance <= 50) {
                      hasDefenseStation = true
                      break
                    }
                  }
                }
              }
            }
            
            // Check for retreat before combat
            const shouldRetreat = attack.troops < targetPlanet.troop_count * RETREAT_THRESHOLD
            if (shouldRetreat) {
              console.log(`[TICK] Attack ${attack.id} retreating: ${attack.troops} troops vs ${targetPlanet.troop_count} defenders (threshold: ${RETREAT_THRESHOLD})`)
              // Mark as retreating and return 80% of troops to source
              const returningTroops = Math.floor(attack.troops * 0.8)
              
              await supabase
                .from('planet_attacks')
                .update({ status: 'retreating' })
                .eq('id', attack.id)
              
              // TODO OPTIMIZATION: Replace with lookup from preloaded systems map
              // Return troops to source planet
              const { data: sourcePlanet } = await supabase
                .from('systems')
                .select('troop_count')
                .eq('id', attack.source_planet_id)
                .single()
              
              if (sourcePlanet) {
                await supabase
                  .from('systems')
                  .update({ 
                    troop_count: Math.min(MAX_TROOPS, sourcePlanet.troop_count + returningTroops) 
                  })
                  .eq('id', attack.source_planet_id)
              }
              
              // Log the retreat
              await supabase
                .from('combat_logs')
                .insert({
                  game_id: gameId,
                  attacker_id: attack.attacker_id,
                  defender_id: targetPlanet.owner_id,
                  system_id: targetPlanet.id,
                  attacker_troops: attack.troops,
                  defender_troops: targetPlanet.troop_count,
                  attacker_losses: attack.troops - returningTroops,
                  defender_losses: 0,
                  attacker_survivors: returningTroops,
                  defender_survivors: targetPlanet.troop_count,
                  winner_id: targetPlanet.owner_id,
                  terrain_type: terrain,
                  had_flanking: false,
                  was_encircled: false,
                  had_defense_station: hasDefenseStation,
                  combat_result: 'retreat'
                })
              
              continue // Skip to next attack
            }
            
            // TODO OPTIMIZATION: Filter attacker's planets from preloaded systems map instead of query
            // Check for encirclement with bounding box optimization
            const boundingBox = ENCIRCLEMENT_RADIUS
            const { data: nearbyAttackerPlanets } = await supabase
              .from('systems')
              .select('x_pos, y_pos, z_pos')
              .eq('game_id', gameId)
              .eq('owner_id', attack.attacker_id)
              .gte('x_pos', targetPlanet.x_pos - boundingBox)
              .lte('x_pos', targetPlanet.x_pos + boundingBox)
              .gte('y_pos', targetPlanet.y_pos - boundingBox)
              .lte('y_pos', targetPlanet.y_pos + boundingBox)
              .gte('z_pos', targetPlanet.z_pos - boundingBox)
              .lte('z_pos', targetPlanet.z_pos + boundingBox)
            
            let isEncircled = false
            if (nearbyAttackerPlanets) {
              // Filter planets within encirclement radius and map to Vector3D objects
              const surroundingSystems = nearbyAttackerPlanets.filter((p: { x_pos: number; y_pos: number; z_pos: number }) => {
                const dist = Math.sqrt(
                  Math.pow(p.x_pos - targetPlanet.x_pos, 2) +
                  Math.pow(p.y_pos - targetPlanet.y_pos, 2) +
                  Math.pow(p.z_pos - targetPlanet.z_pos, 2)
                )
                return dist <= ENCIRCLEMENT_RADIUS
              }).map((p: { x_pos: number; y_pos: number; z_pos: number }) => ({ x: p.x_pos, y: p.y_pos, z: p.z_pos }))
              
              isEncircled = checkEncirclement(
                surroundingSystems,
                { x: targetPlanet.x_pos, y: targetPlanet.y_pos, z: targetPlanet.z_pos }
              )
            }
            
            if (isEncircled) {
              // Instant surrender - planet captured with all attacking troops
              await supabase
                .from('systems')
                .update({
                  owner_id: attack.attacker_id,
                  troop_count: attack.troops
                })
                .eq('id', targetPlanet.id)
              
              // Update territory ownership
              await supabase
                .from('territory_sectors')
                .update({ 
                  owner_id: attack.attacker_id,
                  captured_at: new Date().toISOString()
                })
                .eq('controlled_by_planet_id', targetPlanet.id)
              
              // Log the encirclement
              await supabase
                .from('combat_logs')
                .insert({
                  game_id: gameId,
                  attacker_id: attack.attacker_id,
                  defender_id: targetPlanet.owner_id,
                  system_id: targetPlanet.id,
                  attacker_troops: attack.troops,
                  defender_troops: targetPlanet.troop_count,
                  attacker_losses: 0,
                  defender_losses: targetPlanet.troop_count,
                  attacker_survivors: attack.troops,
                  defender_survivors: 0,
                  winner_id: attack.attacker_id,
                  terrain_type: terrain,
                  had_flanking: false,
                  was_encircled: true,
                  had_defense_station: hasDefenseStation,
                  combat_result: 'attacker_victory'
                })
              
              // Mark attack as arrived
              await supabase
                .from('planet_attacks')
                .update({ status: 'arrived' })
                .eq('id', attack.id)
              
              continue // Skip to next attack
            }
            
            // Check for flanking
            const { data: otherAttacks } = await supabase
              .from('planet_attacks')
              .select('source_planet_id')
              .eq('game_id', gameId)
              .eq('target_planet_id', attack.target_planet_id)
              .eq('attacker_id', attack.attacker_id)
              .eq('status', 'in_transit')
              .lte('arrival_at', now)
              .neq('id', attack.id)
            
            let hasFlanking = false
            if (otherAttacks && otherAttacks.length > 0) {
              // Get source positions for flanking check
              const sourceIds = [
                attack.source_planet_id,
                ...otherAttacks.map((a: { source_planet_id: string }) => a.source_planet_id)
              ]
              const { data: sourcePlanets } = await supabase
                .from('systems')
                .select('x_pos, y_pos, z_pos')
                .in('id', sourceIds)
              
              if (sourcePlanets && sourcePlanets.length >= 2) {
                const sourceVectors = sourcePlanets.map((planet: { x_pos: number; y_pos: number; z_pos: number }) => ({
                  x: planet.x_pos,
                  y: planet.y_pos,
                  z: planet.z_pos
                }))
                
                hasFlanking = checkFlanking(
                  sourceVectors,
                  { x: targetPlanet.x_pos, y: targetPlanet.y_pos, z: targetPlanet.z_pos }
                )
              }
            }
            
            // Calculate elevation advantage (simplified: based on Y-position difference)
            const { data: sourcePlanet } = await supabase
              .from('systems')
              .select('y_pos')
              .eq('id', attack.source_planet_id)
              .single()
            
            const hasElevationAdvantage = sourcePlanet && (sourcePlanet.y_pos > targetPlanet.y_pos + 10)
            
            // Apply combat formula with Defense Platform check
            const combatResult = calculateCombat(
              attack.troops,
              targetPlanet.troop_count,
              terrain,
              hasDefenseStation,
              hasFlanking,
              hasElevationAdvantage
            )
            
            const attackerSurvivors = Math.max(0, attack.troops - combatResult.attackerLosses)
            const defenderSurvivors = Math.max(0, targetPlanet.troop_count - combatResult.defenderLosses)
            
            if (combatResult.winner === 'attacker') {
              // Attacker captures planet
              await supabase
                .from('systems')
                .update({
                  owner_id: attack.attacker_id,
                  troop_count: attackerSurvivors
                })
                .eq('id', targetPlanet.id)
              
              // Update territory ownership
              await supabase
                .from('territory_sectors')
                .update({ 
                  owner_id: attack.attacker_id,
                  captured_at: new Date().toISOString()
                })
                .eq('controlled_by_planet_id', targetPlanet.id)
            } else {
              // Defender holds
              await supabase
                .from('systems')
                .update({ troop_count: defenderSurvivors })
                .eq('id', targetPlanet.id)
            }
            
            // Log the combat
            await supabase
              .from('combat_logs')
              .insert({
                game_id: gameId,
                attacker_id: attack.attacker_id,
                defender_id: targetPlanet.owner_id,
                system_id: targetPlanet.id,
                attacker_troops: attack.troops,
                defender_troops: targetPlanet.troop_count,
                attacker_losses: combatResult.attackerLosses,
                defender_losses: combatResult.defenderLosses,
                attacker_survivors: attackerSurvivors,
                defender_survivors: defenderSurvivors,
                winner_id: combatResult.winner === 'attacker' ? attack.attacker_id : targetPlanet.owner_id,
                terrain_type: terrain,
                had_flanking: hasFlanking,
                was_encircled: false,
                had_defense_station: hasDefenseStation,
                combat_result: combatResult.winner === 'attacker' ? 'attacker_victory' : 'defender_victory'
              })
            
            console.log(`[TICK] Combat resolved:`, {
              attackId: attack.id,
              winner: combatResult.winner,
              attackerSurvivors,
              defenderSurvivors,
              terrain,
              hasFlanking,
              hasDefenseStation
            })
            
            // Mark attack as arrived
            await supabase
              .from('planet_attacks')
              .update({ status: 'arrived' })
              .eq('id', attack.id)
          }
        }
      }
    }

    // 3. Expand territory (OpenFront-style progressive natural growth)
    let sectorsCreated = 0
    if (planets) {
      // Optimization: Query all sectors for the game once and group by planet
      const { data: allSectors, error: sectorsError } = await supabase
        .from('territory_sectors')
        .select('*')
        .eq('game_id', gameId)
      
      if (sectorsError) {
        console.error('[TICK] Error fetching territory sectors:', sectorsError)
      }
      
      console.log(`[TICK] Processing territory expansion for ${allSectors?.length || 0} existing sectors`)
      
      // Group sectors by planet ID for efficient lookup
      const sectorsByPlanet = new Map<string, any[]>()
      if (allSectors) {
        for (const sector of allSectors) {
          if (!sector.controlled_by_planet_id) continue
          const planetId = sector.controlled_by_planet_id
          if (!sectorsByPlanet.has(planetId)) {
            sectorsByPlanet.set(planetId, [])
          }
          sectorsByPlanet.get(planetId)!.push(sector)
        }
      }
      
      for (const planet of planets) {
        if (!planet.owner_id) continue

        // Get existing territory from in-memory map
        const existingSectors = sectorsByPlanet.get(planet.id) || []
        const sectorCount = existingSectors.length

        // Calculate ownership duration in ticks
        const nowMs = Date.now()
        let oldestCaptureMs = Infinity
        if (existingSectors && existingSectors.length > 0) {
          for (const sector of existingSectors) {
            if (!sector.captured_at) continue
            const capturedAtMs = new Date(sector.captured_at).getTime()
            if (!Number.isNaN(capturedAtMs)) {
              oldestCaptureMs = Math.min(oldestCaptureMs, capturedAtMs)
            }
          }
        }

        const msSinceOldestCapture = oldestCaptureMs === Infinity
          ? Infinity
          : nowMs - oldestCaptureMs
        
        const ownershipDurationTicks = msSinceOldestCapture === Infinity
          ? 0
          : Math.floor(msSinceOldestCapture / 100)

        if (TERRITORY_DEBUG) {
          console.log('[EXPANSION] Checking planet', planet.id, 'owned by', planet.owner_id, 'for', ownershipDurationTicks, 'ticks')
        }

        // Prevent expansion during guard period after capture
        if (sectorCount > 0 && msSinceOldestCapture < OWNERSHIP_GUARD_DURATION_MS) {
          if (TERRITORY_DEBUG) {
            console.log('[EXPANSION] Skipping planet', planet.id, 'due to guard period:', msSinceOldestCapture, 'ms <', OWNERSHIP_GUARD_DURATION_MS)
          }
          continue
        }

        // Determine expansion tier based on ownership duration
        let tier = 1
        let expansionRadius = 20
        let sectorsPerWave = 8
        if (ownershipDurationTicks > 150) {
          tier = 3
          expansionRadius = 50
          sectorsPerWave = 24
        } else if (ownershipDurationTicks > 50) {
          tier = 2
          expansionRadius = 35
          sectorsPerWave = 16
        }

        // Check max expansion radius
        const currentRadius = Math.sqrt(sectorCount + 1) * SECTOR_SIZE
        if (currentRadius > MAX_EXPANSION_RADIUS) {
          if (TERRITORY_DEBUG) {
            console.log('[EXPANSION] Skipping planet', planet.id, 'reached max radius:', currentRadius, '>', MAX_EXPANSION_RADIUS)
          }
          continue
        }

        if (TERRITORY_DEBUG) {
          console.log('[EXPANSION] Planet', planet.id, 'tier', tier, 'radius', expansionRadius, 'sectors/wave', sectorsPerWave)
        }

        // Calculate expansion rate modifiers
        let expansionInterval = EXPANSION_INTERVAL_TICKS
        if (planet.troop_count && planet.troop_count > 300) {
          expansionInterval = 8  // Faster with high troops
        }
        if (planet.in_nebula) {
          expansionInterval = 15  // Slower in nebula
        }
        if (planet.has_minerals) {
          expansionInterval = 7  // Faster on mineral-rich planets
        }

        // Check if it's time to expand for this planet
        if (currentTick % expansionInterval !== 0) {
          if (TERRITORY_DEBUG) {
            console.log('[EXPANSION] Skipping planet', planet.id, 'wrong tick interval:', currentTick, '%', expansionInterval, '!=', 0)
          }
          continue
        }

        // Get current max wave number for edge-based expansion
        const maxWave = existingSectors.reduce((max: number, s: any) => 
          Math.max(max, s.expansion_wave || 0), 0)

        // Find edge sectors (frontier) for natural expansion
        let edgeSectors = existingSectors.filter((s: any) => 
          (s.expansion_wave || 0) === maxWave)
        
        // If no edge sectors or first expansion, use planet center
        if (edgeSectors.length === 0) {
          edgeSectors = [{
            x_pos: planet.x_pos,
            y_pos: planet.y_pos,
            z_pos: planet.z_pos
          }] as any
        }

        // Generate new sectors from edge frontier
        const newSectors: any[] = []
        const captureTimestamp = new Date().toISOString()
        const newWave = maxWave + 1

        // Expand from each edge sector
        for (const edgeSector of edgeSectors) {
          if (newSectors.length >= sectorsPerWave) break

          // Generate candidate positions around this edge sector
          const thetaStep = (2 * Math.PI) / 8
          const distance = SECTOR_SIZE * 1.5

          for (let theta = 0; theta < 2 * Math.PI; theta += thetaStep) {
            if (newSectors.length >= sectorsPerWave) break

            const x = edgeSector.x_pos + distance * Math.cos(theta)
            const y = edgeSector.y_pos
            const z = edgeSector.z_pos + distance * Math.sin(theta)

            // Calculate distance from planet center
            const dx = x - planet.x_pos
            const dy = y - planet.y_pos
            const dz = z - planet.z_pos
            const distFromPlanet = Math.sqrt(dx*dx + dy*dy + dz*dz)

            // Check if within expansion radius
            if (distFromPlanet > expansionRadius) continue

            // Check sector density to prevent overcrowding
            const nearbyCount = existingSectors.filter((s: any) => {
              const sdx = s.x_pos - x
              const sdy = s.y_pos - y
              const sdz = s.z_pos - z
              return Math.sqrt(sdx*sdx + sdy*sdy + sdz*sdz) < 30
            }).length

            if (nearbyCount > 15) continue

            // Check if sector already exists
            const existsInExisting = existingSectors.some((s: any) => {
              const sdx = s.x_pos - x
              const sdy = s.y_pos - y
              const sdz = s.z_pos - z
              return Math.sqrt(sdx*sdx + sdy*sdy + sdz*sdz) < SECTOR_SIZE
            })

            if (existsInExisting) continue

            const existsInNew = newSectors.some((s: any) => {
              const sdx = s.x_pos - x
              const sdy = s.y_pos - y
              const sdz = s.z_pos - z
              return Math.sqrt(sdx*sdx + sdy*sdy + sdz*sdz) < SECTOR_SIZE
            })

            if (!existsInNew) {
              newSectors.push({
                x_pos: x,
                y_pos: y,
                z_pos: z,
                owner_id: planet.owner_id,
                controlled_by_planet_id: planet.id,
                captured_at: captureTimestamp,
                expansion_tier: tier,
                expansion_wave: newWave,
                distance_from_planet: distFromPlanet
              })
            }
          }
        }

        // Insert new sectors
        if (newSectors.length > 0) {
          if (TERRITORY_DEBUG) {
            console.log('[EXPANSION] Attempting to create', newSectors.length, 'sectors for planet', planet.id, 'wave', newWave)
          }
          const { error: insertError } = await supabase
            .from('territory_sectors')
            .insert(newSectors.map((s: any) => ({ ...s, game_id: gameId })))
            .select()
          
          if (insertError) {
            console.error('[EXPANSION] Error inserting territory sectors for planet', planet.id, ':', insertError)
          } else {
            sectorsCreated += newSectors.length
            if (TERRITORY_DEBUG) {
              console.log('[EXPANSION] Successfully created', newSectors.length, 'sectors for planet', planet.id)
            }
          }
        } else {
          if (TERRITORY_DEBUG) {
            console.log('[EXPANSION] No new sectors generated for planet', planet.id, '(density check or radius limit)')
          }
        }
      }
    }

    console.log('[EXPANSION] Created', sectorsCreated, 'new sectors this tick')

    // 3.5 Victory & Elimination Checks
    // Check victory conditions and eliminate players with no planets
    const totalPlanets = planets?.length || 0
    // Load all game participants (not filtered by is_alive) to ensure eliminated players get final stats
    const { data: allActivePlayers } = await supabase
      .from('game_players')
      .select('player_id, is_eliminated, is_alive')
      .eq('game_id', gameId)

    if (allActivePlayers && planets) {
      // Fetch all territory sectors once before the loop
      const { data: allSectorsForGame } = await supabase
        .from('territory_sectors')
        .select('id, owner_id')
        .eq('game_id', gameId)
      
      const totalSectorCount = allSectorsForGame?.length || 0
      
      // Group sectors by owner_id for efficient lookup
      const sectorsByOwner = new Map<string, number>()
      if (allSectorsForGame) {
        for (const sector of allSectorsForGame) {
          if (sector.owner_id) {
            sectorsByOwner.set(sector.owner_id, (sectorsByOwner.get(sector.owner_id) || 0) + 1)
          }
        }
      }
      
      // Track if we found a winner
      let winnerId: string | null = null
      let winningPercentage = 0
      let victoryType: 'territory_control' | 'planet_control' | null = null
      let bestScore = 0

      for (const gamePlayer of allActivePlayers) {
        const playerId = gamePlayer.player_id
        
        // Count planets owned by this player
        const playerPlanets = planets.filter((p: Planet) => p.owner_id === playerId)
        const planetCount = playerPlanets.length

        // Calculate territory percentage from pre-fetched data
        const playerSectorCount = sectorsByOwner.get(playerId) || 0
        const territoryPercentage = totalSectorCount > 0
          ? (playerSectorCount / totalSectorCount) * 100
          : 0

        const planetPercentage = totalPlanets > 0 ? (planetCount / totalPlanets) * 100 : 0

        // Check for elimination (0 planets)
        if (planetCount === 0 && !gamePlayer.is_eliminated) {
          await supabase
            .from('game_players')
            .update({
              is_eliminated: true,
              eliminated_at: new Date().toISOString()
            })
            .eq('game_id', gameId)
            .eq('player_id', playerId)

          console.log(`Player ${playerId} eliminated at tick ${currentTick}`)
        }

        // Check for victory (>=80% planets or territory)
        if (planetPercentage >= 80 || territoryPercentage >= 80) {
          const candidateScore = Math.max(planetPercentage, territoryPercentage)
          // Only update winner if this candidate has a strictly higher score or winnerId is still null
          if (candidateScore > bestScore || winnerId === null) {
            winnerId = playerId
            bestScore = candidateScore
            // Determine which threshold was reached and set victory type accordingly
            if (planetPercentage >= 80 && territoryPercentage >= 80) {
              // Both thresholds met - use whichever is higher
              victoryType = planetPercentage >= territoryPercentage ? 'planet_control' : 'territory_control'
              winningPercentage = Math.max(planetPercentage, territoryPercentage)
            } else if (planetPercentage >= 80) {
              victoryType = 'planet_control'
              winningPercentage = planetPercentage
            } else {
              victoryType = 'territory_control'
              winningPercentage = territoryPercentage
            }
          }
        }
      }

      // If we have a winner, end the game
      if (winnerId) {
        console.log(`Player ${winnerId} wins at tick ${currentTick} with ${winningPercentage.toFixed(1)}% control`)

        // Calculate game duration
        const startedAt = gameData.started_at ? new Date(gameData.started_at) : new Date()
        const gameDurationSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000)

        // Fetch all necessary data once for stats calculation
        const { data: allSectors } = await supabase
          .from('territory_sectors')
          .select('owner_id')
          .eq('game_id', gameId)
        
        const { data: allAttacks } = await supabase
          .from('planet_attacks')
          .select('attacker_id, troops')
          .eq('game_id', gameId)
        
        const { data: allCombatLogs } = await supabase
          .from('combat_logs')
          .select('attacker_id, defender_id, combat_result, attacker_losses, defender_losses')
          .eq('game_id', gameId)

        // Calculate final stats for all players
        const playerStats = []
        const playerTerritoryPercentages: { playerId: string, percentage: number }[] = []

        for (const gamePlayer of allActivePlayers) {
          const stats = calculatePlayerStats(
            gamePlayer.player_id,
            planets,
            allSectors || [],
            allAttacks || [],
            allCombatLogs || [],
            allStructures || []
          )
          
          // Calculate troops lost from combat logs
          const playerId = gamePlayer.player_id
          let totalTroopsLost = 0
          let planetsLost = 0
          
          if (allCombatLogs) {
            for (const log of allCombatLogs) {
              // Sum attacker losses when player was attacker
              if (log.attacker_id === playerId) {
                totalTroopsLost += log.attacker_losses || 0
              }
              // Sum defender losses when player was defender
              if (log.defender_id === playerId) {
                totalTroopsLost += log.defender_losses || 0
                // Count planets lost (defender losses where attacker won)
                if (log.combat_result === 'attacker_victory') {
                  planetsLost++
                }
              }
            }
          }
          
          playerStats.push({
            game_id: gameId,
            player_id: gamePlayer.player_id,
            final_planets_controlled: stats.planetsControlled,
            final_territory_percentage: stats.territoryPercentage,
            total_troops_sent: stats.troopsSent,
            total_troops_lost: totalTroopsLost,
            planets_captured: stats.planetsCaptured,
            planets_lost: planetsLost,
            structures_built: stats.structuresBuilt,
            total_combat_wins: stats.combatWins,
            total_combat_losses: stats.combatLosses,
            peak_territory_percentage: stats.territoryPercentage // Using final as peak for now
          })

          playerTerritoryPercentages.push({
            playerId: gamePlayer.player_id,
            percentage: stats.territoryPercentage
          })
        }

        // Sort players by territory percentage to determine placement
        playerTerritoryPercentages.sort((a, b) => b.percentage - a.percentage)

        // Update game status to completed
        await supabase
          .from('games')
          .update({
            status: 'completed',
            winner_id: winnerId,
            victory_type: victoryType || 'territory_control', // Use computed victory type
            ended_at: new Date().toISOString(),
            game_duration_seconds: gameDurationSeconds
          })
          .eq('id', gameId)

        // Insert game stats for all players
        if (playerStats.length > 0) {
          await supabase
            .from('game_stats')
            .insert(playerStats)
        }

        // Update game_players with final stats and placement
        for (let i = 0; i < playerTerritoryPercentages.length; i++) {
          const { playerId, percentage } = playerTerritoryPercentages[i]
          const stats = playerStats.find(s => s.player_id === playerId)
          
          await supabase
            .from('game_players')
            .update({
              final_territory_percentage: percentage,
              final_placement: i + 1,
              total_troops_sent: stats?.total_troops_sent || 0,
              planets_captured: stats?.planets_captured || 0
            })
            .eq('game_id', gameId)
            .eq('player_id', playerId)
        }

        // Stop processing - game is complete
        return new Response(
          JSON.stringify({ 
            success: true, 
            tick: currentTick,
            gameComplete: true,
            winner: winnerId,
            winningPercentage
          }),
          { 
            headers: CORS_HEADERS
          }
        )
      }
    }

    // 4. Comprehensive resource generation with structures
    const { data: players } = await supabase
      .from('game_players')
      .select('player_id')
      .eq('game_id', gameId)

    if (players) {
      // Use allStructures fetched earlier
      for (const gamePlayer of players) {
        // Fetch owned planets
        const { data: ownedPlanets } = await supabase
          .from('systems')
          .select('*')
          .eq('game_id', gameId)
          .eq('owner_id', gamePlayer.player_id)

        const planetCount = ownedPlanets?.length || 0

        // Fetch player current resources
        const { data: player } = await supabase
          .from('players')
          .select('credits, energy, minerals')
          .eq('id', gamePlayer.player_id)
          .single()

        if (!player || !ownedPlanets) continue

        // Filter structures owned by this player
        const playerStructures = allStructures?.filter(s => s.owner_id === gamePlayer.player_id) || []

        // Calculate energy: 100 + (ownedPlanets^0.6 * 100)
        let energyIncome = 100 + Math.floor(Math.pow(planetCount, 0.6) * 100)
        
        // Apply energy efficiency (optimal at 42% capacity)
        // NOTE: This formula must stay in sync with ResourceSystem.calculateEnergyEfficiency()
        // from src/game/ResourceSystem.ts (lines 105-120). Any changes to the efficiency
        // calculation should be made in both locations to ensure consistent behavior between
        // server-side tick processing and client-side resource calculations.
        const maxEnergy = 100000
        const currentRatio = player.energy / maxEnergy
        const optimalRatio = 0.42
        let efficiency = 1.0
        if (currentRatio <= optimalRatio) {
          efficiency = 0.5 + (currentRatio / optimalRatio) * 0.5
        } else {
          const excess = currentRatio - optimalRatio
          const penalty = excess / (1 - optimalRatio)
          efficiency = 1.0 - (penalty * 0.5)
        }
        energyIncome = Math.floor(energyIncome * efficiency)

        // Calculate credits: 10 per planet base
        let creditsIncome = planetCount * 10

        // Add trade income from Trade Stations
        const tradeStations = playerStructures.filter(s => s.structure_type === 'trade_station')
        for (const station of tradeStations) {
          const stationSystem = ownedPlanets.find(p => p.id === station.system_id)
          if (stationSystem) {
            // Calculate distance-based bonuses between connected owned planets within 100 units
            for (const otherPlanet of ownedPlanets) {
              if (otherPlanet.id === stationSystem.id) continue
              const distance = Math.sqrt(
                Math.pow(otherPlanet.x_pos - stationSystem.x_pos, 2) +
                Math.pow(otherPlanet.y_pos - stationSystem.y_pos, 2) +
                Math.pow(otherPlanet.z_pos - stationSystem.z_pos, 2)
              )
              if (distance <= 100) {
                creditsIncome += 10
              }
            }
          }
        }

        // Calculate minerals: 50 per Mining Station on mineral-rich planets
        let mineralsIncome = 0
        const miningStations = playerStructures.filter(s => s.structure_type === 'mining_station')
        for (const station of miningStations) {
          const stationSystem = ownedPlanets.find(p => p.id === station.system_id)
          if (stationSystem && stationSystem.has_minerals) {
            mineralsIncome += 50
          }
        }

        // Update player resources with caps
        const maxCredits = 1000000
        const maxMinerals = 100000

        const newCredits = Math.min(player.credits + creditsIncome, maxCredits)
        const newEnergy = Math.min(player.energy + energyIncome, maxEnergy)
        const newMinerals = Math.min(player.minerals + mineralsIncome, maxMinerals)

        console.log(`[TICK] Player ${gamePlayer.player_id}: Credits +${creditsIncome} (${player.credits} -> ${newCredits}), Energy +${energyIncome} (${player.energy} -> ${newEnergy}), Minerals +${mineralsIncome} (${player.minerals} -> ${newMinerals})`)

        await supabase
          .from('players')
          .update({
            credits: newCredits,
            energy: newEnergy,
            minerals: newMinerals
          })
          .eq('id', gamePlayer.player_id)
      }
      console.log(`[TICK] Resource generation complete for ${players.length} players`)
    }

    // 5. Bot AI with sophisticated decision-making
    const { data: botPlayers } = await supabase
      .from('players')
      .select('id, bot_difficulty')
      .eq('is_bot', true)

    if (botPlayers && currentTick % BOT_ACTION_INTERVAL === 0) {
      for (const bot of botPlayers) {
        // Stagger bot actions to avoid simultaneous execution
        if ((currentTick + bot.id.charCodeAt(0)) % BOT_ACTION_INTERVAL !== 0) continue;
        
        // Apply difficulty scaling
        const efficiencyMultiplier = BOT_DIFFICULTY_MULTIPLIERS[bot.bot_difficulty as keyof typeof BOT_DIFFICULTY_MULTIPLIERS] || 0.75
        
        // Fetch bot context in batch for efficiency
        const { data: botPlanets } = await supabase
          .from('systems')
          .select('*')
          .eq('game_id', gameId)
          .eq('owner_id', bot.id)
        
        const { data: botResources } = await supabase
          .from('players')
          .select('credits, energy, minerals')
          .eq('id', bot.id)
          .single()
        
        if (!botPlanets || botPlanets.length === 0 || !botResources) continue;
        
        // Track credits in a local mutable variable to avoid stale data in multiple builds
        let availableCredits = botResources.credits
        
        // Find nearby systems within 150 units for strategic decisions
        // Calculate bounding box from bot's planets to reduce SQL result set
        const proximityRadius = 150
        let minX = botPlanets[0].x_pos
        let maxX = botPlanets[0].x_pos
        let minY = botPlanets[0].y_pos
        let maxY = botPlanets[0].y_pos
        let minZ = botPlanets[0].z_pos
        let maxZ = botPlanets[0].z_pos
        
        for (const planet of botPlanets) {
          minX = Math.min(minX, planet.x_pos)
          maxX = Math.max(maxX, planet.x_pos)
          minY = Math.min(minY, planet.y_pos)
          maxY = Math.max(maxY, planet.y_pos)
          minZ = Math.min(minZ, planet.z_pos)
          maxZ = Math.max(maxZ, planet.z_pos)
        }
        
        // Apply bounding box with proximity margin to SQL query
        const { data: nearbySystems } = await supabase
          .from('systems')
          .select('*')
          .eq('game_id', gameId)
          .neq('owner_id', bot.id)
          .gte('x_pos', minX - proximityRadius)
          .lte('x_pos', maxX + proximityRadius)
          .gte('y_pos', minY - proximityRadius)
          .lte('y_pos', maxY + proximityRadius)
          .gte('z_pos', minZ - proximityRadius)
          .lte('z_pos', maxZ + proximityRadius)
        
        if (!nearbySystems) continue;
        
        // Apply precise 3D distance check to ensure only systems within 150 units of at least one bot planet
        const nearbyTargets = nearbySystems.filter(target => {
          return botPlanets.some(source => {
            const distance = Math.sqrt(
              Math.pow(target.x_pos - source.x_pos, 2) +
              Math.pow(target.y_pos - source.y_pos, 2) +
              Math.pow(target.z_pos - source.z_pos, 2)
            )
            return distance <= proximityRadius
          })
        })
        
        let actionTaken = false
        
        // Priority 1: Resource Management - Build structures
        if (!actionTaken && availableCredits >= 50000 * efficiencyMultiplier) {
          const buildThreshold = Math.random() < efficiencyMultiplier // Easy bots build less frequently
          
          if (buildThreshold) {
            // Try to build Mining Station on mineral-rich planet
            const mineralPlanet = botPlanets.find(p => p.has_minerals)
            if (mineralPlanet && availableCredits >= 50000) {
              const { data: existingStructures } = await supabase
                .from('structures')
                .select('id')
                .eq('system_id', mineralPlanet.id)
                .eq('structure_type', 'mining_station')
              
              if (!existingStructures || existingStructures.length === 0) {
                await supabase.from('structures').insert({
                  game_id: gameId,
                  owner_id: bot.id,
                  system_id: mineralPlanet.id,
                  structure_type: 'mining_station',
                  level: 1,
                  is_active: true
                })
                
                availableCredits -= 50000
                
                await supabase.from('players').update({
                  credits: availableCredits
                }).eq('id', bot.id)
                
                console.log(`Bot ${bot.id} (${bot.bot_difficulty}): Built Mining Station`)
                actionTaken = true
              }
            }
            
            // Try to build Colony Station for troop cap
            if (!actionTaken && botPlanets.length > 0 && availableCredits >= 50000) {
              const targetPlanet = botPlanets[Math.floor(Math.random() * botPlanets.length)]
              
              const { data: existingStructures } = await supabase
                .from('structures')
                .select('id')
                .eq('system_id', targetPlanet.id)
                .eq('structure_type', 'colony_station')
              
              if (!existingStructures || existingStructures.length === 0) {
                await supabase.from('structures').insert({
                  game_id: gameId,
                  owner_id: bot.id,
                  system_id: targetPlanet.id,
                  structure_type: 'colony_station',
                  level: 1,
                  is_active: true
                })
                
                availableCredits -= 50000
                
                await supabase.from('players').update({
                  credits: availableCredits
                }).eq('id', bot.id)
                
                console.log(`Bot ${bot.id} (${bot.bot_difficulty}): Built Colony Station`)
                actionTaken = true
              }
            }
          }
        }
        
        // Priority 2: Encirclement Opportunities
        if (!actionTaken && nearbyTargets.length > 0) {
          for (const target of nearbyTargets) {
            if (target.owner_id === null) continue; // Skip neutral planets
            
            // Check if enemy planet is nearly encircled (bot owns 4+ of 6 directional neighbors)
            const { data: enemyNeighbors } = await supabase
              .from('systems')
              .select('id, owner_id, x_pos, y_pos, z_pos')
              .eq('game_id', gameId)
              .neq('id', target.id)
            
            if (enemyNeighbors) {
              const directions = { posX: false, negX: false, posY: false, negY: false, posZ: false, negZ: false }
              
              for (const neighbor of enemyNeighbors) {
                const dx = neighbor.x_pos - target.x_pos
                const dy = neighbor.y_pos - target.y_pos
                const dz = neighbor.z_pos - target.z_pos
                
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > Math.abs(dz)) {
                  if (dx > 0 && neighbor.owner_id === bot.id) directions.posX = true
                  else if (dx < 0 && neighbor.owner_id === bot.id) directions.negX = true
                } else if (Math.abs(dy) > Math.abs(dz)) {
                  if (dy > 0 && neighbor.owner_id === bot.id) directions.posY = true
                  else if (dy < 0 && neighbor.owner_id === bot.id) directions.negY = true
                } else {
                  if (dz > 0 && neighbor.owner_id === bot.id) directions.posZ = true
                  else if (dz < 0 && neighbor.owner_id === bot.id) directions.negZ = true
                }
              }
              
              const botControlledDirections = Object.values(directions).filter(Boolean).length
              if (botControlledDirections >= 4) {
                // Find nearest bot planet to attack from
                let nearestSource = botPlanets[0]
                let minDistance = Number.MAX_VALUE
                
                for (const source of botPlanets) {
                  const distance = Math.sqrt(
                    Math.pow(target.x_pos - source.x_pos, 2) +
                    Math.pow(target.y_pos - source.y_pos, 2) +
                    Math.pow(target.z_pos - source.z_pos, 2)
                  )
                  if (distance < minDistance && source.troop_count > 50) {
                    minDistance = distance
                    nearestSource = source
                  }
                }
                
                if (nearestSource.troop_count > 50) {
                  const troopsToSend = Math.floor(nearestSource.troop_count * 0.7 * efficiencyMultiplier)
                  
                  // Skip if troopsToSend is invalid or would make source negative
                  if (troopsToSend > 0 && nearestSource.troop_count - troopsToSend >= 0) {
                    const travelTime = Math.ceil(minDistance / 2) * 100
                    
                    await supabase.from('planet_attacks').insert({
                      game_id: gameId,
                      attacker_id: bot.id,
                      source_planet_id: nearestSource.id,
                      target_planet_id: target.id,
                      troops: troopsToSend,
                      arrival_at: new Date(Date.now() + travelTime).toISOString()
                    })
                    
                    await supabase.from('systems').update({
                      troop_count: nearestSource.troop_count - troopsToSend
                    }).eq('id', nearestSource.id)
                    
                    console.log(`Bot ${bot.id} (${bot.bot_difficulty}): Attacked encircled enemy with ${troopsToSend} troops`)
                    actionTaken = true
                    break
                  }
                }
              }
            }
          }
        }
        
        // Priority 3: Weak Neutral Expansion
        if (!actionTaken && nearbyTargets.length > 0) {
          const neutralPlanets = nearbyTargets.filter(p => p.owner_id === null)
          
          if (neutralPlanets.length > 0) {
            // Sort by troop count ascending (prefer weakest)
            neutralPlanets.sort((a, b) => a.troop_count - b.troop_count)
            
            for (const target of neutralPlanets) {
              // Find bot planet with sufficient troops
              for (const source of botPlanets) {
                const distance = Math.sqrt(
                  Math.pow(target.x_pos - source.x_pos, 2) +
                  Math.pow(target.y_pos - source.y_pos, 2) +
                  Math.pow(target.z_pos - source.z_pos, 2)
                )
                
                if (distance <= 100 && source.troop_count > target.troop_count * 1.5) {
                  const troopsToSend = Math.floor(source.troop_count * 0.6 * efficiencyMultiplier)
                  
                  // Validate troop count before sending
                  if (troopsToSend <= 0 || source.troop_count - troopsToSend < 0) {
                    console.log(`Bot ${bot.id}: Skipped neutral expansion - invalid troops (${troopsToSend})`)
                    continue
                  }
                  
                  const travelTime = Math.ceil(distance / 2) * 100
                  
                  await supabase.from('planet_attacks').insert({
                    game_id: gameId,
                    attacker_id: bot.id,
                    source_planet_id: source.id,
                    target_planet_id: target.id,
                    troops: troopsToSend,
                    arrival_at: new Date(Date.now() + travelTime).toISOString()
                  })
                  
                  await supabase.from('systems').update({
                    troop_count: source.troop_count - troopsToSend
                  }).eq('id', source.id)
                  
                  console.log(`Bot ${bot.id} (${bot.bot_difficulty}): Expanded to neutral with ${troopsToSend} troops`)
                  actionTaken = true
                  break
                }
              }
              if (actionTaken) break
            }
          }
        }
        
        // Priority 4: Opportunistic Enemy Attacks
        if (!actionTaken && nearbyTargets.length > 0) {
          const enemyPlanets = nearbyTargets.filter(p => p.owner_id !== null)
          
          if (enemyPlanets.length > 0) {
            // Prefer enemies with valuable resources
            enemyPlanets.sort((a, b) => {
              const aValue = (a.has_minerals ? 1 : 0) - (a.in_nebula ? 1 : 0)
              const bValue = (b.has_minerals ? 1 : 0) - (b.in_nebula ? 1 : 0)
              return bValue - aValue
            })
            
            for (const target of enemyPlanets) {
              for (const source of botPlanets) {
                const distance = Math.sqrt(
                  Math.pow(target.x_pos - source.x_pos, 2) +
                  Math.pow(target.y_pos - source.y_pos, 2) +
                  Math.pow(target.z_pos - source.z_pos, 2)
                )
                
                // Handle zero-target troops as maximum advantage without NaN risks
                const strengthRatio = target.troop_count > 0 ? source.troop_count / target.troop_count : Infinity
                const requiredRatio = 1.5 / efficiencyMultiplier
                
                if (distance <= 150 && strengthRatio > requiredRatio && source.troop_count > 50) {
                  const troopsToSend = Math.floor(source.troop_count * 0.5 * efficiencyMultiplier)
                  
                  // Validate troop count before sending
                  if (troopsToSend <= 0 || source.troop_count - troopsToSend < 0) {
                    console.log(`Bot ${bot.id}: Skipped enemy attack - invalid troops (${troopsToSend})`)
                    continue
                  }
                  
                  const travelTime = Math.ceil(distance / 2) * 100
                  
                  await supabase.from('planet_attacks').insert({
                    game_id: gameId,
                    attacker_id: bot.id,
                    source_planet_id: source.id,
                    target_planet_id: target.id,
                    troops: troopsToSend,
                    arrival_at: new Date(Date.now() + travelTime).toISOString()
                  })
                  
                  await supabase.from('systems').update({
                    troop_count: source.troop_count - troopsToSend
                  }).eq('id', source.id)
                  
                  console.log(`Bot ${bot.id} (${bot.bot_difficulty}): Attacked enemy with ${troopsToSend} troops`)
                  actionTaken = true
                  break
                }
              }
              if (actionTaken) break
            }
          }
        }
        
        // Priority 5: Reinforcement
        if (!actionTaken && botPlanets.length > 1) {
          // Find weakest and strongest planets
          let weakestPlanet = botPlanets[0]
          let strongestPlanet = botPlanets[0]
          
          for (const planet of botPlanets) {
            if (planet.troop_count < weakestPlanet.troop_count) {
              weakestPlanet = planet
            }
            if (planet.troop_count > strongestPlanet.troop_count) {
              strongestPlanet = planet
            }
          }
          
          if (strongestPlanet.troop_count > 100 && strongestPlanet.id !== weakestPlanet.id) {
            const troopsToSend = Math.floor(strongestPlanet.troop_count * 0.3 * efficiencyMultiplier)
            
            // Validate troop count before sending reinforcement
            if (troopsToSend > 0 && strongestPlanet.troop_count - troopsToSend >= 0) {
              const distance = Math.sqrt(
                Math.pow(weakestPlanet.x_pos - strongestPlanet.x_pos, 2) +
                Math.pow(weakestPlanet.y_pos - strongestPlanet.y_pos, 2) +
                Math.pow(weakestPlanet.z_pos - strongestPlanet.z_pos, 2)
              )
              const travelTime = Math.ceil(distance / 2) * 100
              
              await supabase.from('planet_attacks').insert({
              game_id: gameId,
              attacker_id: bot.id,
              source_planet_id: strongestPlanet.id,
              target_planet_id: weakestPlanet.id,
              troops: troopsToSend,
              arrival_at: new Date(Date.now() + travelTime).toISOString()
            })
            
              await supabase.from('systems').update({
                troop_count: strongestPlanet.troop_count - troopsToSend
              }).eq('id', strongestPlanet.id)
              
              console.log(`Bot ${bot.id} (${bot.bot_difficulty}): Reinforced weakest planet with ${troopsToSend} troops`)
            } else {
              console.log(`Bot ${bot.id}: Skipped reinforcement - invalid troops (${troopsToSend})`)
            }
          }
        }
      }
    }

    console.log(`[TICK] Tick ${currentTick} completed successfully`)
    console.log(`[TICK] Created ${sectorsCreated} new territory sectors`)
    
    // Victory Condition Checking and Game Completion Logic
    try {
      console.log('[VICTORY] Checking victory conditions...')
      
      // Re-fetch current game data to ensure we have latest state
      const { data: currentGameData } = await supabase
        .from('games')
        .select('status, started_at')
        .eq('id', gameId)
        .single()
      
      // Only check victory if game is still active
      if (currentGameData?.status !== 'active') {
        console.log('[VICTORY] Game is not active, skipping victory check')
      } else {
        // Elimination Policy:
        // - Players are eliminated when they have 0 planets AND the game has progressed past the grace period (30 seconds)
        // - Grace period prevents eliminating players during initial spawn/setup phase and transient zero-planet states
        // - Time-based guard ensures elimination only after meaningful gameplay, not during lobby or early spawns
        // - Elimination sets both is_eliminated=true and is_alive=false for consistent defeat behavior
        // - Only process elimination for players who are still alive (is_alive=true)
        if (allActivePlayers && planets) {
          const GRACE_PERIOD_MS = 30000 // 30 seconds grace period for spawn/setup
          
          // Calculate game age for grace period check
          const gameAgeMs = Date.now() - new Date(currentGameData.started_at).getTime()
          
          for (const gamePlayer of allActivePlayers) {
            const playerId = gamePlayer.player_id
            
            // Skip players who are already not alive (already eliminated or never spawned)
            if (!gamePlayer.is_alive) continue
            
            const playerPlanets = planets.filter((p: Planet) => p.owner_id === playerId)
            const planetCount = playerPlanets.length
            
            // Only consider elimination if player currently has 0 planets and not already eliminated
            if (planetCount === 0 && !gamePlayer.is_eliminated && gameAgeMs > GRACE_PERIOD_MS) {
              await supabase
                .from('game_players')
                .update({
                  is_eliminated: true,
                  is_alive: false, // Set canonical alive flag for defeat screen
                  eliminated_at: new Date().toISOString()
                })
                .eq('game_id', gameId)
                .eq('player_id', playerId)
              
              console.log(`[ELIMINATION] Player ${playerId} eliminated after ${gameAgeMs}ms (planets: ${planetCount})`)
            }
          }
        }
        
        // Fetch all territory sectors for victory calculation
        const { data: allSectorsForGame } = await supabase
          .from('territory_sectors')
          .select('id, owner_id')
          .eq('game_id', gameId)
        
        // Group sectors by owner_id for efficient lookup
        const sectorsByOwner = new Map<string, number>()
        if (allSectorsForGame) {
          for (const sector of allSectorsForGame) {
            if (sector.owner_id) {
              sectorsByOwner.set(sector.owner_id, (sectorsByOwner.get(sector.owner_id) || 0) + 1)
            }
          }
        }
        
        // Calculate victory percentages for each player
        const totalPlanets = planets?.length || 0
        const totalSectorCount = allSectorsForGame?.length || 0
        
        let winnerId: string | null = null
        let winningPercentage = 0
        let victoryType: 'territory_control' | 'planet_control' = 'territory_control'
        
        if (allActivePlayers && planets && totalPlanets > 0) {
          for (const gamePlayer of allActivePlayers) {
            const playerId = gamePlayer.player_id
            
            // Count planets owned by this player
            const playerPlanets = planets.filter((p: Planet) => p.owner_id === playerId)
            const planetCount = playerPlanets.length
            
            // Calculate percentages
            const playerSectorCount = sectorsByOwner.get(playerId) || 0
            const territoryPercentage = totalSectorCount > 0
              ? (playerSectorCount / totalSectorCount) * 100
              : 0
            const planetPercentage = totalPlanets > 0 ? (planetCount / totalPlanets) * 100 : 0
            
            console.log(`[VICTORY] Player ${playerId}: ${planetPercentage.toFixed(1)}% planets, ${territoryPercentage.toFixed(1)}% territory`)
            
            // Check for victory (>=80% planets or territory)
            if (planetPercentage >= 80 || territoryPercentage >= 80) {
              // Calculate candidate's qualifying percentage and victory type
              let candidatePct: number
              let candidateVictoryType: 'territory_control' | 'planet_control'
              
              if (planetPercentage >= 80 && territoryPercentage >= 80) {
                // Both thresholds met - use whichever is higher
                candidatePct = Math.max(planetPercentage, territoryPercentage)
                candidateVictoryType = planetPercentage >= territoryPercentage ? 'planet_control' : 'territory_control'
              } else if (planetPercentage >= 80) {
                candidatePct = planetPercentage
                candidateVictoryType = 'planet_control'
              } else {
                candidatePct = territoryPercentage
                candidateVictoryType = 'territory_control'
              }
              
              // Only update winner if no winner yet OR this player has a strictly higher percentage
              // This ensures that if multiple players qualify in the same tick,
              // the one with the highest control percentage wins deterministically
              if (winnerId === null || candidatePct > winningPercentage) {
                winnerId = playerId
                winningPercentage = candidatePct
                victoryType = candidateVictoryType
                console.log(`[VICTORY] Updated winner to ${playerId} with ${candidatePct.toFixed(1)}% ${candidateVictoryType}`)
              } else {
                console.log(`[VICTORY] ${playerId} ${candidatePct.toFixed(1)}% skipped (lower than ${winningPercentage.toFixed(1)}%)`)
              }
            }
          }
        }
        
        // If we have a winner, complete the game
        // Concurrency Protection Strategy:
        // 1. Guarded Games Update: Use WHERE status='active' as primary lock (only one tick succeeds)
        // 2. Idempotent Stats Insertion: upsert with ON CONFLICT to prevent duplicates
        // 3. Safe Player Updates: Defensive checks before updating game_players
        // 4. Error Handling: Wrap in try-catch to prevent state corruption on failure
        // This ensures atomic game completion even with concurrent tick executions
        if (winnerId) {
          try {
            console.log(`[VICTORY] Marking game as completed, winner: ${winnerId}`)
            
            // Calculate game duration
            const startedAt = currentGameData.started_at ? new Date(currentGameData.started_at) : new Date()
            const gameDurationSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000)
            
            // Fetch all necessary data for stats calculation (reuse existing data where possible)
            const { data: allAttacksForStats } = await supabase
              .from('planet_attacks')
              .select('attacker_id, troops')
              .eq('game_id', gameId)
            
            const { data: allCombatLogsForStats } = await supabase
              .from('combat_logs')
              .select('attacker_id, defender_id, combat_result')
              .eq('game_id', gameId)
            
            const { data: allStructuresForStats } = await supabase
              .from('structures')
              .select('owner_id')
              .eq('game_id', gameId)
            
            // STEP 1: Guarded Games Update (Primary Lock)
            // Use WHERE status='active' to ensure only one tick succeeds in transitioning to completed
            // This is the critical concurrency guard using Supabase's optimistic locking
            const { data: updatedGame, error: updateError, count } = await supabase
              .from('games')
              .update({
                status: 'completed',
                winner_id: winnerId,
                victory_type: victoryType,
                game_duration_seconds: gameDurationSeconds,
                ended_at: new Date().toISOString()
              })
              .eq('id', gameId)
              .eq('status', 'active') // Concurrency guard: only update if still active
              .select('status')
              .single()
            
            // Check if update failed or another tick already completed the game
            if (updateError || !updatedGame || updatedGame.status !== 'completed') {
              console.log(`[VICTORY] Race condition: Game ${gameId} already completed by another tick`)
              return new Response(
                JSON.stringify({ success: true, skipped: true }),
                { headers: CORS_HEADERS }
              )
            }
            
            console.log(`[VICTORY] Game ${gameId} completed by tick ${currentTick}, winner ${winnerId}`)
            
            // STEP 2: Calculate and insert final stats for all players (idempotent)
            if (allActivePlayers && planets && allSectorsForGame && allAttacksForStats && allCombatLogsForStats && allStructuresForStats) {
              const statsToInsert: any[] = []
              const playerUpdates: any[] = []
              
              // Sort players by territory percentage for placement ranking
              const playerRankings = allActivePlayers
                .map(gamePlayer => {
                  const stats = calculatePlayerStats(
                    gamePlayer.player_id,
                    planets,
                    allSectorsForGame,
                    allAttacksForStats,
                    allCombatLogsForStats,
                    allStructuresForStats
                  )
                  return { playerId: gamePlayer.player_id, territoryPercentage: stats.territoryPercentage }
                })
                .sort((a, b) => b.territoryPercentage - a.territoryPercentage)
              
              // Calculate stats for each player
              for (let index = 0; index < allActivePlayers.length; index++) {
                const gamePlayer = allActivePlayers[index]
                const playerId = gamePlayer.player_id
                
                const stats = calculatePlayerStats(
                  playerId,
                  planets,
                  allSectorsForGame,
                  allAttacksForStats,
                  allCombatLogsForStats,
                  allStructuresForStats
                )
                
                // Determine final placement (1-indexed)
                const placement = playerRankings.findIndex(p => p.playerId === playerId) + 1
                
                // Prepare stats record (for game_stats table)
                statsToInsert.push({
                  game_id: gameId,
                  player_id: playerId,
                  final_planets_controlled: stats.planetsControlled,
                  final_territory_percentage: stats.territoryPercentage,
                  total_troops_sent: stats.troopsSent,
                  total_troops_lost: 0, // Not tracked in current schema
                  planets_captured: stats.planetsCaptured,
                  planets_lost: stats.combatLosses,
                  structures_built: stats.structuresBuilt,
                  total_combat_wins: stats.combatWins,
                  total_combat_losses: stats.combatLosses,
                  peak_territory_percentage: stats.territoryPercentage
                  // Note: final_placement is stored in game_players, not game_stats
                })
                
                // Prepare game_players update
                playerUpdates.push({
                  game_id: gameId,
                  player_id: playerId,
                  final_territory_percentage: stats.territoryPercentage,
                  total_troops_sent: stats.troopsSent,
                  planets_captured: stats.planetsCaptured,
                  final_placement: placement
                })
              }
              
              // Insert all stats with ON CONFLICT DO NOTHING for idempotency
              // Use upsert with ignoreDuplicates to handle concurrent tick attempts
              const { error: statsInsertError } = await supabase
                .from('game_stats')
                .upsert(statsToInsert, { 
                  onConflict: 'game_id,player_id',
                  ignoreDuplicates: true 
                })
              
              if (statsInsertError) {
                console.error('[VICTORY] Error inserting game stats:', statsInsertError)
              } else {
                console.log(`[VICTORY] Inserted/updated stats for ${statsToInsert.length} players`)
              }
              
              // STEP 3: Safe Player Updates
              // Defensive check: ensure game is still marked as completed before updating players
              if (updatedGame.status !== 'completed') {
                console.log('[VICTORY] Game status changed unexpectedly, skipping player updates')
                return
              }
              
              // Update game_players with final stats (batch update)
              for (const update of playerUpdates) {
                await supabase
                  .from('game_players')
                  .update({
                    final_territory_percentage: update.final_territory_percentage,
                    total_troops_sent: update.total_troops_sent,
                    planets_captured: update.planets_captured,
                    final_placement: update.final_placement
                  })
                  .eq('game_id', update.game_id)
                  .eq('player_id', update.player_id)
              }
              
              console.log('[VICTORY] Updated game_players with final stats')
            }
            
            console.log(`[VICTORY] Game ${gameId} completion processing finished successfully`)
          } catch (completionError) {
            console.error(`[VICTORY] Completion failed for game ${gameId}:`, completionError)
            // Continue tick without ending game - let next tick retry if needed
            // This ensures a single failure doesn't corrupt game state
          }
        }
      }
    } catch (victoryError) {
      console.error('[VICTORY] Error checking victory conditions:', victoryError)
      // Don't fail the entire tick if victory checking fails
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        tick: currentTick,
        stats: {
          planetsProcessed: planets?.length || 0,
          attacksProcessed: arrivingAttacks?.length || 0,
          sectorsCreated: sectorsCreated
        }
      }),
      { 
        headers: CORS_HEADERS
      }
    )
  } catch (error: unknown) {
    console.error('[TICK] Fatal error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage, details: error }),
      { 
        status: 500, 
        headers: CORS_HEADERS
      }
    )
  }
})
