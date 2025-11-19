// Supabase Edge Function - Server-side game tick
// Handles all game logic server-side like OpenFront
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

serve(async (req) => {
  try {
    const { gameId } = await req.json()
    
    if (!gameId) {
      return new Response(JSON.stringify({ error: 'gameId required' }), { status: 400 })
    }

    // Get or create game tick tracker
    const { data: tickData } = await supabase
      .from('game_ticks')
      .select('*')
      .eq('game_id', gameId)
      .single()

    let currentTick = 0
    if (tickData) {
      currentTick = tickData.tick_number + 1
      await supabase
        .from('game_ticks')
        .update({ 
          tick_number: currentTick,
          last_tick_at: new Date().toISOString()
        })
        .eq('game_id', gameId)
    } else {
      await supabase
        .from('game_ticks')
        .insert({ game_id: gameId, tick_number: 0 })
    }

    // 1. Generate troops on all owned planets with dynamic troop cap from Colony Stations
    const { data: planets } = await supabase
      .from('systems')
      .select('*')
      .eq('game_id', gameId)

    // 2. Fetch structures early for use in troop generation and combat
    const { data: allStructures } = await supabase
      .from('structures')
      .select('*')
      .eq('game_id', gameId)
      .eq('is_active', true)

    if (planets && allStructures) {
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
          await supabase
            .from('systems')
            .update({ troop_count: newTroops })
            .eq('id', planet.id)
        }
      }
    }

    // 3. Process arriving attacks with advanced combat mechanics
    const now = new Date().toISOString()
    const { data: arrivingAttacks } = await supabase
      .from('planet_attacks')
      .select('*')
      .eq('game_id', gameId)
      .eq('status', 'in_transit')
      .lte('arrival_at', now)

    if (arrivingAttacks) {
      for (const attack of arrivingAttacks) {
        // Get target planet
        const { data: targetPlanet } = await supabase
          .from('systems')
          .select('*')
          .eq('id', attack.target_planet_id)
          .single()

        if (targetPlanet) {
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
              // Mark as retreating and return 80% of troops to source
              const returningTroops = Math.floor(attack.troops * 0.8)
              
              await supabase
                .from('planet_attacks')
                .update({ status: 'retreating' })
                .eq('id', attack.id)
              
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
            
            // Mark attack as arrived
            await supabase
              .from('planet_attacks')
              .update({ status: 'arrived' })
              .eq('id', attack.id)
          }
        }
      }
    }

    // 3. Expand territory (like OpenFront tile growth)
    if (planets) {
      for (const planet of planets) {
        if (!planet.owner_id) continue

        if (currentTick % EXPANSION_INTERVAL_TICKS !== 0) {
          continue
        }

        // Check existing territory only on expansion ticks
        const { data: existingSectors } = await supabase
          .from('territory_sectors')
          .select('*')
          .eq('controlled_by_planet_id', planet.id)

        const sectorCount = existingSectors?.length || 0

        const expansionRadius = Math.sqrt(sectorCount + 1) * SECTOR_SIZE
        if (expansionRadius > MAX_EXPANSION_RADIUS) {
          continue
        }

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

        if (sectorCount > 0 && msSinceOldestCapture < OWNERSHIP_GUARD_DURATION_MS) {
          continue
        }

        // Add new sectors in a sphere around the planet
        const newSectors: TerritorySector[] = []
        const thetaStep = Math.PI / 4
        const phiStep = Math.PI / 3
        const captureTimestamp = new Date().toISOString()

        const candidatePoints: { x: number; y: number; z: number }[] = []

        for (let phi = phiStep; phi < Math.PI; phi += phiStep) {
          const sinPhi = Math.sin(phi)
          const cosPhi = Math.cos(phi)
          for (let theta = 0; theta < 2 * Math.PI; theta += thetaStep) {
            const x = planet.x_pos + expansionRadius * sinPhi * Math.cos(theta)
            const y = planet.y_pos + expansionRadius * cosPhi
            const z = planet.z_pos + expansionRadius * sinPhi * Math.sin(theta)
            candidatePoints.push({ x, y, z })
          }
        }

        candidatePoints.push(
          { x: planet.x_pos, y: planet.y_pos + expansionRadius, z: planet.z_pos },
          { x: planet.x_pos, y: planet.y_pos - expansionRadius, z: planet.z_pos }
        )

        for (const point of candidatePoints) {
          const existsInExisting = existingSectors?.some(s => {
            const dx = s.x_pos - point.x
            const dy = s.y_pos - point.y
            const dz = s.z_pos - point.z
            return Math.sqrt(dx * dx + dy * dy + dz * dz) < SECTOR_SIZE
          })

          if (existsInExisting) {
            continue
          }

          const existsInNew = newSectors.some(s => {
            const dx = s.x_pos - point.x
            const dy = s.y_pos - point.y
            const dz = s.z_pos - point.z
            return Math.sqrt(dx * dx + dy * dy + dz * dz) < SECTOR_SIZE
          })

          if (!existsInNew) {
            newSectors.push({
              x_pos: point.x,
              y_pos: point.y,
              z_pos: point.z,
              owner_id: planet.owner_id,
              controlled_by_planet_id: planet.id,
              captured_at: captureTimestamp
            })
          }
        }

        // Insert new sectors (ignore conflicts)
        if (newSectors.length > 0) {
          await supabase
            .from('territory_sectors')
            .insert(newSectors.map(s => ({ ...s, game_id: gameId })))
            .select()
        }
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
          .select('credits, energy, minerals, research_points')
          .eq('id', gamePlayer.player_id)
          .single()

        if (!player || !ownedPlanets) continue

        // Filter structures owned by this player
        const playerStructures = allStructures?.filter(s => s.owner_id === gamePlayer.player_id) || []

        // Calculate energy: 100 + (ownedPlanets^0.6 * 100)
        let energyIncome = 100 + Math.floor(Math.pow(planetCount, 0.6) * 100)
        
        // Apply energy efficiency (optimal at 42% capacity)
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

        // Calculate research: 1 per 5 owned planets
        const researchIncome = Math.floor(planetCount / 5)

        // Update player resources with caps
        const maxCredits = 1000000
        const maxMinerals = 100000
        const maxResearch = 1000

        const newCredits = Math.min(player.credits + creditsIncome, maxCredits)
        const newEnergy = Math.min(player.energy + energyIncome, maxEnergy)
        const newMinerals = Math.min(player.minerals + mineralsIncome, maxMinerals)
        const newResearch = Math.min(player.research_points + researchIncome, maxResearch)

        await supabase
          .from('players')
          .update({
            credits: newCredits,
            energy: newEnergy,
            minerals: newMinerals,
            research_points: newResearch
          })
          .eq('id', gamePlayer.player_id)
      }
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

    return new Response(
      JSON.stringify({ success: true, tick: currentTick }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
