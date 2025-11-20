import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { gameService } from '../services/gameService'
import { useGameStore } from '../store/gameStore'

interface GameLobbyProps {
  onStartGame: () => void
}

interface PlayerInLobby {
  id: string
  username: string
  empire_color: string
  is_alive: boolean
  is_ready: boolean
}

export function GameLobby({ onStartGame }: GameLobbyProps) {
  const currentGame = useGameStore(state => state.currentGame)
  const player = useGameStore(state => state.player)
  const setGame = useGameStore(state => state.setGame)
  const [players, setPlayers] = useState<PlayerInLobby[]>([])
  const [isHost, setIsHost] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const hasEnteredRef = useRef(false)
  const hostDepartureHandledRef = useRef(false)
  const playersRef = useRef<PlayerInLobby[]>([])
  const hostPresenceConfirmedRef = useRef(false)
  const heartbeatIntervalRef = useRef<number | null>(null)

  const currentHostId = players[0]?.id
  const playerId = player?.id
  const playerUsername = player?.username

  useEffect(() => {
    hasEnteredRef.current = false
  }, [currentGame?.id])

  const loadPlayers = useCallback(async () => {
    if (!currentGame) return

    try {
      const { data, error } = await supabase
        .from('game_players')
        .select(`
          player_id,
          empire_color,
          is_alive,
          placement_order,
          players (
            id,
            username
          )
          ,
          is_ready
        `)
        .eq('game_id', currentGame.id)
        .order('placement_order', { ascending: true })

      if (error) throw error

      const playerList: PlayerInLobby[] = data.map((gp: any) => ({
        id: gp.players.id,
        username: gp.players.username,
        empire_color: gp.empire_color,
        is_alive: gp.is_alive,
        is_ready: gp.is_ready ?? false
      }))

      setPlayers(playerList)
      
      // Check if current player is the host (first player)
      if (playerList.length > 0 && playerList[0].id === player?.id) {
        setIsHost(true)
      } else {
        setIsHost(false)
      }
    } catch (error) {
      console.error('Error loading players:', error)
      setIsHost(false)
    }
  }, [currentGame, player?.id])

  useEffect(() => {
    playersRef.current = players
  }, [players])

  useEffect(() => {
    hostDepartureHandledRef.current = false
    hostPresenceConfirmedRef.current = false
  }, [currentGame?.id, currentHostId])

  const handleHostDeparture = useCallback(async () => {
    if (!currentGame) return

    const currentPlayers = playersRef.current
    const hostId = currentPlayers[0]?.id

    if (!hostId || hostDepartureHandledRef.current) return

    hostDepartureHandledRef.current = true

    try {
      const { error: removeHostError } = await supabase
        .from('game_players')
        .delete()
        .eq('game_id', currentGame.id)
        .eq('player_id', hostId)

      if (removeHostError) throw removeHostError

      const { data: remainingPlayers, error: remainingPlayersError } = await supabase
        .from('game_players')
        .select('player_id')
        .eq('game_id', currentGame.id)
        .order('placement_order', { ascending: true })

      if (remainingPlayersError) throw remainingPlayersError

      if (!remainingPlayers || remainingPlayers.length === 0) {
        const { error: deleteGameError } = await supabase
          .from('games')
          .delete()
          .eq('id', currentGame.id)

        if (deleteGameError) throw deleteGameError

        setPlayers([])
        return
      }

      await Promise.all(
        remainingPlayers.map((gp: any, index: number) =>
          supabase
            .from('game_players')
            .update({ placement_order: index + 1 })
            .eq('game_id', currentGame.id)
            .eq('player_id', gp.player_id)
        )
      )

      await loadPlayers()
    } catch (error) {
      console.error('Error handling host departure:', error)
      hostDepartureHandledRef.current = false
    }
  }, [currentGame, loadPlayers])

  useEffect(() => {
    if (!currentGame || !playerId) return

    // Load players in the game
    loadPlayers()

    // Subscribe to player changes
    const channel = supabase.channel(`game_${currentGame.id}`, {
      config: {
        presence: {
          key: playerId
        }
      }
    })

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter: `game_id=eq.${currentGame.id}`
        },
        (payload) => {
          console.log('Player change:', payload)
          loadPlayers()
        }
      )
    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${currentGame.id}`
        },
        async (payload: any) => {
          console.log('Game status change:', payload)
          if (payload.new.status === 'active' && !hasEnteredRef.current) {
            const updatedGame = await gameService.getGameInfo(currentGame.id)
            if (updatedGame) {
              setGame(updatedGame)
            }
            hasEnteredRef.current = true
            onStartGame()
          }
        }
      )
    channel
      .on(
        'presence',
        { event: 'sync' },
        () => {
          const hostId = playersRef.current[0]?.id

          if (!hostId || hostDepartureHandledRef.current) return

          const state = channel.presenceState<{ player_id: string }>()
          const activeIds = Object.values(state).flatMap(group => group.map(p => p.player_id))

          if (activeIds.includes(hostId)) {
            hostPresenceConfirmedRef.current = true
            return
          }

          if (hostPresenceConfirmedRef.current) {
            handleHostDeparture()
          }
        }
      )
    channel
      .on(
        'presence',
        { event: 'leave' },
        ({ leftPresences }) => {
          const hostId = playersRef.current[0]?.id

          if (!hostId || hostDepartureHandledRef.current || !hostPresenceConfirmedRef.current) return

          if (leftPresences.some(p => p.player_id === hostId)) {
            handleHostDeparture()
          }
        }
      )

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          await channel.track({
            player_id: playerId,
            username: playerUsername ?? 'unknown'
          })
          
          // Mark player as active in database
          await supabase
            .from('game_players')
            .update({ is_active: true, last_seen: new Date().toISOString() })
            .eq('game_id', currentGame.id)
            .eq('player_id', playerId)
          
          // Start heartbeat interval (update last_seen every 30 seconds)
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current)
          }
          heartbeatIntervalRef.current = window.setInterval(async () => {
            try {
              await supabase
                .from('game_players')
                .update({ last_seen: new Date().toISOString() })
                .eq('game_id', currentGame.id)
                .eq('player_id', playerId)
            } catch (error) {
              console.error('Error updating heartbeat:', error)
            }
          }, 30000) // 30 seconds
        } catch (error) {
          console.error('Error tracking lobby presence:', error)
        }
      }
    })

    return () => {
      // Clear heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
      
      // Mark player as inactive in database
      if (currentGame?.id && playerId) {
        void supabase
          .from('game_players')
          .update({ is_active: false })
          .eq('game_id', currentGame.id)
          .eq('player_id', playerId)
      }
      
      supabase.removeChannel(channel)
    }
  }, [currentGame?.id, onStartGame, loadPlayers, playerId, playerUsername, handleHostDeparture])

  useEffect(() => {
    if (!currentGame) return

    const interval = setInterval(() => {
      loadPlayers()
    }, 3000)

    return () => {
      clearInterval(interval)
    }
  }, [currentGame, loadPlayers])

  useEffect(() => {
    if (!currentGame) return

    let cancelled = false

    const checkGameStatus = async () => {
      try {
        const updatedGame = await gameService.getGameInfo(currentGame.id)
        if (!cancelled && updatedGame?.status === 'active' && !hasEnteredRef.current) {
          setGame(updatedGame)
          hasEnteredRef.current = true
          onStartGame()
        }
      } catch (error) {
        console.error('Error checking game status:', error)
      }
    }

    const interval = setInterval(checkGameStatus, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [currentGame, onStartGame, setGame])

  // Add beforeunload handler to mark player inactive when browser closes
  useEffect(() => {
    if (!currentGame || !playerId) return

    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable delivery when tab closes
      // Standard async Supabase calls may be cancelled by the browser
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const beaconUrl = `${supabaseUrl}/functions/v1/mark-inactive`
      const payload = JSON.stringify({ 
        gameId: currentGame.id, 
        playerId: playerId 
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
      // Clear heartbeat interval on unmount
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
    }
  }, [currentGame, playerId])

  const currentPlayerReady = players.find(p => p.id === playerId)?.is_ready ?? false
  const allPlayersReady = players.length > 0 && players.every(p => p.is_ready)

  const handleStartGame = async () => {
    if (!currentGame || !isHost || !player) return

    if (!allPlayersReady) {
      alert('All players must ready up before starting the game.')
      return
    }

    setIsStarting(true)
    try {
      // Start game using gameService (OpenFront pattern)
      const success = await gameService.startGame(currentGame.id, player.id)
      
      if (!success) {
        throw new Error('Failed to start game')
      }

      // Update local store with fresh game info
      const updatedGame = await gameService.getGameInfo(currentGame.id)
      if (updatedGame) {
        setGame(updatedGame)
      }

      // Navigate host into the game immediately
      hasEnteredRef.current = true
      onStartGame()
    } catch (error) {
      console.error('Error starting game:', error)
      alert('Failed to start game: ' + (error as Error).message)
    } finally {
      setIsStarting(false)
    }
  }

  const handleToggleReady = async () => {
    if (!currentGame || !player) return

    try {
      await supabase
        .from('game_players')
        .update({ is_ready: !currentPlayerReady })
        .eq('game_id', currentGame.id)
        .eq('player_id', player.id)
    } catch (error) {
      console.error('Error toggling ready state:', error)
    }
  }

  const handleLeaveGame = async () => {
    if (!currentGame || !player) return

    try {
      await supabase
        .from('game_players')
        .delete()
        .eq('game_id', currentGame.id)
        .eq('player_id', player.id)

      // If host leaves, delete the game
      if (isHost) {
        await supabase
          .from('games')
          .delete()
          .eq('id', currentGame.id)
      }

      window.location.reload()
    } catch (error) {
      console.error('Error leaving game:', error)
    }
  }

  if (!currentGame) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white">
      Loading...
    </div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-black flex items-center justify-center">
      <div className="max-w-4xl w-full p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">{currentGame.name}</h1>
          <p className="text-gray-400">Waiting for players...</p>
          <p className="text-sm text-gray-500 mt-2">
            Game ID: {currentGame.id.slice(0, 8)}
          </p>
        </div>

        {/* Players List */}
        <div className="bg-gray-900/50 rounded-lg p-6 mb-8 border-2 border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">
            Players ({players.length} / {currentGame.max_players})
          </h2>
          
          <div className="space-y-3">
            {players.map((p, index) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-4 bg-gray-800 rounded-lg"
              >
                <div className="flex items-center space-x-4">
                  <div
                    className="w-12 h-12 rounded-full border-4"
                    style={{ backgroundColor: p.empire_color, borderColor: p.empire_color }}
                  />
                  <div>
                    <div className="text-white font-semibold">
                      {p.username}
                      {index === 0 && <span className="ml-2 text-xs text-yellow-400">HOST</span>}
                      {p.id === player?.id && <span className="ml-2 text-xs text-blue-400">YOU</span>}
                    </div>
                    <div className="text-sm text-gray-400">Commander #{index + 1}</div>
                  </div>
                </div>
                
                <div
                  className={`text-sm font-semibold ${p.is_ready ? 'text-green-400' : 'text-red-400'}`}
                >
                  {p.is_ready ? 'Ready' : 'Not Ready'}
                </div>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: currentGame.max_players - players.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center p-4 bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-700"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-full bg-gray-700" />
                  <div className="text-gray-500">Waiting for player...</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Game Settings */}
        <div className="bg-gray-900/50 rounded-lg p-6 mb-8 border-2 border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Game Settings</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Victory Condition:</span>
              <span className="text-white ml-2">{currentGame.victory_condition}% Control</span>
            </div>
            <div>
              <span className="text-gray-400">Game Speed:</span>
              <span className="text-white ml-2">Normal</span>
            </div>
            <div>
              <span className="text-gray-400">Map Size:</span>
              <span className="text-white ml-2">Medium (5x5x5)</span>
            </div>
            <div>
              <span className="text-gray-400">AI Difficulty:</span>
              <span className="text-white ml-2">None</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col md:flex-row md:space-x-4 space-y-4 md:space-y-0">
          <button
            onClick={handleToggleReady}
            className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-colors ${currentPlayerReady
              ? 'bg-red-700 hover:bg-red-600 text-white'
              : 'bg-green-700 hover:bg-green-600 text-white'
            }`}
          >
            {currentPlayerReady ? 'Unready' : 'Ready Up'}
          </button>

          <button
            onClick={handleLeaveGame}
            className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Leave Game
          </button>

          {isHost && (
            <button
              onClick={handleStartGame}
              disabled={isStarting || players.length < 1 || !allPlayersReady}
              className={`
                flex-1 px-6 py-3 rounded-lg transition-all font-bold
                ${isStarting || players.length < 1 || !allPlayersReady
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white'
                }
              `}
            >
              {isStarting ? 'Starting...' : '🚀 Start Game'}
            </button>
          )}

          {!isHost && (
            <div className="flex-1 px-6 py-3 bg-gray-800 text-gray-400 rounded-lg text-center">
              Waiting for host to start...
            </div>
          )}
        </div>

        {isHost && !allPlayersReady && (
          <div className="mt-3 text-center text-sm text-red-400">
            All players must be ready before launching.
          </div>
        )}

        {/* Info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Share the Game ID with friends to invite them</p>
          <p className="mt-2">The game will start when the host clicks "Start Game"</p>
        </div>
      </div>
    </div>
  )
}
