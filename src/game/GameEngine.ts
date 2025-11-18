// Adapted from OpenFront's game engine for 3D space

export interface Vector3D {
  x: number
  y: number
  z: number
}

export interface GameConfig {
  tickRate: number  // ms between ticks
  mapSize: number   // size of the 3D space
  victoryCondition: number  // % of systems to win
  baseEnergyGeneration: number
  baseCreditGeneration: number
  combatMultipliers: {
    flanking: number  // 1.2 for 20% bonus
    elevation: number // 1.1 for 10% bonus
    nebula: number    // 0.5 for 50% defense
    asteroid: number  // 0.75 for 25% defense
  }
}

export const DEFAULT_CONFIG: GameConfig = {
  tickRate: 100,
  mapSize: 1000,
  victoryCondition: 80,
  baseEnergyGeneration: 100,
  baseCreditGeneration: 100,
  combatMultipliers: {
    flanking: 1.2,
    elevation: 1.1,
    nebula: 1.5,
    asteroid: 1.25
  }
}

export class GameEngine {
  private config: GameConfig
  private tickInterval?: number
  private currentTick: number = 0
  
  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }
  
  // Calculate distance between two points in 3D space
  calculateDistance(a: Vector3D, b: Vector3D): number {
    const dx = a.x - b.x
    const dy = a.y - b.y
    const dz = a.z - b.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
  
  // Calculate travel time for fleets
  calculateTravelTime(from: Vector3D, to: Vector3D, fleetSpeed: number): number {
    const distance = this.calculateDistance(from, to)
    return Math.ceil(distance / fleetSpeed)
  }
  
  // Energy regeneration formula (adapted from OpenFront)
  calculateEnergyRegen(current: number, max: number): number {
    const ratio = current / max
    const growthBase = 10 + Math.pow(current, 0.73) / 4
    const efficiency = 1 - ratio
    return Math.floor(growthBase * efficiency)
  }
  
  // Calculate combat resolution
  calculateCombat(
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
      defenseMultiplier *= this.config.combatMultipliers.nebula
    } else if (terrain === 'asteroid') {
      defenseMultiplier *= this.config.combatMultipliers.asteroid
    }
    
    // Apply tactical modifiers
    if (isFlanking) {
      attackMultiplier *= this.config.combatMultipliers.flanking
    }
    if (hasElevationAdvantage) {
      attackMultiplier *= this.config.combatMultipliers.elevation
    }
    if (hasDefenseStation) {
      defenseMultiplier *= 5  // Defense stations provide 5x multiplier
    }
    
    const effectiveAttack = attackerForce * attackMultiplier
    const effectiveDefense = defenderForce * defenseMultiplier
    
    // Calculate losses
    const attackerLosses = Math.floor(effectiveDefense * 0.3)
    const defenderLosses = Math.floor(effectiveAttack * 0.4)
    
    const winner = effectiveAttack > effectiveDefense ? 'attacker' : 'defender'
    
    return { attackerLosses, defenderLosses, winner }
  }
  
  // Check if systems are in flanking position
  checkFlanking(attackingSystems: Vector3D[], targetSystem: Vector3D): boolean {
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
  
  // Check for encirclement (instant surrender condition)
  checkEncirclement(surroundingSystems: Vector3D[], targetSystem: Vector3D): boolean {
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
  
  // Start the game loop
  start(onTick: (tick: number) => void) {
    this.tickInterval = window.setInterval(() => {
      this.currentTick++
      onTick(this.currentTick)
    }, this.config.tickRate)
  }
  
  // Stop the game loop
  stop() {
    if (this.tickInterval) {
      window.clearInterval(this.tickInterval)
      this.tickInterval = undefined
    }
  }
  
  getCurrentTick(): number {
    return this.currentTick
  }
}
