// Territory control mechanics adapted from OpenFront for 3D space
import type { System } from '../services/supabase'
import { useGameStore } from '../store/gameStore'
import { GameEngine } from './GameEngine'

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
  private systemOwnership: Map<string, string> = new Map()
  
  constructor() {
    this.gameEngine = new GameEngine()
  }
  
  // Calculate control percentage for victory conditions (sector-based)
  calculateControlPercentage(playerId: string): number {
    const territorySectors = useGameStore.getState().territorySectors
    if (territorySectors.length === 0) {
      return 0
    }

    const controlledSectors = territorySectors.filter(s => s.owner_id === playerId)
    return (controlledSectors.length / territorySectors.length) * 100
  }

  getSectorCount(playerId: string): number {
    const territorySectors = useGameStore.getState().territorySectors
    return territorySectors.filter(s => s.owner_id === playerId).length
  }

  // Check if player has won by territory control (read-only, actual victory is server-side)
  checkVictoryCondition(playerId: string, victoryThreshold: number = 80): boolean {
    const territoryPercentage = this.calculateControlPercentage(playerId)
    const planetPercentage = this.getPlanetControlPercentage(playerId)
    
    return territoryPercentage >= victoryThreshold || planetPercentage >= victoryThreshold
  }
  
  // Calculate planet control percentage for victory conditions
  getPlanetControlPercentage(playerId: string): number {
    const systems = useGameStore.getState().systems
    if (systems.length === 0) {
      return 0
    }
    
    const controlledPlanets = systems.filter(s => s.owner_id === playerId)
    return (controlledPlanets.length / systems.length) * 100
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
    
    // Note: Victory checking is now handled server-side in game-tick function
    // Client-side check is informational only
    if (this.checkVictoryCondition(newOwnerId)) {
      console.log(`Player ${newOwnerId} has reached victory threshold (client-side check)`)      // Server will detect and complete the game
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
  
  // Calculate expansion tier for a planet based on ownership duration
  calculateExpansionTier(planetId: string): { tier: number; ownershipDuration: number; nextTierIn: number } {
    const territorySectors = useGameStore.getState().territorySectors
    const planetSectors = territorySectors.filter(s => s.controlled_by_planet_id === planetId)
    
    if (planetSectors.length === 0) {
      return { tier: 1, ownershipDuration: 0, nextTierIn: 50 }
    }
    
    // Find oldest sector to determine ownership duration
    let oldestCaptureMs = Infinity
    for (const sector of planetSectors) {
      const capturedAtMs = new Date(sector.captured_at).getTime()
      if (!Number.isNaN(capturedAtMs)) {
        oldestCaptureMs = Math.min(oldestCaptureMs, capturedAtMs)
      }
    }
    
    const nowMs = Date.now()
    const ownershipDurationMs = nowMs - oldestCaptureMs
    const ownershipDurationTicks = Math.floor(ownershipDurationMs / 100) // 100ms per tick
    
    // Determine tier based on duration
    let tier = 1
    let nextTierIn = 50 - ownershipDurationTicks
    
    if (ownershipDurationTicks > 150) {
      tier = 3
      nextTierIn = 0 // Max tier
    } else if (ownershipDurationTicks > 50) {
      tier = 2
      nextTierIn = 150 - ownershipDurationTicks
    }
    
    return {
      tier,
      ownershipDuration: ownershipDurationTicks,
      nextTierIn: Math.max(0, nextTierIn)
    }
  }
  
  // Calculate expansion rate (sectors per minute) for a player
  calculateExpansionRate(playerId: string): number {
    const territorySectors = useGameStore.getState().territorySectors
    const playerSectors = territorySectors.filter(s => s.owner_id === playerId)
    
    // Count sectors added in last 60 seconds
    const sixtySecondsAgo = Date.now() - 60000
    const recentSectors = playerSectors.filter(s => {
      const capturedAt = new Date(s.captured_at).getTime()
      return capturedAt >= sixtySecondsAgo
    })
    
    // Return sectors per minute
    return recentSectors.length
  }
  
  // Get frontier planets (actively expanding planets)
  getFrontierPlanets(playerId: string): System[] {
    const systems = useGameStore.getState().systems
    const territorySectors = useGameStore.getState().territorySectors
    const ownedPlanets = systems.filter(s => s.owner_id === playerId)
    const frontierPlanets: System[] = []
    
    for (const planet of ownedPlanets) {
      const planetSectors = territorySectors.filter(s => s.controlled_by_planet_id === planet.id)
      
      // Check if planet has sectors captured in last 30 seconds
      const thirtySecondsAgo = Date.now() - 30000
      const hasRecentExpansion = planetSectors.some(s => {
        const capturedAt = new Date(s.captured_at).getTime()
        return capturedAt >= thirtySecondsAgo
      })
      
      if (hasRecentExpansion) {
        frontierPlanets.push(planet)
        continue
      }
      
      // Check if planet is near enemy/neutral territory
      const isNearBorder = systems.some(other => {
        if (other.id === planet.id || other.owner_id === playerId) return false
        
        const distance = this.gameEngine.calculateDistance(
          { x: planet.x_pos, y: planet.y_pos, z: planet.z_pos },
          { x: other.x_pos, y: other.y_pos, z: other.z_pos }
        )
        
        return distance <= 100
      })
      
      if (isNearBorder) {
        frontierPlanets.push(planet)
      }
    }
    
    return frontierPlanets
  }
  
  // Get edge sectors for a planet (frontier expansion zones)
  getEdgeSectors(planetId: string) {
    const territorySectors = useGameStore.getState().territorySectors
    const planetSectors = territorySectors.filter(s => s.controlled_by_planet_id === planetId)
    
    if (planetSectors.length === 0) return []
    
    // Find maximum wave number
    const maxWave = planetSectors.reduce((max, s) => Math.max(max, s.expansion_wave || 0), 0)
    
    // Return sectors at the frontier (highest wave number)
    return planetSectors.filter(s => (s.expansion_wave || 0) === maxWave)
  }

  // Validate territory integrity
  validateTerritoryIntegrity(): { valid: boolean; issues: string[] } {
    const sectors = useGameStore.getState().territorySectors
    const systems = useGameStore.getState().systems
    const issues: string[] = []
    
    // Check for orphaned sectors
    const orphaned = sectors.filter(s => !systems.find(sys => sys.id === s.controlled_by_planet_id))
    if (orphaned.length > 0) issues.push(`${orphaned.length} orphaned sectors`)
    
    // Check for duplicate positions
    const positions = new Set()
    sectors.forEach(s => {
      const key = `${s.x_pos},${s.y_pos},${s.z_pos}`
      if (positions.has(key)) issues.push(`Duplicate sector at ${key}`)
      positions.add(key)
    })
    
    return { valid: issues.length === 0, issues }
  }

  // Get expansion health metrics
  getExpansionHealth(playerId: string): { healthy: boolean; metrics: any } {
    const rate = this.calculateExpansionRate(playerId)
    const frontiers = this.getFrontierPlanets(playerId)
    const sectors = useGameStore.getState().territorySectors.filter(s => s.owner_id === playerId)
    
    const recentSectors = sectors.filter(s => {
      const age = Date.now() - new Date(s.captured_at).getTime()
      return age < 60000 // Last 60 seconds
    })
    
    return {
      healthy: recentSectors.length > 0 && frontiers.length > 0,
      metrics: {
        expansionRate: rate,
        frontierPlanets: frontiers.length,
        recentSectors: recentSectors.length,
        totalSectors: sectors.length
      }
    }
  }

  // Debug territory state
  debugTerritory(playerId: string): any {
    const sectors = useGameStore.getState().territorySectors.filter(s => s.owner_id === playerId)
    const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
    sectors.forEach(s => {
      const tier = s.expansion_tier || 1
      tierCounts[tier] = (tierCounts[tier] || 0) + 1
    })
    
    const ages = sectors.map(s => Date.now() - new Date(s.captured_at).getTime())
    
    return {
      totalSectors: sectors.length,
      tierDistribution: tierCounts,
      oldestSectorAge: ages.length > 0 ? Math.max(...ages) : 0,
      newestSectorAge: ages.length > 0 ? Math.min(...ages) : 0,
      averageDistance: sectors.length > 0 
        ? sectors.reduce((sum, s) => sum + (s.distance_from_planet || 0), 0) / sectors.length 
        : 0
    }
  }
}

// Export singleton instance
export const territoryControl = new TerritoryControl()
