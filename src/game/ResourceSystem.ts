// Resource generation and management system adapted from OpenFront
import { useGameStore } from '../store/gameStore'
import type { System } from '../services/supabase'

export interface ResourceGeneration {
  energy: number
  credits: number
  minerals: number
  research: number
}

export interface ResourceCost {
  energy?: number
  credits?: number
  minerals?: number
}

export class ResourceSystem {
  private baseEnergyGeneration = 100
  private baseCreditGeneration = 100
  private baseMineralGeneration = 50
  private baseResearchGeneration = 1
  
  // Maximum resource caps
  private maxEnergy = 100000
  private maxCredits = 1000000
  private maxMinerals = 100000
  private maxResearch = 1000
  
  // Calculate total resource generation for a player
  calculateResourceGeneration(playerId: string): ResourceGeneration {
    const systems = useGameStore.getState().systems
    const ownedSystems = systems.filter(s => s.owner_id === playerId)
    
    let totalEnergy = 0
    let totalCredits = 0
    let totalMinerals = 0
    let totalResearch = 0
    
    // Calculate from systems
    for (const system of ownedSystems) {
      // Energy from systems
      totalEnergy += system.energy_generation || this.baseEnergyGeneration
      
      // Credits from trade (simplified - based on number of systems)
      totalCredits += this.baseCreditGeneration
      
      // Minerals from mineral-rich systems
      if (system.has_minerals) {
        totalMinerals += this.baseMineralGeneration
      }
      
      // Research from every 5 systems
      if (ownedSystems.indexOf(system) % 5 === 0) {
        totalResearch += this.baseResearchGeneration
      }
    }
    
    // Apply efficiency based on resource levels (OpenFront formula)
    const resources = useGameStore.getState().resources
    const energyEfficiency = this.calculateEnergyEfficiency(resources.energy, this.maxEnergy)
    totalEnergy = Math.floor(totalEnergy * energyEfficiency)
    
    return {
      energy: totalEnergy,
      credits: totalCredits,
      minerals: totalMinerals,
      research: totalResearch
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
  
  // Process resource tick
  processResourceTick(playerId: string) {
    const generation = this.calculateResourceGeneration(playerId)
    const store = useGameStore.getState()
    const current = store.resources
    
    // Apply generation with caps
    const newResources = {
      energy: Math.min(current.energy + generation.energy, this.maxEnergy),
      credits: Math.min(current.credits + generation.credits, this.maxCredits),
      minerals: Math.min(current.minerals + generation.minerals, this.maxMinerals),
      research: Math.min(current.research + generation.research, this.maxResearch)
    }
    
    store.updateResources(newResources)
    
    // Check for resource-based events
    this.checkResourceEvents(newResources)
  }
  
  // Check if player can afford something
  canAfford(cost: ResourceCost): boolean {
    const resources = useGameStore.getState().resources
    
    if (cost.energy && resources.energy < cost.energy) return false
    if (cost.credits && resources.credits < cost.credits) return false
    if (cost.minerals && resources.minerals < cost.minerals) return false
    
    return true
  }
  
  // Deduct resources
  deductResources(cost: ResourceCost): boolean {
    if (!this.canAfford(cost)) return false
    
    const store = useGameStore.getState()
    const current = store.resources
    
    store.updateResources({
      energy: current.energy - (cost.energy || 0),
      credits: current.credits - (cost.credits || 0),
      minerals: current.minerals - (cost.minerals || 0)
    })
    
    return true
  }
  
  // Trade resources between players
  tradeResources(
    fromPlayerId: string,
    toPlayerId: string,
    resourceType: 'credits' | 'minerals' | 'energy',
    amount: number
  ): boolean {
    const store = useGameStore.getState()
    const currentPlayer = store.player
    
    if (!currentPlayer || currentPlayer.id !== fromPlayerId) return false
    
    const resources = store.resources
    if (resources[resourceType] < amount) return false
    
    // Deduct from sender
    store.updateResources({
      [resourceType]: resources[resourceType] - amount
    })
    
    // TODO: Add to recipient via database update
    
    return true
  }
  
  // Calculate trade income (from trade routes)
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
  
  // Resource events and bonuses
  private checkResourceEvents(resources: ResourceGeneration) {
    // Energy crisis
    if (resources.energy < 1000) {
      console.log('Energy crisis! Build more energy generators')
    }
    
    // Credit surplus
    if (resources.credits > 50000) {
      console.log('Credit surplus! Consider investing in fleet or structures')
    }
    
    // Research milestone
    if (resources.research >= 10 && resources.research % 10 === 0) {
      console.log('Research milestone reached!')
      // TODO: Unlock new technologies
    }
  }
  
  // Get resource generation breakdown for UI
  getResourceBreakdown(playerId: string): {
    base: ResourceGeneration
    bonuses: ResourceGeneration
    penalties: ResourceGeneration
    total: ResourceGeneration
  } {
    const systems = useGameStore.getState().systems
    const ownedSystems = systems.filter(s => s.owner_id === playerId)
    
    const base: ResourceGeneration = {
      energy: ownedSystems.length * this.baseEnergyGeneration,
      credits: ownedSystems.length * this.baseCreditGeneration,
      minerals: ownedSystems.filter(s => s.has_minerals).length * this.baseMineralGeneration,
      research: Math.floor(ownedSystems.length / 5) * this.baseResearchGeneration
    }
    
    const bonuses: ResourceGeneration = {
      energy: 0,
      credits: this.calculateTradeIncome(playerId),
      minerals: 0,
      research: 0
    }
    
    // Calculate penalties (e.g., from low efficiency)
    const resources = useGameStore.getState().resources
    const efficiency = this.calculateEnergyEfficiency(resources.energy, this.maxEnergy)
    const energyPenalty = efficiency < 1 ? Math.floor(base.energy * (1 - efficiency)) : 0
    
    const penalties: ResourceGeneration = {
      energy: energyPenalty,
      credits: 0,
      minerals: 0,
      research: 0
    }
    
    const total = this.calculateResourceGeneration(playerId)
    
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
    BUILD_STRUCTURE_TRADE: { credits: 50000, minerals: 500, energy: 1000 },
    BUILD_STRUCTURE_MINING: { credits: 50000, minerals: 200, energy: 500 },
    BUILD_STRUCTURE_COLONY: { credits: 100000, minerals: 1000, energy: 2000 },
    BUILD_STRUCTURE_DEFENSE: { credits: 25000, minerals: 500, energy: 500 },
    BUILD_STRUCTURE_MISSILE: { credits: 75000, minerals: 1000, energy: 1000 },
    BUILD_STRUCTURE_POINT_DEFENSE: { credits: 50000, minerals: 750, energy: 750 },
    RESEARCH_TECH: { research: 10 },
    LAUNCH_ANTIMATTER: { credits: 100000, minerals: 5000, energy: 10000 },
    LAUNCH_NOVA_BOMB: { credits: 200000, minerals: 10000, energy: 20000 },
    LAUNCH_SWARM: { credits: 150000, minerals: 7500, energy: 15000 }
  }
}

// Export singleton instance
export const resourceSystem = new ResourceSystem()
