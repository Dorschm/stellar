/**
 * Resource generation and management system adapted from OpenFront
 * This class is used in both client and server (Deno edge function) contexts.
 * Methods accept parameters instead of reading from store for server compatibility.
 */
import { useGameStore } from '../store/gameStore'
import type { Structure } from '../services/supabase'

export interface ResourceGeneration {
  energy: number
  credits: number
  minerals: number
}

export interface ResourceCost {
  energy?: number
  credits?: number
  minerals?: number
}

export interface StructureCost {
  credits: number
  minerals: number
  energy: number
}

export type StructureCostKey = 
  | 'BUILD_STRUCTURE_TRADE'
  | 'BUILD_STRUCTURE_MINING'
  | 'BUILD_STRUCTURE_COLONY'
  | 'BUILD_STRUCTURE_DEFENSE'
  | 'BUILD_STRUCTURE_MISSILE'
  | 'BUILD_STRUCTURE_POINT_DEFENSE'

export class ResourceSystem {
  private baseEnergyGeneration = 100
  
  // Maximum resource caps
  private maxEnergy = 100000
  private maxCredits = 1000000
  private maxMinerals = 100000
  
  /**
   * Calculate total resource generation for a player
   * Server-side compatible - accepts systems and structures as parameters
   */
  calculateResourceGeneration(
    playerId: string,
    systems: any[],
    structures: Structure[],
    currentEnergy: number
  ): ResourceGeneration {
    const ownedSystems = systems.filter(s => s.owner_id === playerId)
    
    let totalEnergy = 0
    let totalCredits = 0
    let totalMinerals = 0
    
    // Base energy: 100 + (ownedPlanets^0.6 * 100)
    totalEnergy = this.baseEnergyGeneration + Math.floor(Math.pow(ownedSystems.length, 0.6) * 100)
    
    // Credits: 10 per planet base
    totalCredits = ownedSystems.length * 10
    
    // Add trade income from Trade Stations
    const tradeStations = structures.filter(s => s.structure_type === 'trade_station' && s.is_active)
    for (const station of tradeStations) {
      const stationSystem = systems.find(s => s.id === station.system_id)
      if (stationSystem) {
        // Calculate distance-based bonuses between connected owned planets within 100 units
        const nearbyFriendly = ownedSystems.filter(s => {
          if (s.id === stationSystem.id) return false
          const distance = Math.sqrt(
            Math.pow(s.x_pos - stationSystem.x_pos, 2) +
            Math.pow(s.y_pos - stationSystem.y_pos, 2) +
            Math.pow(s.z_pos - stationSystem.z_pos, 2)
          )
          return distance <= 100
        })
        totalCredits += nearbyFriendly.length * 10
      }
    }
    
    // Minerals: 50 per Mining Station on mineral-rich planets
    const miningStations = structures.filter(s => s.structure_type === 'mining_station' && s.is_active)
    for (const station of miningStations) {
      const stationSystem = systems.find(s => s.id === station.system_id)
      if (stationSystem && stationSystem.has_minerals) {
        totalMinerals += 50
      }
    }
    
    // Apply efficiency based on resource levels (OpenFront formula)
    const energyEfficiency = this.calculateEnergyEfficiency(currentEnergy, this.maxEnergy)
    totalEnergy = Math.floor(totalEnergy * energyEfficiency)
    
    return {
      energy: totalEnergy,
      credits: totalCredits,
      minerals: totalMinerals
    }
  }
  
  // Energy efficiency formula from OpenFront (optimal at 42% capacity)
  calculateEnergyEfficiency(current: number, max: number): number {
    const ratio = current / max
    
    // Peak efficiency at 42% (from OpenFront)
    const optimalRatio = 0.42
    
    if (ratio <= optimalRatio) {
      // Linear growth up to optimal
      return 0.5 + (ratio / optimalRatio) * 0.5
    } else {
      // Diminishing returns after optimal
      const excess = ratio - optimalRatio
      const penalty = excess / (1 - optimalRatio)
      return 1.0 - (penalty * 0.5)
    }
  }
  
  /**
   * Process resource tick - server-side compatible
   * Returns new resource values instead of updating store directly
   */
  processResourceTick(
    playerId: string,
    currentResources: { energy: number; credits: number; minerals: number },
    systems: any[],
    structures: Structure[]
  ): { energy: number; credits: number; minerals: number } {
    const generation = this.calculateResourceGeneration(playerId, systems, structures, currentResources.energy)
    
    // Apply generation with caps
    const newResources = {
      energy: Math.min(currentResources.energy + generation.energy, this.maxEnergy),
      credits: Math.min(currentResources.credits + generation.credits, this.maxCredits),
      minerals: Math.min(currentResources.minerals + generation.minerals, this.maxMinerals)
    }
    
    return newResources
  }
  
  /**
   * Check if resources can afford a cost (server-compatible)
   * @param resources - The resource state to check
   * @param cost - The cost to check affordability for
   */
  canAffordWithResources(resources: { gold: bigint; energy: number; minerals: number }, cost: ResourceCost): boolean {
    if (cost.energy && resources.energy < cost.energy) return false
    if (cost.credits && Number(resources.gold) < cost.credits) return false
    if (cost.minerals && resources.minerals < cost.minerals) return false
    
    return true
  }
  
  /**
   * Check if player can afford something (client-only helper)
   * Uses the game store directly - for client UI only
   */
  canAfford(cost: ResourceCost): boolean {
    const resources = useGameStore.getState().resources
    return this.canAffordWithResources(resources, cost)
  }
  
  /**
   * Deduct resources (client-only helper)
   * Uses the game store directly - for client UI only
   */
  deductResources(cost: ResourceCost): boolean {
    if (!this.canAfford(cost)) return false
    
    const store = useGameStore.getState()
    const current = store.resources
    
    store.updateResources({
      gold: BigInt(Math.max(0, Number(current.gold) - (cost.credits || 0))),
      energy: current.energy - (cost.energy || 0),
      minerals: current.minerals - (cost.minerals || 0)
    })
    
    return true
  }
  
  /**
   * Trade resources between players (client-only helper)
   * Uses the game store directly - for client UI only
   */
  tradeResources(
    fromPlayerId: string,
    resourceType: 'credits' | 'minerals' | 'energy',
    amount: number
  ): boolean {
    const store = useGameStore.getState()
    const currentPlayer = store.player
    
    if (!currentPlayer || currentPlayer.id !== fromPlayerId) return false
    
    const resources = store.resources
    
    // Check affordability
    if (resourceType === 'credits' && Number(resources.gold) < amount) return false
    if (resourceType === 'energy' && resources.energy < amount) return false
    if (resourceType === 'minerals' && resources.minerals < amount) return false
    
    // Deduct from sender
    if (resourceType === 'credits') {
      store.updateResources({
        gold: BigInt(Math.max(0, Number(resources.gold) - amount))
      })
    } else if (resourceType === 'energy') {
      store.updateResources({
        energy: resources.energy - amount
      })
    } else if (resourceType === 'minerals') {
      store.updateResources({
        minerals: resources.minerals - amount
      })
    }
    
    // TODO: Add to recipient via database update
    
    return true
  }
  
  /**
   * Calculate trade income from trade routes (client-only helper)
   * Uses the game store directly - for client UI only
   */
  calculateTradeIncome(playerId: string): number {
    const systems = useGameStore.getState().systems
    const ownedSystems = systems.filter(s => s.owner_id === playerId)
    
    let tradeIncome = 0
    
    // Simple trade calculation based on connected systems
    for (const system of ownedSystems) {
      // Check for nearby friendly systems
      const nearbyFriendly = systems.filter(s => {
        if (s.id === system.id) return false
        if (s.owner_id !== playerId) return false
        
        const distance = Math.sqrt(
          Math.pow(s.x_pos - system.x_pos, 2) +
          Math.pow(s.y_pos - system.y_pos, 2) +
          Math.pow(s.z_pos - system.z_pos, 2)
        )
        
        return distance <= 100
      })
      
      // Each connection generates trade income
      tradeIncome += nearbyFriendly.length * 10
    }
    
    return tradeIncome
  }
  
  /**
   * Get structure effects for a specific system
   * Used by game-tick to apply building effects
   */
  getStructureEffects(structures: Structure[], systemId: string): {
    troopCapBonus: number
    defenseMultiplier: number
    tradeIncomeBonus: number
  } {
    const systemStructures = structures.filter(s => s.system_id === systemId && s.is_active)
    
    let troopCapBonus = 0
    let defenseMultiplier = 1
    let tradeIncomeBonus = 0
    
    for (const structure of systemStructures) {
      switch (structure.structure_type) {
        case 'colony_station':
          // Colony Station: +100 troop cap per level
          troopCapBonus += 100 * structure.level
          break
        case 'defense_platform':
          // Defense Platform: 5x defense multiplier (only strongest applies)
          defenseMultiplier = Math.max(defenseMultiplier, 5)
          break
        case 'trade_station':
          // Trade Station: bonus handled in resource generation
          tradeIncomeBonus += 10 * structure.level
          break
      }
    }
    
    return { troopCapBonus, defenseMultiplier, tradeIncomeBonus }
  }
  
  /**
   * Get resource generation breakdown for UI (client-only helper)
   * Uses the game store directly - for client UI only
   */
  getResourceBreakdown(playerId: string): {
    base: ResourceGeneration
    bonuses: ResourceGeneration
    penalties: ResourceGeneration
    total: ResourceGeneration
  } {
    const systems = useGameStore.getState().systems
    const structures = useGameStore.getState().structures || []
    const ownedSystems = systems.filter(s => s.owner_id === playerId)
    const resources = useGameStore.getState().resources
    
    const base: ResourceGeneration = {
      energy: this.baseEnergyGeneration + Math.floor(Math.pow(ownedSystems.length, 0.6) * 100),
      credits: ownedSystems.length * 10,
      minerals: 0
    }
    
    const bonuses: ResourceGeneration = {
      energy: 0,
      credits: this.calculateTradeIncome(playerId),
      minerals: structures.filter(s => s.structure_type === 'mining_station' && s.is_active).length * 50
    }
    
    // Calculate penalties (e.g., from low efficiency)
    const efficiency = this.calculateEnergyEfficiency(resources.energy, this.maxEnergy)
    const energyPenalty = efficiency < 1 ? Math.floor(base.energy * (1 - efficiency)) : 0
    
    const penalties: ResourceGeneration = {
      energy: energyPenalty,
      credits: 0,
      minerals: 0
    }
    
    const total = this.calculateResourceGeneration(playerId, systems, structures, resources.energy)
    
    return { base, bonuses, penalties, total }
  }
  
  // Resource costs for various actions
  static readonly COSTS = {
    CAPTURE_SYSTEM: { energy: 1000, credits: 500 },
    BUILD_FLEET_SCOUT: { credits: 1000, minerals: 100, energy: 500 },
    BUILD_FLEET_ATTACK: { credits: 5000, minerals: 500, energy: 2000 },
    BUILD_FLEET_DEFENSE: { credits: 3000, minerals: 300, energy: 1500 },
    BUILD_FLEET_CARRIER: { credits: 10000, minerals: 1000, energy: 5000 },
    BUILD_FLEET_TRADE: { credits: 2000, minerals: 200, energy: 1000 },
    BUILD_STRUCTURE_TRADE: { credits: 50000, minerals: 500, energy: 1000 } as StructureCost,
    BUILD_STRUCTURE_MINING: { credits: 50000, minerals: 200, energy: 500 } as StructureCost,
    BUILD_STRUCTURE_COLONY: { credits: 100000, minerals: 1000, energy: 2000 } as StructureCost,
    BUILD_STRUCTURE_DEFENSE: { credits: 25000, minerals: 500, energy: 500 } as StructureCost,
    BUILD_STRUCTURE_MISSILE: { credits: 75000, minerals: 1000, energy: 1000 } as StructureCost,
    BUILD_STRUCTURE_POINT_DEFENSE: { credits: 50000, minerals: 750, energy: 750 } as StructureCost,
    LAUNCH_ANTIMATTER: { credits: 100000, minerals: 5000, energy: 10000 },
    LAUNCH_NOVA_BOMB: { credits: 200000, minerals: 10000, energy: 20000 },
    LAUNCH_SWARM: { credits: 150000, minerals: 7500, energy: 15000 }
  } as const
}

// Export singleton instance
export const resourceSystem = new ResourceSystem()
