import { create } from 'zustand'
import type { System, Player, Game, TerritorySector, CombatLog, Structure, GameStats, GamePlayer } from '../services/supabase'
import { supabase } from '../services/supabase'
import { ResourceSystem, type StructureCostKey } from '../game/ResourceSystem'

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
  playerGameData: GamePlayer | null
  systems: System[]
  planets: Planet[]
  attacks: Attack[]
  territorySectors: TerritorySector[]
  structures: Structure[]
  gameStats: GameStats[]
  winnerPlayer: Player | null
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
  territoryDebugMode: boolean
  
  // Setters for syncing with Supabase
  setGame: (game: Game) => void
  setPlayer: (player: Player) => void
  setPlayerGameData: (data: GamePlayer) => void
  setSystems: (systems: System[]) => void
  setPlanets: (systems: System[]) => void
  setAttacks: (attacks: Attack[]) => void
  setTerritorySectors: (sectors: TerritorySector[]) => void
  setStructures: (structures: Structure[]) => void
  setGameStats: (stats: GameStats[]) => void
  setWinnerPlayer: (player: Player | null) => void
  fetchGameStats: (gameId: string) => Promise<void>
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
  setTerritoryDebugMode: (enabled: boolean) => void
  
  // Server action requests (send to Supabase)
  requestSendTroops: (sourcePlanetId: string, targetPlanetId: string, troopCount: number) => Promise<void>
  
  // Reset all game state
  resetGameState: () => void
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

export const useGameStore = create<GameState>()((set, get) => ({
  // Initial state from Supabase
  currentGame: null,
  player: null,
  playerGameData: null,
  systems: [],
  planets: [],
  attacks: [],
  territorySectors: [],
  structures: [],
  gameStats: [],
  winnerPlayer: null,
  playerColors: new Map(),
  territoryStats: new Map(),
  resources: {
    gold: BigInt(0),
    energy: 0,
    minerals: 0,
    research: 0,
  },
  currentTick: 0,
  combatLogs: [],
  recentCombatLog: null,
  cameraPosition: { x: 0, y: 50, z: 100 },
  selectedPlanet: null,
  selectedAttack: null,
  commandMode: null,
  territoryDebugMode: false,
  
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
  setSystems: (systems) => set({ systems }),
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
  setGameStats: (stats) => set({ gameStats: stats }),
  setWinnerPlayer: (player) => set({ winnerPlayer: player }),
  fetchGameStats: async (gameId) => {
    try {
      // Fetch game stats for all players
      const { data: statsData, error: statsError } = await supabase
        .from('game_stats')
        .select('*')
        .eq('game_id', gameId)
      
      if (statsError) throw statsError
      
      // Fetch game winner info
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('winner_id, victory_type, game_duration_seconds')
        .eq('id', gameId)
        .single()
      
      if (gameError) throw gameError
      
      // Fetch winner player if exists
      let winnerData = null
      if (gameData?.winner_id) {
        const { data: winner, error: winnerError } = await supabase
          .from('players')
          .select('*')
          .eq('id', gameData.winner_id)
          .single()
        
        if (!winnerError) winnerData = winner
      }
      
      set({ gameStats: statsData || [], winnerPlayer: winnerData })
    } catch (error) {
      console.error('Error fetching game stats:', error)
    }
  },
  setPlayerColors: (colors) => set({ playerColors: colors }),
  setPlayerGameData: (data) => set({ playerGameData: data }),
  setTerritoryStats: (stats) => set({ territoryStats: stats }),
  updateResources: (resources) => set((state) => ({
    resources: { ...state.resources, ...resources }
  })),
  setCurrentTick: (tick) => {
    const currentTick = useGameStore.getState().currentTick
    if (tick !== currentTick) {
      console.log(`[STORE] Tick updated in store: ${currentTick} -> ${tick}`)
    }
    set({ currentTick: tick })
  },
  setCombatLogs: (logs) => set({ combatLogs: logs }),
  setRecentCombatLog: (log) => set({ recentCombatLog: log }),
  
  // UI actions
  selectPlanet: (planet) => set({ selectedPlanet: planet }),
  selectAttack: (attack) => set({ selectedAttack: attack }),
  setCameraPosition: (position) => set({ cameraPosition: position }),
  setCommandMode: (mode) => set({ commandMode: mode }),
  setTerritoryDebugMode: (enabled) => set({ territoryDebugMode: enabled }),
  
  // Reset all game state to initial values
  resetGameState: () => set({
    currentGame: null,
    player: null,
    playerGameData: null,
    systems: [],
    planets: [],
    attacks: [],
    territorySectors: [],
    structures: [],
    gameStats: [],
    winnerPlayer: null,
    playerColors: new Map(),
    territoryStats: new Map(),
    resources: {
      gold: BigInt(0),
      energy: 0,
      minerals: 0,
      research: 0,
    },
    currentTick: 0,
    combatLogs: [],
    recentCombatLog: null,
    cameraPosition: { x: 0, y: 50, z: 100 },
    selectedPlanet: null,
    selectedAttack: null,
    commandMode: null,
  }),
  
  // Server action - send troops
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
    const arrivalAt = new Date(Date.now() + travelMs).toISOString()
    
    // Log attack creation attempt
    console.log('[ATTACK] Creating attack:', {
      sourcePlanetId,
      targetPlanetId,
      troopCount,
      travelMs,
      arrivalAt
    })
    
    // Create attack in Supabase
    const { data: attackData, error: attackError } = await supabase
      .from('planet_attacks')
      .insert({
        game_id: state.currentGame.id,
        attacker_id: state.player.id,
        source_planet_id: sourcePlanetId,
        target_planet_id: targetPlanetId,
        troops: troopCount,
        arrival_at: arrivalAt
      })
      .select()
      .single()
    
    if (attackError) {
      console.error('[ATTACK] Failed to create attack:', attackError)
      console.error('[ATTACK] Error details:', {
        code: attackError.code,
        message: attackError.message,
        details: attackError.details
      })
      return // Exit early on failure
    }
    
    if (attackData) {
      console.log('[ATTACK] Attack created successfully:', attackData.id)
    }
    
    // Deduct troops immediately (server will verify)
    console.log('[ATTACK] Deducting troops from source planet:', {
      planetId: sourcePlanetId,
      oldTroops: source.troops,
      newTroops: source.troops - troopCount
    })
    
    const { error: deductError } = await supabase
      .from('systems')
      .update({ troop_count: source.troops - troopCount })
      .eq('id', sourcePlanetId)
    
    if (deductError) {
      console.error('[ATTACK] Failed to deduct troops:', deductError)
    }
    
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
    const costMap: Record<string, StructureCostKey> = {
      'trade-station': 'BUILD_STRUCTURE_TRADE',
      'mining-station': 'BUILD_STRUCTURE_MINING',
      'colony-station': 'BUILD_STRUCTURE_COLONY',
      'defense-platform': 'BUILD_STRUCTURE_DEFENSE',
      'missile-battery': 'BUILD_STRUCTURE_MISSILE',
      'point-defense': 'BUILD_STRUCTURE_POINT_DEFENSE'
    }
    
    const costKey: StructureCostKey | undefined = costMap[structureType]
    if (!costKey) return false
    
    const cost = ResourceSystem.COSTS[costKey]
    
    // Check affordability
    const canAfford = 
      Number(state.resources.gold) >= cost.credits &&
      state.resources.energy >= cost.energy &&
      state.resources.minerals >= cost.minerals
    
    if (!canAfford) return false
    
    try {
      // Deduct resources
      const { error: updateError } = await supabase
        .from('players')
        .update({
          credits: player.credits - cost.credits,
          energy: player.energy - cost.energy,
          minerals: player.minerals - cost.minerals
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
        set(() => ({
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
