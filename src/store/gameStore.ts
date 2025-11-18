import { create } from 'zustand'
import type { System, Player, Game } from '../services/supabase'

interface Resources {
  energy: number
  credits: number
  minerals: number
  research: number
}

interface Fleet {
  id: string
  owner_id: string
  type: 'scout' | 'attack' | 'defense' | 'carrier' | 'trade'
  size: number
  position: { x: number; y: number; z: number }
  destination?: { x: number; y: number; z: number }
  health: number
}

interface GameState {
  // Game state
  currentGame: Game | null
  player: Player | null
  systems: System[]
  fleets: Fleet[]
  resources: Resources
  
  // Camera state
  cameraPosition: { x: number; y: number; z: number }
  selectedSystem: System | null
  selectedFleet: Fleet | null
  
  // Actions
  setGame: (game: Game) => void
  setPlayer: (player: Player) => void
  setSystems: (systems: System[]) => void
  setFleets: (fleets: Fleet[]) => void
  updateResources: (resources: Partial<Resources>) => void
  selectSystem: (system: System | null) => void
  selectFleet: (fleet: Fleet | null) => void
  setCameraPosition: (position: { x: number; y: number; z: number }) => void
  
  // Game actions
  captureSystem: (systemId: string) => void
  moveFleet: (fleetId: string, destination: { x: number; y: number; z: number }) => void
  buildStructure: (systemId: string, structureType: string) => void
}

export const useGameStore = create<GameState>((set) => ({
  // Initial state
  currentGame: null,
  player: null,
  systems: [],
  fleets: [],
  resources: {
    energy: 50000,
    credits: 10000,
    minerals: 1000,
    research: 0
  },
  cameraPosition: { x: 0, y: 50, z: 100 },
  selectedSystem: null,
  selectedFleet: null,
  
  // Actions
  setGame: (game) => set({ currentGame: game }),
  setPlayer: (player) => set({ player }),
  setSystems: (systems) => set({ systems }),
  setFleets: (fleets) => set({ fleets }),
  updateResources: (resources) => set((state) => ({
    resources: { ...state.resources, ...resources }
  })),
  selectSystem: (system) => set({ selectedSystem: system }),
  selectFleet: (fleet) => set({ selectedFleet: fleet }),
  setCameraPosition: (position) => set({ cameraPosition: position }),
  
  // Game actions
  captureSystem: (systemId) => set((state) => {
    const system = state.systems.find(s => s.id === systemId)
    if (!system || !state.player) return state
    
    const updatedSystems = state.systems.map(s => 
      s.id === systemId ? { ...s, owner_id: state.player!.id } : s
    )
    
    return { systems: updatedSystems }
  }),
  
  moveFleet: (fleetId, destination) => set((state) => {
    const updatedFleets = state.fleets.map(f => 
      f.id === fleetId ? { ...f, destination } : f
    )
    return { fleets: updatedFleets }
  }),
  
  buildStructure: (systemId, structureType) => set((state) => {
    // TODO: Implement structure building logic
    console.log(`Building ${structureType} at system ${systemId}`)
    return state
  })
}))
