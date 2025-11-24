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
  const setTickHealth = useGameStore(state => state.setTickHealth)
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
    
    // Log attack mapping (always run for debugging)
    const currentTick = latestTick
    const progress = ((currentTick - startTick) / (arrivalTick - startTick) * 100).toFixed(1)
    console.log('[GAME] Mapped attack:', {
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
    // console.log('[TERRITORY] Syncing', sectors.length, 'sectors, previous count:', previousCount)
    
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
    // console.log('[TERRITORY] Stats updated:', Array.from(statsMap.entries()).map(([id, s]) => ({ id, ...s })))
  }, [setTerritorySectors, setTerritoryStats])

  // Set player context once when player is available
  useEffect(() => {
    if (!player) return

    const setPlayerContext = async () => {
      try {
        await supabase.rpc('set_player_context', { player_id: player.id })
        console.log('[CLIENT] Player context set for', player.id)
      } catch (error) {
        console.error('[CLIENT] Failed to set player context:', error)
        // Retry after delay on failure
        setTimeout(setPlayerContext, 30000) // Retry every 30 seconds if needed
      }
    }

    setPlayerContext()
    const contextRefresh = setInterval(setPlayerContext, 300000) // Refresh every 5 minutes

    return () => clearInterval(contextRefresh)
  }, [player])

  // Poll Supabase for game state updates
  useEffect(() => {
    if (!currentGame || !player) return

    // One-time environment variable check
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      console.error('[CLIENT] Missing Supabase environment variables. Check .env file.')
    }

    const pollGameState = async () => {
      try {
        // Execute independent queries in parallel
        const [
          { data: systemsData, error: planetsError },
          { data: attacksData },
          { data: territorySectorsData, error: territorySectorsError },
          { data: gamePlayersData },
          { data: gameStatusData },
          { data: playerData },
          { data: structuresData },
          { data: tickData, error: tickError },
          { data: combatLogsData }
        ] = await Promise.all([
          // Systems data
          supabase
            .from('systems')
            .select('*')
            .eq('game_id', currentGame.id),
          
          // Attacks data
          supabase
            .from('planet_attacks')
            .select('*')
            .eq('game_id', currentGame.id)
            .in('status', ['in_transit', 'retreating']),
          
          // Territory sectors
          supabase
            .from('territory_sectors')
            .select('*')
            .eq('game_id', currentGame.id),
          
          // Player colors
          supabase
            .from('game_players')
            .select('player_id, empire_color')
            .eq('game_id', currentGame.id),
          
          // Game status
          supabase
            .from('games')
            .select('status, winner_id')
            .eq('id', currentGame.id)
            .single(),
          
          // Player resources
          supabase
            .from('players')
            .select('*')
            .eq('id', player.id)
            .single(),
          
          // Structures
          supabase
            .from('structures')
            .select('*')
            .eq('game_id', currentGame.id),
          
          // Tick data
          supabase
            .from('game_ticks')
            .select('tick_number, last_tick_at')
            .eq('game_id', currentGame.id)
            .single(),
          
          // Combat logs (limited to 10 most recent)
          supabase
            .from('combat_logs')
            .select('*')
            .eq('game_id', currentGame.id)
            .order('occurred_at', { ascending: false })
            .limit(10)
        ])

        // Process systems data
        if (planetsError) {
          console.error('[CLIENT] Error fetching planets:', planetsError)
        } else if (systemsData) {
          setPlanets(systemsData)
        }

        // Process attacks data
        if (attacksData) {
          const previousAttackCount = useGameStore.getState().attacks.length
          if (attacksData.length !== previousAttackCount) {
            console.log(`[GAME] Attack count changed: ${previousAttackCount} -> ${attacksData.length}`)
          }
          
          const now = Date.now()
          const latestTick = useGameStore.getState().currentTick
          setAttacks(attacksData.map(a => mapAttackRowToAttack(a, now, latestTick)))
        }

        // Process territory sectors
        if (territorySectorsError) {
          console.error('[TERRITORY] Error fetching sectors:', territorySectorsError)
        } else if (territorySectorsData) {
          syncTerritoryState(territorySectorsData)
        }

        // Process player colors
        if (gamePlayersData) {
          const colorMap = new Map(gamePlayersData.map(playerEntry => [playerEntry.player_id, playerEntry.empire_color]))
          setPlayerColors(colorMap)
        }

        // Process game status
        if (gameStatusData) {
          if (gameStatusData.status === 'completed') {
            if (onGameComplete) onGameComplete()
            return // Stop further processing if game is complete
          }

          // Check if current player is eliminated
          if (player) {
            const { data: playerGameStatus } = await supabase
              .from('game_players')
              .select('is_eliminated, is_alive')
              .eq('game_id', currentGame.id)
              .eq('player_id', player.id)
              .single()
            
            if (playerGameStatus?.is_eliminated && gameStatusData.status === 'active') {
              if (onPlayerEliminated) onPlayerEliminated()
            }
          }
        }

        // Process player resources
        if (playerData) {
          const oldResources = useGameStore.getState().resources
          console.log('[CLIENT] Resources updated:', {
            playerId: player.id,
            credits: { old: Number(oldResources.gold), new: playerData.credits, delta: playerData.credits - Number(oldResources.gold) },
            energy: { old: oldResources.energy, new: playerData.energy, delta: playerData.energy - oldResources.energy },
            minerals: { old: oldResources.minerals, new: playerData.minerals, delta: playerData.minerals - oldResources.minerals }
          })
          setPlayer(playerData)
        }

        // Process structures
        if (structuresData) {
          setStructures(structuresData)
        }

        // Process tick data
        if (tickError) {
          console.error('[CLIENT] Error fetching tick number:', tickError)
        } else if (tickData) {
          const previousTick = useGameStore.getState().currentTick
          
          if (tickData.last_tick_at) {
            const lastTickTime = new Date(tickData.last_tick_at).getTime()
            const staleness = Date.now() - lastTickTime
            if (staleness > 5000) {
              console.warn(`[CLIENT] Tick data is stale (last update: ${tickData.last_tick_at}). Game tick function may not be processing. Staleness: ${staleness}ms`)
              setTickHealth(true)
            } else {
              setTickHealth(false)
            }
          }
          
          if (tickData.tick_number !== previousTick) {
            setCurrentTick(tickData.tick_number)
            setTickHealth(false)
          }
        } else {
          console.error(`[CLIENT] No tick data found for game ${currentGame.id}. This may indicate the game-tick Edge Function is not running or RLS policies are blocking access. Check Supabase logs.`)
        }

        // Process combat logs
        if (combatLogsData) {
          setCombatLogs(combatLogsData)
          if (combatLogsData.length > 0) {
            const latest = combatLogsData[0]
            const currentRecent = useGameStore.getState().recentCombatLog
            if (!currentRecent || latest.id !== currentRecent.id) {
              setRecentCombatLog(latest)
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
  }, [currentGame, player, setPlanets, setAttacks, setPlayer, setCurrentTick, setTickHealth, syncTerritoryState, setPlayerColors, setCombatLogs, setRecentCombatLog, setStructures, mapAttackRowToAttack, onGameComplete, onPlayerEliminated])

  // Trigger server-side game tick via Edge Function (host only)
  useEffect(() => {
    if (!currentGame || !player) return

    let tickCount = 0
    let isHost = false
    let hostCheckAttempts = 0
    const MAX_HOST_CHECK_ATTEMPTS = 5

    // Check if current player is the host (placement_order = 1)
    const checkIfHost = async () => {
      try {
        const { data: hostData, error } = await supabase
          .from('game_players')
          .select('player_id')
          .eq('game_id', currentGame.id)
          .eq('placement_order', 1)
          .single()

        if (error) throw error
        
        const newIsHost = hostData.player_id === player.id
        if (newIsHost !== isHost) {
          isHost = newIsHost
          console.log(`[CLIENT] ${isHost ? 'Host' : 'Non-host'} mode activated`)
        }
        return isHost
      } catch (error) {
        console.error('[CLIENT] Error checking host status:', error)
        hostCheckAttempts++
        if (hostCheckAttempts < MAX_HOST_CHECK_ATTEMPTS) {
          // Retry with exponential backoff
          setTimeout(checkIfHost, 1000 * Math.pow(2, hostCheckAttempts))
        }
        return false
      }
    }

    const triggerGameTick = async () => {
      try {
        tickCount++
        
        // Only proceed if we've confirmed this client is the host
        if (!isHost) {
          // Only log occasionally to reduce noise
          if (tickCount % 30 === 0) { // Every ~3 seconds at 10Hz
            console.log('[CLIENT] Not triggering tick - not the host')
          }
          return
        }
        
        // Log every 10th tick to confirm triggers are working
        if (tickCount % 10 === 0) {
          console.log(`[HOST] Triggering game tick #${tickCount} for game ${currentGame.id} at ${new Date().toISOString()}`)
        }
        
        // Log first tick
        if (tickCount === 1) {
          console.log(`[HOST] First game tick triggered for game ${currentGame.id}`)
        }
        
        // Check if game is still active before triggering tick
        const { data: gameStatus, error: statusError } = await supabase
          .from('games')
          .select('status')
          .eq('id', currentGame.id)
          .single()
        
        if (statusError) {
          console.error('[HOST] Error checking game status:', statusError)
          return
        }
        
        if (!gameStatus || gameStatus.status !== 'active') {
          if (gameStatus?.status) {
            console.warn(`[HOST] Game status is '${gameStatus.status}', not triggering tick`)
          }
          return // Don't trigger tick if game isn't active
        }

        const { data, error } = await supabase.functions.invoke('game-tick', {
          body: { gameId: currentGame.id, playerId: player.id }
        })
        
        if (error) {
          console.error('[CLIENT] Error triggering game tick:', error)
          // console.error('[CLIENT] Full error response:', JSON.stringify(error))
          
          // CORS-specific error check
          const errorMessage = error?.message || error?.toString() || ''
          if (errorMessage.includes('CORS') || errorMessage.includes('Access-Control-Allow-Origin')) {
            console.error('[CLIENT] CORS ERROR: Edge Function is blocking requests. Ensure game-tick/index.ts includes CORS headers.')
            console.error('[CLIENT] See database/README.md for CORS troubleshooting steps.')
          }
          
          // RLS policy error check
          if ((error as any)?.status === 406 || (error as any)?.status === 400) {
            console.error('[CLIENT] RLS POLICY ERROR: Database policies may be blocking access. Run fix_cors_and_rls_policies.sql migration.')
          }
        } else if (data) {
          // Track first successful tick
          if (!(window as any).__firstTickSuccess) {
            console.log('[CLIENT] ✅ Game tick system operational. CORS and RLS policies working correctly.')
            ;(window as any).__firstTickSuccess = true
          }
          // Log successful tick responses occasionally
          if (tickCount % 10 === 0) {
            console.log(`[CLIENT] Game tick #${tickCount} completed successfully:`, data)
          }
          /* if (tickCount % 10 === 0) {
            console.log('[CLIENT] Tick response:', data)
          } */
        }
      } catch (error) {
        console.error('[CLIENT] Failed to trigger game tick:', error)
      }
    }

    // Initial host check
    checkIfHost()

    // Check host status periodically in case of reconnection
    const hostCheckInterval = setInterval(checkIfHost, 30000) // Every 30 seconds
    
    // Start tick interval (only active if this client is the host)
    const tickInterval = setInterval(triggerGameTick, 100) // 10Hz ticks

    return () => {
      clearInterval(hostCheckInterval)
      clearInterval(tickInterval)
    }
  }, [currentGame, player])

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
        // console.log('[GAME PRESENCE] Active players:', activePlayerIds.length)
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const leftPlayerIds = leftPresences.map((p: any) => p.player_id)
        // console.log('[GAME PRESENCE] Players left:', leftPlayerIds)
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
          console.log('[GAME] Realtime update: planet_attacks table changed')
          supabase
            .from('planet_attacks')
            .select('*')
            .eq('game_id', currentGame.id)
            .in('status', ['in_transit', 'retreating'])
            .then(({ data }) => {
              if (data) {
                // Validate attack data - check if planet IDs exist in store
                const currentPlanets = useGameStore.getState().planets
                data.forEach(attack => {
                  const sourceExists = currentPlanets.some(p => p.id === attack.source_planet_id)
                  const targetExists = currentPlanets.some(p => p.id === attack.target_planet_id)
                  
                  if (!sourceExists || !targetExists) {
                    console.log('[GAME] Invalid attack data:', {
                      attackId: attack.id,
                      missingSource: !sourceExists ? attack.source_planet_id : null,
                      missingTarget: !targetExists ? attack.target_planet_id : null
                    })
                  }
                })
                
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
          // console.log('[CLIENT] Received game_ticks update via subscription')
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
                if (import.meta.env.DEV) {
                  console.log(`[CLIENT] Subscription tick update: ${previousTick} -> ${data.tick_number}`)
                }
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
          // console.log('[TERRITORY] Received territory_sectors update via subscription')
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[GAME] planet_attacks subscription active')
        }
      })

    return () => {
      console.log('[GAME] planet_attacks subscription removed')
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
