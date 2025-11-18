import { useEffect, useRef, useState } from 'react'
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
}

export function GameLobby({ onStartGame }: GameLobbyProps) {
  const currentGame = useGameStore(state => state.currentGame)
  const player = useGameStore(state => state.player)
  const setGame = useGameStore(state => state.setGame)
  const [players, setPlayers] = useState<PlayerInLobby[]>([])
  const [isHost, setIsHost] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const hasEnteredRef = useRef(false)

  useEffect(() => {
    hasEnteredRef.current = false
  }, [currentGame?.id])

  useEffect(() => {
    if (!currentGame) return

    // Load players in the game
    loadPlayers()

    // Subscribe to player changes
    const channel = supabase
      .channel(`game_${currentGame.id}`)
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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentGame, onStartGame])

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

  const loadPlayers = async () => {
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
        `)
        .eq('game_id', currentGame.id)
        .order('placement_order', { ascending: true })

      if (error) throw error

      const playerList: PlayerInLobby[] = data.map((gp: any) => ({
        id: gp.players.id,
        username: gp.players.username,
        empire_color: gp.empire_color,
        is_alive: gp.is_alive
      }))

      setPlayers(playerList)
      
      // Check if current player is the host (first player)
      if (playerList.length > 0 && playerList[0].id === player?.id) {
        setIsHost(true)
      }
    } catch (error) {
      console.error('Error loading players:', error)
    }
  }

  const handleStartGame = async () => {
    if (!currentGame || !isHost || !player) return

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
                
                <div className="text-green-400 text-sm">Ready</div>
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
        <div className="flex space-x-4">
          <button
            onClick={handleLeaveGame}
            className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Leave Game
          </button>

          {isHost && (
            <button
              onClick={handleStartGame}
              disabled={isStarting || players.length < 1}
              className={`
                flex-1 px-6 py-3 rounded-lg transition-all font-bold
                ${isStarting || players.length < 1
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

        {/* Info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Share the Game ID with friends to invite them</p>
          <p className="mt-2">The game will start when the host clicks "Start Game"</p>
        </div>
      </div>
    </div>
  )
}
