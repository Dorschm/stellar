import { create } from 'zustand'
import type { System, Player, Game, TerritorySector, CombatLog, Structure } from '../services/supabase'
import { supabase } from '../services/supabase'
import { ResourceSystem } from '../game/ResourceSystem'

// Read-only game state - all logic happens server-side in Supabase
// Client just displays the current state from the database

interface Resources {
  gold: bigint // Main resource like OpenFront (maps to credits)
  energy: number
  minerals: number
  research: number
}

export type StructureType = 'shipyard' | 'defense_station' | 'trade_port' | 'research_lab'

// Planet = OpenFront "Tile" - has troops, owner, generates resources
export interface Planet extends System {
  troops: number // Current troops on planet
  maxTroops: number // Max troops planet can hold
  troopGenRate: number // Troops generated per tick
}

// Attack = Troops moving from one planet to another (OpenFront style)
export interface Attack {
  id: string
  attackerId: string // Player ID
  sourcePlanetId: string
  targetPlanetId: string
  troops: number
  startTick: number
  arrivalTick: number
  retreating: boolean
}

type CommandMode =
  | { type: 'send_troops'; sourcePlanetId: string }
  | { type: 'build_structure'; planetId: string }
  | null

interface GameState {
  // Read-only game state from Supabase
  currentGame: Game | null
  player: Player | null
  systems: System[]
  planets: Planet[]
  attacks: Attack[]
  territorySectors: TerritorySector[]
  structures: Structure[]
  playerColors: Map<string, string>
  territoryStats: Map<string, { sectorCount: number; percentage: number }>
  resources: Resources
  currentTick: number
  combatLogs: CombatLog[]
  recentCombatLog: CombatLog | null
  
  // UI state (client-side only)
  cameraPosition: { x: number; y: number; z: number }
  selectedPlanet: Planet | null
  selectedAttack: Attack | null
  commandMode: CommandMode
  
  // Setters for syncing with Supabase
  setGame: (game: Game) => void
  setPlayer: (player: Player) => void
  setPlanets: (systems: System[]) => void
  setAttacks: (attacks: Attack[]) => void
  setTerritorySectors: (sectors: TerritorySector[]) => void
  setStructures: (structures: Structure[]) => void
  setPlayerColors: (colors: Map<string, string>) => void
  setTerritoryStats: (stats: Map<string, { sectorCount: number; percentage: number }>) => void
  updateResources: (resources: Partial<Resources>) => void
  setCurrentTick: (tick: number) => void
  setCombatLogs: (logs: CombatLog[]) => void
  setRecentCombatLog: (log: CombatLog | null) => void
  
  // Economic system actions
  buildStructure: (systemId: string, structureType: string) => Promise<boolean>
  
  // UI actions
  selectPlanet: (planet: Planet | null) => void
  selectAttack: (attack: Attack | null) => void
  setCameraPosition: (position: { x: number; y: number; z: number }) => void
  setCommandMode: (mode: CommandMode) => void
  
  // Server action requests (send to Supabase)
  requestSendTroops: (sourcePlanetId: string, targetPlanetId: string, troopCount: number) => Promise<void>
}

// Convert System to Planet with troop data
const systemToPlanet = (system: System): Planet => ({
  ...system,
  troops: typeof system.troop_count === 'number'
    ? system.troop_count
    : system.owner_id
    ? 100
    : 50,
  maxTroops: 500,
  troopGenRate: 5 // 5 troops per tick
})

export const useGameStore = create<GameState>((set, get) => ({
  // Read-only state from Supabase
  currentGame: null,
  player: null,
  systems: [],
  planets: [],
  attacks: [],
  territorySectors: [],
  structures: [],
  playerColors: new Map(),
  territoryStats: new Map(),
  resources: {
    gold: BigInt(0),
    energy: 0,
    minerals: 0,
    research: 0
  },
  currentTick: 0,
  combatLogs: [],
  recentCombatLog: null,
  cameraPosition: { x: 0, y: 50, z: 100 },
  selectedPlanet: null,
  selectedAttack: null,
  commandMode: null,
  
  // Setters for syncing with Supabase
  setGame: (game) => set({ currentGame: game }),
  setPlayer: (player) => set((state) => ({
    player,
    resources: player ? {
      gold: BigInt(player.credits || 0),
      energy: player.energy || 0,
      minerals: player.minerals || 0,
      research: player.research_points || 0
    } : state.resources
  })),
  setPlanets: (systems) => set((state) => {
    const nextPlanets = systems.map(systemToPlanet)
    const nextSelected = state.selectedPlanet
      ? nextPlanets.find(p => p.id === state.selectedPlanet?.id) || null
      : null
    return { systems, planets: nextPlanets, selectedPlanet: nextSelected }
  }),
  setAttacks: (attacks) => set({ attacks }),
  setTerritorySectors: (sectors) => set({ territorySectors: sectors }),
  setStructures: (structures) => set({ structures }),
  setPlayerColors: (colors) => set({ playerColors: colors }),
  setTerritoryStats: (stats) => set({ territoryStats: stats }),
  updateResources: (resources) => set((state) => ({
    resources: { ...state.resources, ...resources }
  })),
  setCurrentTick: (tick) => set({ currentTick: tick }),
  setCombatLogs: (logs) => set({ combatLogs: logs }),
  setRecentCombatLog: (log) => set({ recentCombatLog: log }),
  
  // UI actions
  selectPlanet: (planet) => set({ selectedPlanet: planet }),
  selectAttack: (attack) => set({ selectedAttack: attack }),
  setCameraPosition: (position) => set({ cameraPosition: position }),
  setCommandMode: (mode) => set({ commandMode: mode }),
  
  // Server action - send attack request to Supabase
  requestSendTroops: async (sourcePlanetId, targetPlanetId, troopCount) => {
    const state = get()
    const source = state.planets.find(p => p.id === sourcePlanetId)
    const target = state.planets.find(p => p.id === targetPlanetId)
    
    if (!source || !target || !state.player || !state.currentGame) return
    if (source.owner_id !== state.player.id) return
    if (source.troops < troopCount) return
    
    // Calculate travel time
    const dx = target.x_pos - source.x_pos
    const dy = target.y_pos - source.y_pos  
    const dz = target.z_pos - source.z_pos
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const travelMs = Math.ceil(distance / 2) * 100 // milliseconds
    
    // Create attack in Supabase
    await supabase.from('planet_attacks').insert({
      game_id: state.currentGame.id,
      attacker_id: state.player.id,
      source_planet_id: sourcePlanetId,
      target_planet_id: targetPlanetId,
      troops: troopCount,
      arrival_at: new Date(Date.now() + travelMs).toISOString()
    })
    
    // Deduct troops immediately (server will verify)
    await supabase
      .from('systems')
      .update({ troop_count: source.troops - troopCount })
      .eq('id', sourcePlanetId)
    
    // Clear command mode
    set({ commandMode: null })
  },
  
  // Build a structure on a system
  buildStructure: async (systemId: string, structureType: string) => {
    const state = get()
    const { player, currentGame, systems } = state
    
    if (!player || !currentGame) return false
    
    // Check if player owns the system
    const system = systems.find(s => s.id === systemId)
    if (!system || system.owner_id !== player.id) return false
    
    // Map structure type to cost key
    const costMap: Record<string, keyof typeof ResourceSystem.COSTS> = {
      'trade-station': 'BUILD_STRUCTURE_TRADE',
      'mining-station': 'BUILD_STRUCTURE_MINING',
      'colony-station': 'BUILD_STRUCTURE_COLONY',
      'defense-platform': 'BUILD_STRUCTURE_DEFENSE',
      'missile-battery': 'BUILD_STRUCTURE_MISSILE',
      'point-defense': 'BUILD_STRUCTURE_POINT_DEFENSE'
    }
    
    const costKey = costMap[structureType]
    if (!costKey) return false
    
    const cost = ResourceSystem.COSTS[costKey]
    
    // Check affordability
    const canAfford = 
      Number(state.resources.gold) >= (cost.credits || 0) &&
      state.resources.energy >= (cost.energy || 0) &&
      state.resources.minerals >= (cost.minerals || 0)
    
    if (!canAfford) return false
    
    try {
      // Deduct resources
      const { error: updateError } = await supabase
        .from('players')
        .update({
          credits: player.credits - (cost.credits || 0),
          energy: player.energy - (cost.energy || 0),
          minerals: player.minerals - (cost.minerals || 0)
        })
        .eq('id', player.id)
      
      if (updateError) {
        console.error('Failed to deduct resources:', updateError)
        return false
      }
      
      // Map structure type to database enum
      const typeMap: Record<string, string> = {
        'trade-station': 'trade_station',
        'mining-station': 'mining_station',
        'colony-station': 'colony_station',
        'defense-platform': 'defense_platform',
        'missile-battery': 'missile_battery',
        'point-defense': 'point_defense'
      }
      
      // Insert structure
      const { error: insertError } = await supabase
        .from('structures')
        .insert({
          game_id: currentGame.id,
          system_id: systemId,
          owner_id: player.id,
          structure_type: typeMap[structureType]
        })
      
      if (insertError) {
        console.error('Failed to create structure:', insertError)
        return false
      }
      
      // Update local state
      const { data: updatedPlayer } = await supabase
        .from('players')
        .select('*')
        .eq('id', player.id)
        .single()
      
      if (updatedPlayer) {
        set((state) => ({
          player: updatedPlayer,
          resources: {
            gold: BigInt(updatedPlayer.credits || 0),
            energy: updatedPlayer.energy || 0,
            minerals: updatedPlayer.minerals || 0,
            research: updatedPlayer.research_points || 0
          }
        }))
      }
      
      return true
    } catch (error) {
      console.error('Error building structure:', error)
      return false
    }
  }
}))
