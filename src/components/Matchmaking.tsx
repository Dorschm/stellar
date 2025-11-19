// Matchmaking system adapted from OpenFront
import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { gameService } from '../services/gameService'
import { useGameStore } from '../store/gameStore'

const SEARCH_INTERVAL_MS = 2000
const CREATE_GAME_DELAY_MS = 15000

interface MatchmakingModalProps {
  isOpen: boolean
  onClose: () => void
  onMatchFound: (gameId: string) => void
}

export function MatchmakingModal({ isOpen, onClose, onMatchFound }: MatchmakingModalProps) {
  const [status, setStatus] = useState<'connecting' | 'searching' | 'found'>('connecting')
  const [matchData, setMatchData] = useState<any>(null)
  const player = useGameStore(state => state.player)
  const setGame = useGameStore(state => state.setGame)
  
  useEffect(() => {
    if (!isOpen || !player) return

    let cancelled = false
    let checkInterval: ReturnType<typeof setInterval> | null = null
    let searchInterval: ReturnType<typeof setInterval> | null = null
    let createTimeout: ReturnType<typeof setTimeout> | null = null

    const clearSearchTimers = () => {
      if (searchInterval) {
        clearInterval(searchInterval)
        searchInterval = null
      }
      if (createTimeout) {
        clearTimeout(createTimeout)
        createTimeout = null
      }
    }

    const cleanup = () => {
      clearSearchTimers()
      if (checkInterval) {
        clearInterval(checkInterval)
        checkInterval = null
      }
    }

    const checkGameStatus = async (gameId: string) => {
      const { data, error } = await supabase
        .from('games')
        .select('*, game_players(count)')
        .eq('id', gameId)
        .single()

      if (error) {
        console.error('Error checking game status:', error)
        return
      }

      if (data.game_players?.[0]?.count >= 2) {
        await supabase
          .from('games')
          .update({
            status: 'active',
            started_at: new Date().toISOString()
          })
          .eq('id', gameId)

        if (!cancelled) {
          setStatus('found')
          onMatchFound(gameId)
        }
        return true
      }

      return false
    }

    const joinGame = async (game: any) => {
      try {
        const players = Array.isArray(game.game_players) ? game.game_players : []
        const alreadyInGame = players.some((p: any) => p.player_id === player.id)

        if (alreadyInGame) {
          if (!cancelled) {
            const updatedGame = await gameService.getGameInfo(game.id)
            if (updatedGame) {
              setGame(updatedGame)
              setMatchData(updatedGame)
            }
            setStatus('found')
            onMatchFound(game.id)
            cleanup()
          }
          return
        }

        const placementOrder = players.length + 1

        const { error } = await supabase
          .from('game_players')
          .insert({
            game_id: game.id,
            player_id: player.id,
            empire_color: generateRandomColor(),
            placement_order: placementOrder
          })

        if (error) {
          if (error.code === '23505') {
            console.log('Player already joined game, continuing')
          } else {
            throw error
          }
        }

        if (!cancelled) {
          const updatedGame = await gameService.getGameInfo(game.id)
          if (updatedGame) {
            setGame(updatedGame)
            setMatchData(updatedGame)
          }
          setStatus('found')
          onMatchFound(game.id)
          cleanup()
        }
      } catch (error) {
        console.error('Error joining game:', error)
      }
    }

    const createMatchmakingGame = async () => {
      try {
        const { data: game, error: gameError } = await supabase
          .from('games')
          .insert({
            name: 'Quick Match',
            status: 'waiting',
            max_players: 4,
            victory_condition: 80,
            tick_rate: 100,
            is_public: true
          })
          .select()
          .single()

        if (gameError) throw gameError

        const { error: playerError } = await supabase
          .from('game_players')
          .insert({
            game_id: game.id,
            player_id: player.id,
            empire_color: generateRandomColor(),
            placement_order: 1
          })

        if (playerError && playerError.code !== '23505') throw playerError

        const updatedGame = await gameService.getGameInfo(game.id)
        if (!cancelled) {
          if (updatedGame) {
            setGame(updatedGame)
            setMatchData(updatedGame)
          } else {
            setGame(game)
            setMatchData(game)
          }

          checkInterval = setInterval(async () => {
            const started = await checkGameStatus(game.id)
            if (started && checkInterval) {
              clearInterval(checkInterval)
              checkInterval = null
            }
          }, 3000)
        }
      } catch (error) {
        console.error('Error creating matchmaking game:', error)
      }
    }

    const findMatch = async () => {
      try {
        const { data: waitingGames, error } = await supabase
          .from('games')
          .select(`
            *,
            game_players (
              player_id
            )
          `)
          .eq('status', 'waiting')
          .order('created_at', { ascending: true })
          .limit(10)

        if (error) {
          console.error('Matchmaking error:', error)
          return
        }

        const availableGame = waitingGames?.find((game: any) => {
          const players = Array.isArray(game.game_players) ? game.game_players : []
          const playerCount = players.length
          const alreadyInGame = players.some((p: any) => p.player_id === player.id)
          return playerCount < game.max_players && !alreadyInGame
        })

        if (availableGame) {
          clearSearchTimers()
          await joinGame(availableGame)
        }
      } catch (error) {
        console.error('Error during matchmaking search:', error)
      }
    }

    const startSearch = () => {
      setStatus('searching')
      findMatch()
      searchInterval = setInterval(findMatch, SEARCH_INTERVAL_MS)
      createTimeout = setTimeout(async () => {
        clearSearchTimers()
        if (!cancelled) {
          await createMatchmakingGame()
        }
      }, CREATE_GAME_DELAY_MS)
    }

    const startDelay = setTimeout(() => {
      if (!cancelled) {
        startSearch()
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(startDelay)
      cleanup()
    }
  }, [isOpen, player, setGame, onMatchFound])
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-8 max-w-md w-full border-2 border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-6">Quick Match</h2>
        
        <div className="text-center py-12">
          {status === 'connecting' && (
            <>
              <div className="animate-pulse text-blue-400 text-lg mb-2">
                Connecting to matchmaking...
              </div>
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
              </div>
            </>
          )}
          
          {status === 'searching' && (
            <>
              <div className="text-yellow-400 text-lg mb-4">
                Searching for opponents...
              </div>
              <div className="flex justify-center space-x-2">
                <div className="w-3 h-3 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-3 h-3 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-3 h-3 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <div className="text-gray-400 text-sm mt-4">
                This may take a few moments...
              </div>
            </>
          )}
          
          {status === 'found' && matchData && (
            <>
              <div className="text-green-400 text-lg mb-4">
                ✓ Match Found!
              </div>
              <div className="text-white">
                Joining game: {matchData.name}
              </div>
              <div className="text-gray-400 text-sm mt-2">
                Starting soon...
              </div>
            </>
          )}
        </div>
        
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function generateRandomColor(): string {
  return '#' + Math.floor(Math.random()*16777215).toString(16)
}
