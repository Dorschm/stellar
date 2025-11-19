// Transport layer for real-time multiplayer sync, adapted from OpenFront
import { supabase } from '../services/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { GameEngine } from './GameEngine'
import { useGameStore } from '../store/gameStore'

type FleetType = 'scout' | 'attack' | 'defense' | 'carrier' | 'trade'

export interface Intent {
  type: string
  playerId: string
  data: any
  timestamp: number
  tick: number
}

export interface GameStateUpdate {
  tick: number
  systems: SystemUpdate[]
  fleets: FleetUpdate[]
  resources: ResourceUpdate[]
  events: GameEvent[]
}

export interface SystemUpdate {
  id: string
  owner_id?: string
  structures?: any[]
}

export interface FleetUpdate {
  id: string
  owner_id: string
  type: FleetType
  size: number
  position: { x: number; y: number; z: number }
  health: number
  destination?: { x: number; y: number; z: number }
}

export interface ResourceUpdate {
  player_id: string
  energy: number
  credits: number
  minerals: number
  research: number
}

export interface GameEvent {
  type: 'combat' | 'capture' | 'alliance' | 'trade' | 'construction' | 'destruction'
  data: any
  timestamp: number
}

export class Transport {
  private channel: RealtimeChannel | null = null
  private gameEngine: GameEngine
  private pendingIntents: Intent[] = []
  private isHost: boolean = false
  
  constructor() {
    this.gameEngine = new GameEngine()
  }
  
  async connect(gameId: string, playerId: string, isHost: boolean = false) {
    this.isHost = isHost
    
    // Subscribe to game channel
    this.channel = supabase.channel(`game:${gameId}`)
      .on(
        'broadcast',
        { event: 'intent' },
        (payload) => this.handleIntent(payload.payload as Intent)
      )
      .on(
        'broadcast',
        { event: 'state_update' },
        (payload) => this.handleStateUpdate(payload.payload as GameStateUpdate)
      )
      .on(
        'presence',
        { event: 'sync' },
        () => this.handlePresenceSync()
      )
      .on(
        'presence',
        { event: 'join' },
        ({ key, newPresences }) => this.handlePlayerJoin(key, newPresences)
      )
      .on(
        'presence',
        { event: 'leave' },
        ({ key, leftPresences }) => this.handlePlayerLeave(key, leftPresences)
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Connected to game channel')
          
          // Track presence
          await this.channel?.track({
            player_id: playerId,
            online_at: new Date().toISOString(),
          })
          
          // Start game loop if host
          if (this.isHost) {
            this.startGameLoop()
          }
        }
      })
  }
  
  disconnect() {
    if (this.channel) {
      supabase.removeChannel(this.channel)
      this.channel = null
    }
    this.gameEngine.stop()
  }
  
  // Send player intent to all clients
  async sendIntent(type: string, data: any) {
    const intent: Intent = {
      type,
      playerId: useGameStore.getState().player?.id || '',
      data,
      timestamp: Date.now(),
      tick: this.gameEngine.getCurrentTick()
    }
    
    await this.channel?.send({
      type: 'broadcast',
      event: 'intent',
      payload: intent
    })
    
    // Process locally if host
    if (this.isHost) {
      this.pendingIntents.push(intent)
    }
  }
  
  private handleIntent(intent: Intent) {
    // Only non-hosts store intents for later processing
    if (!this.isHost) {
      this.pendingIntents.push(intent)
    }
  }
  
  private handleStateUpdate(update: GameStateUpdate) {
    // Apply state updates from host
    if (this.isHost) return
    
    const store = useGameStore.getState()
    
    // Update systems
    if (update.systems) {
      const currentSystems = store.systems
      update.systems.forEach(sysUpdate => {
        const system = currentSystems.find(s => s.id === sysUpdate.id)
        if (system) {
          if (sysUpdate.owner_id !== undefined) {
            system.owner_id = sysUpdate.owner_id
          }
        }
      })
      store.setSystems([...currentSystems])
    }
    
    // Update fleets
    if (update.fleets) {
      const currentFleets = store.fleets
      update.fleets.forEach(fleetUpdate => {
        const fleet = currentFleets.find(f => f.id === fleetUpdate.id)
        if (fleet) {
          fleet.position = fleetUpdate.position
          fleet.health = fleetUpdate.health
          if (fleetUpdate.destination) {
            fleet.destination = fleetUpdate.destination
          }
        }
      })
      store.setFleets([...currentFleets])
    }
    
    // Update resources
    if (update.resources) {
      const playerUpdate = update.resources.find(r => r.player_id === store.player?.id)
      if (playerUpdate) {
        store.updateResources({
          energy: playerUpdate.energy,
          credits: playerUpdate.credits,
          minerals: playerUpdate.minerals,
          research: playerUpdate.research
        })
      }
    }
    
    // Process events
    if (update.events) {
      update.events.forEach(event => {
        this.processGameEvent(event)
      })
    }
    
  }
  
  private handlePresenceSync() {
    // Handle presence sync
  }
  
  private handlePlayerJoin(key: string, newPresences: any) {
    console.log('Player joined:', key, newPresences)
  }
  
  private handlePlayerLeave(key: string, leftPresences: any) {
    console.log('Player left:', key, leftPresences)
  }
  
  private startGameLoop() {
    this.gameEngine.start((tick) => {
      // Process intents every tick
      this.processIntents(tick)
      
      // Automated growth every 100 ticks (similar to OpenFront)
      if (tick % 100 === 0) {
        this.processAutomatedGrowth()
      }
      
      // Send state update every 5 ticks
      if (tick % 5 === 0) {
        this.broadcastStateUpdate(tick)
      }
    })
  }
  
  private processAutomatedGrowth() {
    const store = useGameStore.getState()
    const newFleets: any[] = []
    
    // Group systems by owner
    const systemsByOwner = new Map<string, typeof store.systems>()
    store.systems.forEach(system => {
      if (system.owner_id) {
        if (!systemsByOwner.has(system.owner_id)) {
          systemsByOwner.set(system.owner_id, [])
        }
        systemsByOwner.get(system.owner_id)!.push(system)
      }
    })
    
    // Each player's systems generate fleets automatically
    systemsByOwner.forEach((systems, ownerId) => {
      const systemCount = systems.length
      
      // Generate fleets based on number of systems (OpenFront-style)
      // More systems = more production
      const fleetsToGenerate = Math.floor(systemCount / 3) // 1 fleet per 3 systems
      
      for (let i = 0; i < fleetsToGenerate; i++) {
        const randomSystem = systems[Math.floor(Math.random() * systems.length)]
        
        newFleets.push({
          id: this.generateFleetId(),
          game_id: store.currentGame?.id,
          owner_id: ownerId,
          type: 'attack' as FleetType,
          size: 20 + Math.floor(Math.random() * 30),
          position: { x: randomSystem.x_pos, y: randomSystem.y_pos, z: randomSystem.z_pos },
          destination: undefined,
          health: 100
        })
      }
    })
    
    if (newFleets.length > 0) {
      store.setFleets([...store.fleets, ...newFleets])
    }
  }
  
  private generateFleetId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return Math.random().toString(36).slice(2, 10)
  }
  
  private processIntents(tick: number) {
    // Group intents by tick
    const intentsForTick = this.pendingIntents.filter(i => i.tick <= tick)
    this.pendingIntents = this.pendingIntents.filter(i => i.tick > tick)
    
    intentsForTick.forEach(intent => {
      switch (intent.type) {
        case 'capture_system':
          this.processCaptureSystem(intent)
          break
        case 'move_fleet':
          this.processMoveFleet(intent)
          break
        case 'build_structure':
          this.processBuildStructure(intent)
          break
        case 'attack':
          this.processAttack(intent)
          break
        case 'trade':
          this.processTrade(intent)
          break
        case 'alliance':
          this.processAlliance(intent)
          break
      }
    })
  }
  
  private processCaptureSystem(intent: Intent) {
    const store = useGameStore.getState()
    const system = store.systems.find(s => s.id === intent.data.systemId)
    
    if (system && !system.owner_id) {
      system.owner_id = intent.playerId
      store.setSystems([...store.systems])
      
      // Create event
      this.createGameEvent('capture', {
        playerId: intent.playerId,
        systemId: intent.data.systemId
      })
    }
  }
  
  private processMoveFleet(intent: Intent) {
    const store = useGameStore.getState()
    const fleet = store.fleets.find(f => f.id === intent.data.fleetId)
    
    if (fleet && fleet.owner_id === intent.playerId) {
      fleet.destination = intent.data.destination
      store.setFleets([...store.fleets])
    }
  }
  
  private processBuildStructure(intent: Intent) {
    const store = useGameStore.getState()
    const system = store.systems.find(s => s.id === intent.data.systemId)
    
    if (system && system.owner_id === intent.playerId) {
      // Deduct resources
      const cost = intent.data.cost
      store.updateResources({
        credits: store.resources.credits - cost.credits,
        minerals: store.resources.minerals - cost.minerals,
        energy: store.resources.energy - cost.energy
      })
      
      // Create structure (simplified)
      this.createGameEvent('construction', {
        playerId: intent.playerId,
        systemId: intent.data.systemId,
        structureType: intent.data.structureType
      })
    }
  }
  
  private processAttack(intent: Intent) {
    const store = useGameStore.getState()
    const attackerFleet = store.fleets.find(f => f.id === intent.data.attackerId)
    const defenderFleet = store.fleets.find(f => f.id === intent.data.defenderId)
    
    if (attackerFleet && defenderFleet) {
      // Calculate combat using game engine
      const distance = this.gameEngine.calculateDistance(
        attackerFleet.position,
        defenderFleet.position
      )
      
      if (distance < 50) { // Combat range
        const result = this.gameEngine.calculateCombat(
          attackerFleet.size,
          defenderFleet.size,
          'space',
          false,
          false,
          false
        )
        
        // Apply losses
        attackerFleet.size -= result.attackerLosses
        defenderFleet.size -= result.defenderLosses
        
        // Remove destroyed fleets
        if (attackerFleet.size <= 0) {
          store.setFleets(store.fleets.filter(f => f.id !== attackerFleet.id))
        }
        if (defenderFleet.size <= 0) {
          store.setFleets(store.fleets.filter(f => f.id !== defenderFleet.id))
        }
        
        this.createGameEvent('combat', {
          attackerId: intent.data.attackerId,
          defenderId: intent.data.defenderId,
          result
        })
      }
    }
  }
  
  private processTrade(intent: Intent) {
    // Process trade between players
    const store = useGameStore.getState()
    
    if (intent.data.type === 'credits') {
      store.updateResources({
        credits: store.resources.credits - intent.data.amount
      })
      
      this.createGameEvent('trade', {
        from: intent.playerId,
        to: intent.data.recipientId,
        amount: intent.data.amount,
        type: 'credits'
      })
    }
  }
  
  private processAlliance(intent: Intent) {
    // Process alliance requests/breaks
    this.createGameEvent('alliance', {
      type: intent.data.action,
      from: intent.playerId,
      to: intent.data.targetId
    })
  }
  
  private broadcastStateUpdate(tick: number) {
    const store = useGameStore.getState()
    
    // Prepare minimal state update
    const update: GameStateUpdate = {
      tick,
      systems: store.systems
        .filter(s => s.owner_id) // Only send owned systems
        .map(s => ({
          id: s.id,
          owner_id: s.owner_id
        })),
      fleets: store.fleets.map(f => ({
        id: f.id,
        owner_id: f.owner_id,
        type: f.type,
        size: f.size,
        position: f.position,
        health: f.health,
        destination: f.destination
      })),
      resources: store.systems
        .reduce((acc: ResourceUpdate[], system) => {
          if (system.owner_id) {
            const existing = acc.find(r => r.player_id === system.owner_id)
            if (!existing) {
              const player = store.player
              if (player && player.id === system.owner_id) {
                acc.push({
                  player_id: system.owner_id,
                  energy: store.resources.energy,
                  credits: store.resources.credits,
                  minerals: store.resources.minerals,
                  research: store.resources.research
                })
              }
            }
          }
          return acc
        }, []),
      events: []
    }
    
    this.channel?.send({
      type: 'broadcast',
      event: 'state_update',
      payload: update
    })
  }
  
  private createGameEvent(type: GameEvent['type'], data: any) {
    // Store event for later broadcast
    // In a real implementation, this would be stored and sent with state updates
    console.log('Game event:', type, data)
  }
  
  private processGameEvent(event: GameEvent) {
    // Process game events (show notifications, update UI, etc.)
    console.log('Processing event:', event)
  }
}

// Export singleton instance
export const transport = new Transport()
