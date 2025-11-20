import { useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Stars } from '@react-three/drei'
import { Galaxy } from './Galaxy'
import { Planet } from './Planet'
import { AttackLine } from './AttackLine'
import { TerritorySector } from './TerritorySector'
import { useGameStore } from '../store/gameStore'
import { HUD } from './HUD'
import { supabase } from '../services/supabase'
import type { TerritorySector as TerritorySectorType, CombatLog } from '../services/supabase'
import { territoryControl } from '../game/TerritoryControl'

export function Game({ onGameComplete, onPlayerEliminated }: { onGameComplete?: () => void; onPlayerEliminated?: () => void }) {
  const planets = useGameStore(state => state.planets)
  const attacks = useGameStore(state => state.attacks)
  const territorySectors = useGameStore(state => state.territorySectors)
  const playerColors = useGameStore(state => state.playerColors)
  const cameraPosition = useGameStore(state => state.cameraPosition)
  const player = useGameStore(state => state.player)
  const currentGame = useGameStore(state => state.currentGame)
  const setPlanets = useGameStore(state => state.setPlanets)
  const setAttacks = useGameStore(state => state.setAttacks)
  const setTerritorySectors = useGameStore(state => state.setTerritorySectors)
  const setPlayerColors = useGameStore(state => state.setPlayerColors)
  const setTerritoryStats = useGameStore(state => state.setTerritoryStats)
  const setPlayer = useGameStore(state => state.setPlayer)
  const setCurrentTick = useGameStore(state => state.setCurrentTick)
  const setCombatLogs = useGameStore(state => state.setCombatLogs)
  const setRecentCombatLog = useGameStore(state => state.setRecentCombatLog)
  const setStructures = useGameStore(state => state.setStructures)
  const territoryDebugMode = useGameStore(state => state.territoryDebugMode)

  const mapAttackRowToAttack = useCallback((a: any, now: number, latestTick: number) => {
    const state = useGameStore.getState()
    const planetsState = state.planets
    const arrivalMs = new Date(a.arrival_at).getTime()
    const ticksFromNow = Math.max(0, Math.ceil((arrivalMs - now) / 100))
    const retreating = a.status === 'retreating'

    // Check if this attack already exists in state to avoid visual snapping
    const existingAttack = state.attacks.find(existing => existing.id === a.id)
    const statusChanged = existingAttack && existingAttack.retreating !== retreating

    let startTick: number
    let arrivalTick: number

    // Reuse existing tick values if attack is already tracked and status hasn't changed
    if (existingAttack && !statusChanged) {
      startTick = existingAttack.startTick
      arrivalTick = existingAttack.arrivalTick
    } else {
      // Compute new ticks for new attacks or when status changes (e.g., in_transit -> retreating)
      startTick = latestTick
      arrivalTick = latestTick + ticksFromNow

      if (retreating) {
        const sourcePlanet = planetsState.find(p => p.id === a.source_planet_id)
        const targetPlanet = planetsState.find(p => p.id === a.target_planet_id)

        if (sourcePlanet && targetPlanet) {
          const dx = sourcePlanet.x_pos - targetPlanet.x_pos
          const dy = sourcePlanet.y_pos - targetPlanet.y_pos
          const dz = sourcePlanet.z_pos - targetPlanet.z_pos
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
          const returnTravelMs = Math.ceil(distance / 2) * 100
          const returnTicks = Math.max(1, Math.ceil(returnTravelMs / 100))
          arrivalTick = startTick + returnTicks
        } else {
          arrivalTick = startTick + Math.max(1, ticksFromNow || 10)
        }
      }
    }

    const attack = {
      id: a.id,
      attackerId: a.attacker_id,
      sourcePlanetId: a.source_planet_id,
      targetPlanetId: a.target_planet_id,
      troops: a.troops,
      startTick,
      arrivalTick,
      retreating
    }
    
    // Log attack mapping
    const currentTick = latestTick
    const progress = ((currentTick - startTick) / (arrivalTick - startTick) * 100).toFixed(1)
    console.log('[ATTACK] Mapped attack:', {
      id: attack.id,
      status: attack.retreating ? 'retreating' : 'in_transit',
      startTick,
      arrivalTick,
      progress: progress + '%',
      reusedExisting: !!(existingAttack && !statusChanged)
    })
    
    return attack
  }, [])

  const syncTerritoryState = useCallback((sectors: TerritorySectorType[]) => {
    const previousCount = useGameStore.getState().territorySectors.length
    console.log('[TERRITORY] Syncing', sectors.length, 'sectors, previous count:', previousCount)
    
    setTerritorySectors(sectors)

    const state = useGameStore.getState()
    const ownerIds = new Set<string>()
    state.playerColors.forEach((_, playerId) => ownerIds.add(playerId))
    if (state.player?.id) {
      ownerIds.add(state.player.id)
    }

    sectors.forEach(sector => {
      if (sector.owner_id) {
        ownerIds.add(sector.owner_id)
      }
    })

    const statsMap = new Map<string, { sectorCount: number; percentage: number }>()
    ownerIds.forEach(playerId => {
      const sectorCount = territoryControl.getSectorCount(playerId)
      const percentage = territoryControl.calculateControlPercentage(playerId)
      statsMap.set(playerId, { sectorCount, percentage })
    })

    setTerritoryStats(statsMap)
    console.log('[TERRITORY] Stats updated:', Array.from(statsMap.entries()).map(([id, s]) => ({ id, ...s })))
  }, [setTerritorySectors, setTerritoryStats])

  // Poll Supabase for game state updates
  useEffect(() => {
    if (!currentGame || !player) return

    const pollGameState = async () => {
      try {
        // Fetch planets
        const { data: systemsData, error: planetsError } = await supabase
          .from('systems')
          .select('*')
          .eq('game_id', currentGame.id)
        
        if (planetsError) {
          console.error('[CLIENT] Error fetching planets:', planetsError)
        }
        
        if (systemsData) {
          setPlanets(systemsData)
        }
      } catch (error) {
        console.error('[CLIENT] Failed to fetch planets:', error)
      }

      // Fetch attacks
      const { data: attacksData } = await supabase
        .from('planet_attacks')
        .select('*')
        .eq('game_id', currentGame.id)
        .in('status', ['in_transit', 'retreating'])
      
      if (attacksData) {
        const previousAttackCount = useGameStore.getState().attacks.length
        if (attacksData.length !== previousAttackCount) {
          console.log(`[ATTACK] Attack count changed: ${previousAttackCount} -> ${attacksData.length}`)
        }
        
        // Log attacks that should have arrived
        const arrivedAttacks = attacksData.filter(a => new Date(a.arrival_at).getTime() <= Date.now())
        if (arrivedAttacks.length > 0) {
          console.log(`[ATTACK] ${arrivedAttacks.length} attacks should have arrived and been processed`)
        }
        
        const now = Date.now()
        const latestTick = useGameStore.getState().currentTick
        setAttacks(attacksData.map(a => mapAttackRowToAttack(a, now, latestTick)))
      }

      // Fetch territory
      const { data: territorySectorsData, error: territorySectorsError } = await supabase
        .from('territory_sectors')
        .select('*')
        .eq('game_id', currentGame.id)
      
      if (territorySectorsError) {
        console.error('[TERRITORY] Error fetching sectors:', territorySectorsError)
      }
      
      if (territorySectorsData) {
        console.log('[TERRITORY] Fetched', territorySectorsData.length, 'sectors from database')
        syncTerritoryState(territorySectorsData)
      }

      const { data: gamePlayersData } = await supabase
        .from('game_players')
        .select('player_id, empire_color')
        .eq('game_id', currentGame.id)

      if (gamePlayersData) {
        const colorMap = new Map(gamePlayersData.map(playerEntry => [playerEntry.player_id, playerEntry.empire_color]))
        setPlayerColors(colorMap)
      }

      // Check game status for completion
      const { data: gameStatusData } = await supabase
        .from('games')
        .select('status, winner_id')
        .eq('id', currentGame.id)
        .single()
      
      if (gameStatusData && gameStatusData.status === 'completed') {
        // Game is complete, trigger callback and stop polling
        if (onGameComplete) {
          onGameComplete()
        }
        return // Stop further polling in this iteration
      }

      // Check if current player is eliminated
      if (player) {
        const { data: playerGameStatus } = await supabase
          .from('game_players')
          .select('is_eliminated, is_alive')
          .eq('game_id', currentGame.id)
          .eq('player_id', player.id)
          .single()
        
        if (playerGameStatus && playerGameStatus.is_eliminated && gameStatusData?.status === 'active') {
          // Player is eliminated while game is still active
          if (onPlayerEliminated) {
            onPlayerEliminated()
          }
        }
      }

      // Fetch player resources
      const { data: playerData } = await supabase
        .from('players')
        .select('*')
        .eq('id', player.id)
        .single()
      
      if (playerData) {
        setPlayer(playerData)
      }

      // Fetch structures
      const { data: structuresData } = await supabase
        .from('structures')
        .select('*')
        .eq('game_id', currentGame.id)
      
      if (structuresData) {
        setStructures(structuresData)
      }

      try {
        const { data: tickData, error: tickError } = await supabase
          .from('game_ticks')
          .select('tick_number')
          .eq('game_id', currentGame.id)
          .single()

        if (tickError) {
          console.error('[CLIENT] Error fetching tick number:', tickError)
        }

        if (tickData) {
          const previousTick = useGameStore.getState().currentTick
          if (tickData.tick_number !== previousTick) {
            console.log(`[CLIENT] Tick updated: ${previousTick} -> ${tickData.tick_number}`)
            setCurrentTick(tickData.tick_number)
          }
        } else {
          console.warn('[CLIENT] No tick data found for game')
        }
      } catch (error) {
        console.error('[CLIENT] Failed to fetch tick data:', error)
      }

      // Fetch recent combat logs (last 10)
      const { data: combatLogsData } = await supabase
        .from('combat_logs')
        .select('*')
        .eq('game_id', currentGame.id)
        .order('occurred_at', { ascending: false })
        .limit(10)
      
      if (combatLogsData) {
        setCombatLogs(combatLogsData)
        // Set most recent as recentCombatLog if it's new
        if (combatLogsData.length > 0) {
          const latest = combatLogsData[0]
          const currentRecent = useGameStore.getState().recentCombatLog
          if (!currentRecent || latest.id !== currentRecent.id) {
            setRecentCombatLog(latest)
            // Clear after 5 seconds for animation
            setTimeout(() => setRecentCombatLog(null), 5000)
          }
        }
      }
    }

    // Initial fetch
    pollGameState()

    // Poll every second
    const interval = setInterval(pollGameState, 1000)

    return () => clearInterval(interval)
  }, [currentGame, player, setPlanets, setAttacks, setPlayer, setCurrentTick, syncTerritoryState, setPlayerColors, setCombatLogs, setRecentCombatLog, setStructures, mapAttackRowToAttack, onGameComplete])

  // Trigger server-side game tick via Edge Function
  useEffect(() => {
    if (!currentGame) return

    let tickCount = 0
    const triggerGameTick = async () => {
      try {
        tickCount++
        
        // Log every 10th tick to confirm triggers are working
        if (tickCount % 10 === 0) {
          console.log(`[CLIENT] Triggering game tick #${tickCount} for game ${currentGame.id}`)
        }
        
        // Check if game is still active before triggering tick
        const { data: gameStatus, error: statusError } = await supabase
          .from('games')
          .select('status')
          .eq('id', currentGame.id)
          .single()
        
        if (statusError) {
          console.error('[CLIENT] Error checking game status:', statusError)
          return
        }
        
        if (!gameStatus || gameStatus.status !== 'active') {
          if (gameStatus?.status) {
            console.warn(`[CLIENT] Game status is '${gameStatus.status}', not triggering tick`)
          }
          return // Don't trigger tick if game isn't active
        }

        const { data, error } = await supabase.functions.invoke('game-tick', {
          body: { gameId: currentGame.id }
        })
        
        if (error) {
          console.error('[CLIENT] Error triggering game tick:', error)
          console.error('[CLIENT] Full error response:', JSON.stringify(error))
        } else if (data) {
          // Log successful tick responses occasionally
          if (tickCount % 10 === 0) {
            console.log('[CLIENT] Tick response:', data)
          }
        }
      } catch (error) {
        console.error('[CLIENT] Failed to trigger game tick:', error)
      }
    }

    // Trigger tick every 100ms (10 ticks per second)
    const interval = setInterval(triggerGameTick, 100)

    return () => clearInterval(interval)
  }, [currentGame])

  // Add presence tracking for active game
  useEffect(() => {
    if (!currentGame || !player) return

    const presenceChannel = supabase.channel(`game-presence:${currentGame.id}`, {
      config: {
        presence: {
          key: player.id
        }
      }
    })

    let heartbeatInterval: number | null = null

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState<{ player_id: string; username: string }>()
        const activePlayerIds = Object.values(state).flatMap(group => group.map(p => p.player_id))
        console.log('[GAME PRESENCE] Active players:', activePlayerIds.length)
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const leftPlayerIds = leftPresences.map((p: any) => p.player_id)
        console.log('[GAME PRESENCE] Players left:', leftPlayerIds)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await presenceChannel.track({
              player_id: player.id,
              username: player.username
            })

            // Mark player as active in database
            await supabase
              .from('game_players')
              .update({ is_active: true, last_seen: new Date().toISOString() })
              .eq('game_id', currentGame.id)
              .eq('player_id', player.id)

            // Start heartbeat interval (update last_seen every 30 seconds)
            heartbeatInterval = window.setInterval(async () => {
              try {
                await supabase
                  .from('game_players')
                  .update({ last_seen: new Date().toISOString() })
                  .eq('game_id', currentGame.id)
                  .eq('player_id', player.id)
              } catch (error) {
                console.error('[GAME PRESENCE] Error updating heartbeat:', error)
              }
            }, 30000) // 30 seconds
          } catch (error) {
            console.error('[GAME PRESENCE] Error tracking presence:', error)
          }
        }
      })

    return () => {
      // Clear heartbeat interval
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }

      // Mark player as inactive in database
      void supabase
        .from('game_players')
        .update({ is_active: false })
        .eq('game_id', currentGame.id)
        .eq('player_id', player.id)

      supabase.removeChannel(presenceChannel)
    }
  }, [currentGame, player])

  // Add beforeunload handler to mark player inactive when browser closes
  useEffect(() => {
    if (!currentGame || !player) return

    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable delivery when tab closes
      // Standard async Supabase calls may be cancelled by the browser
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const beaconUrl = `${supabaseUrl}/functions/v1/mark-inactive`
      const payload = JSON.stringify({ 
        gameId: currentGame.id, 
        playerId: player.id 
      })
      
      // sendBeacon is designed for reliable delivery during page unload
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' })
        navigator.sendBeacon(beaconUrl, blob)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [currentGame, player])

  // Subscribe to real-time updates for immediate changes
  useEffect(() => {
    if (!currentGame) return

    const channel = supabase.channel(`game:${currentGame.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'systems',
          filter: `game_id=eq.${currentGame.id}`
        },
        () => {
          // Re-fetch all systems on any change
          supabase
            .from('systems')
            .select('*')
            .eq('game_id', currentGame.id)
            .then(({ data }) => {
              if (data) setPlanets(data)
            })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'planet_attacks',
          filter: `game_id=eq.${currentGame.id}`
        },
        () => {
          // Re-fetch attacks on any change
          console.log('[ATTACK] Received planet_attacks update via subscription, fetching latest attacks')
          supabase
            .from('planet_attacks')
            .select('*')
            .eq('game_id', currentGame.id)
            .in('status', ['in_transit', 'retreating'])
            .then(({ data }) => {
              if (data) {
                const now = Date.now()
                const latestTick = useGameStore.getState().currentTick
                setAttacks(data.map(a => mapAttackRowToAttack(a, now, latestTick)))
              }
            })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_ticks',
          filter: `game_id=eq.${currentGame.id}`
        },
        () => {
          console.log('[CLIENT] Received game_ticks update via subscription')
          supabase
            .from('game_ticks')
            .select('tick_number')
            .eq('game_id', currentGame.id)
            .single()
            .then(({ data, error }) => {
              if (error) {
                console.error('[CLIENT] Error in subscription fetch:', error)
              }
              if (data) {
                const previousTick = useGameStore.getState().currentTick
                console.log(`[CLIENT] Subscription tick update: ${previousTick} -> ${data.tick_number}`)
                setCurrentTick(data.tick_number)
              }
            })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'territory_sectors',
          filter: `game_id=eq.${currentGame.id}`
        },
        () => {
          console.log('[TERRITORY] Received territory_sectors update via subscription')
          supabase
            .from('territory_sectors')
            .select('*')
            .eq('game_id', currentGame.id)
            .then(({ data }) => {
              if (data) {
                syncTerritoryState(data)
              }
            })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'combat_logs',
          filter: `game_id=eq.${currentGame.id}`
        },
        (payload) => {
          // Add new combat log to the list
          const newLog = payload.new as CombatLog
          const currentLogs = useGameStore.getState().combatLogs
          setCombatLogs([newLog, ...currentLogs].slice(0, 10))
          setRecentCombatLog(newLog)
          setTimeout(() => setRecentCombatLog(null), 5000)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'structures',
          filter: `game_id=eq.${currentGame.id}`
        },
        () => {
          // Re-fetch structures on any change
          supabase
            .from('structures')
            .select('*')
            .eq('game_id', currentGame.id)
            .then(({ data }) => {
              if (data) setStructures(data)
            })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentGame, setPlanets, setAttacks, setCurrentTick, syncTerritoryState, setCombatLogs, setRecentCombatLog, setStructures, mapAttackRowToAttack])
  
  return (
    <div className="w-full h-screen relative">
      {/* 3D Scene */}
      <Canvas className="bg-black">
        <PerspectiveCamera
          makeDefault
          position={[cameraPosition.x, cameraPosition.y, cameraPosition.z]}
          fov={75}
        />
        
        {/* Controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={10}
          maxDistance={500}
        />
        
        {/* Lighting */}
        <ambientLight intensity={0.2} />
        <pointLight position={[0, 0, 0]} intensity={1} />
        
        {/* Background */}
        <Stars
          radius={1000}
          depth={500}
          count={5000}
          factor={4}
          saturation={0}
          fade
        />
        
        {/* Galaxy background */}
        <Galaxy />
        
        {/* Territory sectors (OpenFront-style expanding territory) */}
        {territorySectors.map((sector) => (
          <TerritorySector 
            key={`${sector.x_pos}-${sector.y_pos}-${sector.z_pos}`}
            sector={sector}
            playerColors={playerColors}
            debug={territoryDebugMode}
          />
        ))}
        
        {/* Planets (OpenFront "tiles") */}
        {planets.map(planet => (
          <Planet key={planet.id} planet={planet} />
        ))}
        
        {/* Attack lines (troops in transit) */}
        {attacks.map(attack => (
          <AttackLine key={attack.id} attack={attack} planets={planets} />
        ))}
      </Canvas>
      
      {/* UI Overlay */}
      <HUD />
    </div>
  )
}
