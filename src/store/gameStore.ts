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
  isTickStale: boolean
  
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
  setTickHealth: (isStale: boolean) => void
  
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
  },
  currentTick: 0,
  combatLogs: [],
  recentCombatLog: null,
  isTickStale: false,
  cameraPosition: { x: 0, y: 50, z: 100 },
  selectedPlanet: null,
  selectedAttack: null,
  commandMode: null,
  territoryDebugMode: false,
  
  // Setters for syncing with Supabase
  setGame: (game) => set({ currentGame: game }),
  setPlayer: (player) => set((state) => {
    const newResources = player ? {
      gold: BigInt(player.credits || 0),
      energy: player.energy || 0,
      minerals: player.minerals || 0,
    } : state.resources
    
    if (player) {
      console.log('[STORE] Resources updated:', {
        gold: { old: Number(state.resources.gold), new: Number(newResources.gold), delta: Number(newResources.gold) - Number(state.resources.gold) },
        energy: { old: state.resources.energy, new: newResources.energy, delta: newResources.energy - state.resources.energy },
        minerals: { old: state.resources.minerals, new: newResources.minerals, delta: newResources.minerals - state.resources.minerals }
      })
    }
    
    return { player, resources: newResources }
  }),
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
      console.log(`[STORE] Tick updated at ${Date.now()}: ${currentTick} -> ${tick}`)
    } else {
      console.log(`[STORE] Tick unchanged: ${tick}`)
    }
    set({ currentTick: tick })
  },
  setCombatLogs: (logs) => set({ combatLogs: logs }),
  setRecentCombatLog: (log) => set({ recentCombatLog: log }),
  setTickHealth: (isStale) => set({ isTickStale: isStale }),
  
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
    // Add entry logging
    console.log('[STORE] requestSendTroops called:', {
      source: sourcePlanetId,
      target: targetPlanetId,
      troops: troopCount
    })
    
    const state = get()
    const source = state.planets.find(p => p.id === sourcePlanetId)
    const target = state.planets.find(p => p.id === targetPlanetId)
    
    // Log validation
    console.log('[STORE] Validation:', {
      sourceFound: !!source,
      targetFound: !!target,
      playerAuth: !!state.player,
      gameSet: !!state.currentGame,
      ownsSource: source ? source.owner_id === state.player?.id : false,
      hasTroops: source ? source.troops >= troopCount : false
    })
    
    if (!source) {
      console.error('[STORE ERROR] Failed validation: Source planet not found')
      return
    }
    if (!target) {
      console.error('[STORE ERROR] Failed validation: Target planet not found')
      return
    }
    if (!state.player) {
      console.error('[STORE ERROR] Failed validation: Player not authenticated')
      return
    }
    if (!state.currentGame) {
      console.error('[STORE ERROR] Failed validation: Current game not set')
      return
    }
    if (source.owner_id !== state.player.id) {
      console.error('[STORE ERROR] Failed validation: Source planet not owned by player')
      return
    }
    if (source.troops < troopCount) {
      console.error('[STORE ERROR] Failed validation: Insufficient troops')
      return
    }
    
    // Calculate travel time
    const dx = target.x_pos - source.x_pos
    const dy = target.y_pos - source.y_pos  
    const dz = target.z_pos - source.z_pos
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const travelMs = Math.ceil(distance / 2) * 100 // milliseconds
    const arrivalAt = new Date(Date.now() + travelMs).toISOString()
    
    // Log attack creation attempt
    console.log('[STORE] Creating attack:', {
      gameId: state.currentGame.id,
      attackerId: state.player.id,
      sourcePlanetId,
      targetPlanetId,
      troopCount,
      travelMs,
      arrivalAt
    })
    
    try {
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
        console.error('[STORE] Failed to create attack:', attackError)
        console.error('[STORE] Error details:', {
          code: attackError.code,
          message: attackError.message,
          details: attackError.details
        })
        set({ commandMode: null })
        return // Exit early on failure
      }
      
      if (attackData) {
        console.log('[STORE] Attack created successfully:', {
          attackId: attackData.id,
          troops: troopCount,
          source: sourcePlanetId,
          target: targetPlanetId
        })
      }
      
      // Deduct troops atomically using server-side RPC
      console.log('[STORE] Deducting troops from source planet via RPC:', {
        planetId: sourcePlanetId,
        troopCount: troopCount
      })
      
      const { data: deductResult, error: deductError } = await supabase
        .rpc('deduct_troops', {
          p_system_id: sourcePlanetId,
          p_troop_count: troopCount
        })
      
      if (deductError) {
        console.error('[STORE] Failed to call deduct_troops RPC:', deductError)
        set({ commandMode: null })
        return
      }
      
      if (!deductResult?.success) {
        console.error('[STORE] Troop deduction failed:', deductResult)
        set({ commandMode: null })
        return
      }
      
      console.log('[STORE] Troops deducted successfully:', deductResult)
      
      // Clear command mode
      console.log('[STORE] Command mode cleared')
      set({ commandMode: null })
      
      console.log('[STORE] requestSendTroops completed successfully')
    } catch (error) {
      console.error('[STORE ERROR] Unexpected error in requestSendTroops:', error)
      set({ commandMode: null })
    }
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
