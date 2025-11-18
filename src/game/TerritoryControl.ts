// Territory control mechanics adapted from OpenFront for 3D space
import type { System } from '../services/supabase'
import { useGameStore } from '../store/gameStore'
import { GameEngine, Vector3D } from './GameEngine'

export interface Territory {
  systems: System[]
  owner: string
  controlPercentage: number
  borderSystems: System[]
  connectedSystems: System[][]
}

export interface TerritoryUpdate {
  systemId: string
  previousOwner?: string
  newOwner: string
  timestamp: number
}

export class TerritoryControl {
  private gameEngine: GameEngine
  private territoryMap: Map<string, Territory> = new Map()
  private systemOwnership: Map<string, string> = new Map()
  
  constructor() {
    this.gameEngine = new GameEngine()
  }
  
  // Calculate control percentage for victory conditions
  calculateControlPercentage(playerId: string): number {
    const allSystems = useGameStore.getState().systems
    const controlledSystems = allSystems.filter(s => s.owner_id === playerId)
    return (controlledSystems.length / allSystems.length) * 100
  }
  
  // Check if player has won by territory control
  checkVictoryCondition(playerId: string, victoryThreshold: number = 80): boolean {
    return this.calculateControlPercentage(playerId) >= victoryThreshold
  }
  
  // Get connected territories (for bonuses and strategic advantages)
  getConnectedTerritories(playerId: string): System[][] {
    const systems = useGameStore.getState().systems
    const ownedSystems = systems.filter(s => s.owner_id === playerId)
    const visited = new Set<string>()
    const territories: System[][] = []
    
    for (const system of ownedSystems) {
      if (!visited.has(system.id)) {
        const territory = this.findConnectedSystems(system, playerId, visited, systems)
        if (territory.length > 0) {
          territories.push(territory)
        }
      }
    }
    
    return territories
  }
  
  private findConnectedSystems(
    startSystem: System,
    playerId: string,
    visited: Set<string>,
    allSystems: System[]
  ): System[] {
    const connected: System[] = []
    const queue: System[] = [startSystem]
    
    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.id)) continue
      
      visited.add(current.id)
      connected.push(current)
      
      // Find nearby systems within connection range
      const neighbors = allSystems.filter(s => {
        if (s.owner_id !== playerId || visited.has(s.id)) return false
        
        const distance = this.gameEngine.calculateDistance(
          { x: current.x_pos, y: current.y_pos, z: current.z_pos },
          { x: s.x_pos, y: s.y_pos, z: s.z_pos }
        )
        
        return distance <= 100 // Connection range
      })
      
      queue.push(...neighbors)
    }
    
    return connected
  }
  
  // Get border systems (for defense planning)
  getBorderSystems(playerId: string): System[] {
    const systems = useGameStore.getState().systems
    const ownedSystems = systems.filter(s => s.owner_id === playerId)
    const borderSystems: System[] = []
    
    for (const system of ownedSystems) {
      // Check if any nearby system is not owned by player
      const hasForeignNeighbor = systems.some(s => {
        if (s.id === system.id) return false
        
        const distance = this.gameEngine.calculateDistance(
          { x: system.x_pos, y: system.y_pos, z: system.z_pos },
          { x: s.x_pos, y: s.y_pos, z: s.z_pos }
        )
        
        return distance <= 100 && s.owner_id !== playerId
      })
      
      if (hasForeignNeighbor) {
        borderSystems.push(system)
      }
    }
    
    return borderSystems
  }
  
  // Calculate strategic value of a system
  calculateSystemValue(system: System): number {
    let value = 100 // Base value
    
    // Energy generation bonus
    value += system.energy_generation
    
    // Mineral bonus
    if (system.has_minerals) {
      value += 200
    }
    
    // Nebula penalty (harder to defend)
    if (system.in_nebula) {
      value *= 0.7
    }
    
    // Position bonus (central systems more valuable)
    const distanceFromCenter = Math.sqrt(
      system.x_pos * system.x_pos +
      system.y_pos * system.y_pos +
      system.z_pos * system.z_pos
    )
    value += Math.max(0, 200 - distanceFromCenter)
    
    return Math.floor(value)
  }
  
  // Find expansion targets
  findExpansionTargets(playerId: string, limit: number = 5): System[] {
    const systems = useGameStore.getState().systems
    const ownedSystems = systems.filter(s => s.owner_id === playerId)
    const unownedSystems = systems.filter(s => !s.owner_id)
    
    if (ownedSystems.length === 0) {
      // No owned systems, return central unowned systems
      return unownedSystems
        .sort((a, b) => {
          const distA = Math.sqrt(a.x_pos ** 2 + a.y_pos ** 2 + a.z_pos ** 2)
          const distB = Math.sqrt(b.x_pos ** 2 + b.y_pos ** 2 + b.z_pos ** 2)
          return distA - distB
        })
        .slice(0, limit)
    }
    
    // Find unowned systems near owned territory
    const targets: { system: System; value: number; minDistance: number }[] = []
    
    for (const unowned of unownedSystems) {
      let minDistance = Infinity
      
      // Find closest owned system
      for (const owned of ownedSystems) {
        const distance = this.gameEngine.calculateDistance(
          { x: owned.x_pos, y: owned.y_pos, z: owned.z_pos },
          { x: unowned.x_pos, y: unowned.y_pos, z: unowned.z_pos }
        )
        minDistance = Math.min(minDistance, distance)
      }
      
      // Calculate strategic value
      const value = this.calculateSystemValue(unowned)
      
      targets.push({ system: unowned, value, minDistance })
    }
    
    // Sort by value/distance ratio
    targets.sort((a, b) => {
      const ratioA = a.value / (a.minDistance + 1)
      const ratioB = b.value / (b.minDistance + 1)
      return ratioB - ratioA
    })
    
    return targets.slice(0, limit).map(t => t.system)
  }
  
  // Check if systems can support each other (for defense)
  canSystemsSupportEachOther(system1: System, system2: System): boolean {
    const distance = this.gameEngine.calculateDistance(
      { x: system1.x_pos, y: system1.y_pos, z: system1.z_pos },
      { x: system2.x_pos, y: system2.y_pos, z: system2.z_pos }
    )
    
    return distance <= 150 // Support range
  }
  
  // Find chokepoints in the map
  findChokepoints(): System[] {
    const systems = useGameStore.getState().systems
    const chokepoints: System[] = []
    
    for (const system of systems) {
      // Count systems within different ranges
      const nearbyCount = systems.filter(s => {
        if (s.id === system.id) return false
        const distance = this.gameEngine.calculateDistance(
          { x: system.x_pos, y: system.y_pos, z: system.z_pos },
          { x: s.x_pos, y: s.y_pos, z: s.z_pos }
        )
        return distance <= 100
      }).length
      
      const farCount = systems.filter(s => {
        if (s.id === system.id) return false
        const distance = this.gameEngine.calculateDistance(
          { x: system.x_pos, y: system.y_pos, z: system.z_pos },
          { x: s.x_pos, y: s.y_pos, z: s.z_pos }
        )
        return distance > 100 && distance <= 200
      }).length
      
      // Chokepoint if few nearby but many far (funnel point)
      if (nearbyCount <= 2 && farCount >= 4) {
        chokepoints.push(system)
      }
    }
    
    return chokepoints
  }
  
  // Capture system with effects
  captureSystem(systemId: string, newOwnerId: string): TerritoryUpdate {
    const systems = useGameStore.getState().systems
    const system = systems.find(s => s.id === systemId)
    
    if (!system) {
      throw new Error(`System ${systemId} not found`)
    }
    
    const update: TerritoryUpdate = {
      systemId,
      previousOwner: system.owner_id,
      newOwner: newOwnerId,
      timestamp: Date.now()
    }
    
    // Update ownership
    system.owner_id = newOwnerId
    this.systemOwnership.set(systemId, newOwnerId)
    
    // Update store
    useGameStore.getState().setSystems([...systems])
    
    // Check for territory bonuses
    this.updateTerritoryBonuses(newOwnerId)
    
    // Check victory condition
    if (this.checkVictoryCondition(newOwnerId)) {
      this.triggerVictory(newOwnerId)
    }
    
    return update
  }
  
  // Update bonuses for connected territories
  private updateTerritoryBonuses(playerId: string) {
    const territories = this.getConnectedTerritories(playerId)
    const store = useGameStore.getState()
    
    // Apply bonuses based on territory size
    territories.forEach(territory => {
      if (territory.length >= 5) {
        // Large territory bonus: +10% resource generation
        const bonusEnergy = Math.floor(territory.length * 10)
        store.updateResources({
          energy: store.resources.energy + bonusEnergy
        })
      }
      
      if (territory.length >= 10) {
        // Huge territory bonus: +5% research
        store.updateResources({
          research: store.resources.research + 1
        })
      }
    })
  }
  
  private triggerVictory(playerId: string) {
    console.log(`Player ${playerId} has achieved victory!`)
    // TODO: Implement victory screen and game end logic
  }
  
  // Get influence map for AI decision making
  getInfluenceMap(): Map<string, number> {
    const systems = useGameStore.getState().systems
    const influenceMap = new Map<string, number>()
    
    for (const system of systems) {
      let influence = 0
      
      // Calculate influence based on nearby owned systems
      for (const other of systems) {
        if (other.owner_id) {
          const distance = this.gameEngine.calculateDistance(
            { x: system.x_pos, y: system.y_pos, z: system.z_pos },
            { x: other.x_pos, y: other.y_pos, z: other.z_pos }
          )
          
          // Influence decreases with distance
          const distanceInfluence = Math.max(0, 200 - distance) / 200
          influence += distanceInfluence
        }
      }
      
      influenceMap.set(system.id, influence)
    }
    
    return influenceMap
  }
}

// Export singleton instance
export const territoryControl = new TerritoryControl()
