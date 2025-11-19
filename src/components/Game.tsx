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

export function Game() {
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

  const mapAttackRowToAttack = useCallback((a: any, now: number, latestTick: number) => {
    const state = useGameStore.getState()
    const planetsState = state.planets
    const arrivalMs = new Date(a.arrival_at).getTime()
    const ticksFromNow = Math.max(0, Math.ceil((arrivalMs - now) / 100))
    const retreating = a.status === 'retreating'

    let startTick = latestTick
    let arrivalTick = latestTick + ticksFromNow

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

    return {
      id: a.id,
      attackerId: a.attacker_id,
      sourcePlanetId: a.source_planet_id,
      targetPlanetId: a.target_planet_id,
      troops: a.troops,
      startTick,
      arrivalTick,
      retreating
    }
  }, [])

  const syncTerritoryState = useCallback((sectors: TerritorySectorType[]) => {
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
  }, [setTerritorySectors, setTerritoryStats])

  // Poll Supabase for game state updates
  useEffect(() => {
    if (!currentGame || !player) return

    const pollGameState = async () => {
      // Fetch planets
      const { data: systemsData } = await supabase
        .from('systems')
        .select('*')
        .eq('game_id', currentGame.id)
      
      if (systemsData) {
        setPlanets(systemsData)
      }

      // Fetch attacks
      const { data: attacksData } = await supabase
        .from('planet_attacks')
        .select('*')
        .eq('game_id', currentGame.id)
        .in('status', ['in_transit', 'retreating'])
      
      if (attacksData) {
        const now = Date.now()
        const latestTick = useGameStore.getState().currentTick
        setAttacks(attacksData.map(a => mapAttackRowToAttack(a, now, latestTick)))
      }

      // Fetch territory
      const { data: territorySectorsData } = await supabase
        .from('territory_sectors')
        .select('*')
        .eq('game_id', currentGame.id)
      
      if (territorySectorsData) {
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

      const { data: tickData } = await supabase
        .from('game_ticks')
        .select('tick_number')
        .eq('game_id', currentGame.id)
        .single()

      if (tickData) {
        setCurrentTick(tickData.tick_number)
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
  }, [currentGame, player, setPlanets, setAttacks, setPlayer, setCurrentTick, syncTerritoryState, setPlayerColors, setCombatLogs, setRecentCombatLog, setStructures, mapAttackRowToAttack])

  // Trigger server-side game tick via Edge Function
  useEffect(() => {
    if (!currentGame) return

    const triggerGameTick = async () => {
      try {
        const { error } = await supabase.functions.invoke('game-tick', {
          body: { gameId: currentGame.id }
        })
        
        if (error) {
          console.error('Error triggering game tick:', error)
        }
      } catch (error) {
        console.error('Failed to trigger game tick:', error)
      }
    }

    // Trigger tick every 100ms (10 ticks per second)
    const interval = setInterval(triggerGameTick, 100)

    return () => clearInterval(interval)
  }, [currentGame])

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
          supabase
            .from('game_ticks')
            .select('tick_number')
            .eq('game_id', currentGame.id)
            .single()
            .then(({ data }) => {
              if (data) setCurrentTick(data.tick_number)
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
