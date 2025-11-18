// Public lobby browser adapted from OpenFront
import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useGameStore } from '../store/gameStore'

interface GameInfo {
  id: string
  name: string
  status: 'waiting' | 'active' | 'completed'
  max_players: number
  victory_condition: number
  tick_rate: number
  created_at: string
  started_at?: string
  player_count?: number
  time_until_start?: number
}

interface PublicLobbyProps {
  onJoinGame: (gameId: string) => void
}

export function PublicLobby({ onJoinGame }: PublicLobbyProps) {
  const [games, setGames] = useState<GameInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const player = useGameStore(state => state.player)
  const setGame = useGameStore(state => state.setGame)
  
  useEffect(() => {
    // Load games initially
    loadGames()
    
    // Refresh every second
    const interval = setInterval(loadGames, 1000)
    
    // Subscribe to game changes
    const channel = supabase
      .channel('public_games')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: 'is_public=eq.true'
        },
        () => {
          loadGames()
        }
      )
      .subscribe()
    
    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [])
  
  const loadGames = async () => {
    try {
      // Get all public waiting games
      const { data: gamesData, error } = await supabase
        .from('games')
        .select(`
          *,
          game_players (
            count
          )
        `)
        .eq('status', 'waiting')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      // Transform data
      const transformedGames: GameInfo[] = (gamesData || []).map(game => ({
        ...game,
        player_count: game.game_players?.[0]?.count || 0,
        time_until_start: calculateTimeUntilStart(game.created_at)
      }))
      
      setGames(transformedGames)
    } catch (error) {
      console.error('Error loading games:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const calculateTimeUntilStart = (createdAt: string): number => {
    const created = new Date(createdAt).getTime()
    const now = Date.now()
    const elapsed = now - created
    const waitTime = 30000 // 30 seconds default wait
    return Math.max(0, waitTime - elapsed)
  }
  
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
    }
    return `${seconds}s`
  }
  
  const handleJoinGame = async (game: GameInfo) => {
    if (!player || isJoining) return
    
    setIsJoining(true)
    setSelectedGame(game)
    
    try {
      // Check if game is still available
      const { data: currentGame, error: gameError } = await supabase
        .from('games')
        .select('*, game_players(count)')
        .eq('id', game.id)
        .single()
      
      if (gameError) throw gameError
      
      const currentPlayers = currentGame.game_players?.[0]?.count || 0
      if (currentPlayers >= currentGame.max_players) {
        alert('Game is full')
        return
      }
      
      // Join the game
      const { error: joinError } = await supabase
        .from('game_players')
        .insert({
          game_id: game.id,
          player_id: player.id,
          empire_color: '#' + Math.floor(Math.random()*16777215).toString(16),
          placement_order: currentPlayers + 1
        })
      
      if (joinError) throw joinError
      
      setGame(currentGame)
      onJoinGame(game.id)
    } catch (error) {
      console.error('Error joining game:', error)
      alert('Failed to join game')
    } finally {
      setIsJoining(false)
      setSelectedGame(null)
    }
  }
  
  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-400">
        Loading games...
      </div>
    )
  }
  
  if (games.length === 0) {
    return (
      <div className="p-8">
        <h3 className="text-xl font-bold text-white mb-4">Public Games</h3>
        <div className="bg-gray-800/50 rounded-lg p-8 text-center">
          <p className="text-gray-400">No public games available</p>
          <p className="text-sm text-gray-500 mt-2">
            Create a new game or try Quick Match
          </p>
        </div>
      </div>
    )
  }
  
  // Show featured game (first one) prominently
  const featuredGame = games[0]
  const otherGames = games.slice(1)
  
  return (
    <div className="p-8">
      <h3 className="text-xl font-bold text-white mb-4">Public Games</h3>
      
      {/* Featured Game */}
      {featuredGame && (
        <button
          onClick={() => handleJoinGame(featuredGame)}
          disabled={isJoining}
          className={`
            w-full mb-4 p-6 rounded-lg transition-all
            ${isJoining && selectedGame?.id === featuredGame.id
              ? 'bg-green-600 cursor-wait'
              : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600'
            }
          `}
        >
          <div className="flex justify-between items-start text-white">
            <div className="text-left">
              <div className="text-2xl font-bold mb-1">
                Join Public Game
              </div>
              <div className="text-sm opacity-90">
                {featuredGame.name}
              </div>
              <div className="text-xs opacity-75 mt-1">
                Map: Medium • Win: {featuredGame.victory_condition}%
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-lg font-bold">
                {featuredGame.player_count} / {featuredGame.max_players}
              </div>
              <div className="text-sm opacity-90">
                {featuredGame.time_until_start ? 
                  formatTime(featuredGame.time_until_start) : 
                  'Starting...'
                }
              </div>
            </div>
          </div>
        </button>
      )}
      
      {/* Other Games */}
      {otherGames.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-400 mb-2">More Games</h4>
          {otherGames.map(game => (
            <button
              key={game.id}
              onClick={() => handleJoinGame(game)}
              disabled={isJoining}
              className={`
                w-full p-4 rounded-lg transition-all text-left
                ${isJoining && selectedGame?.id === game.id
                  ? 'bg-green-600 cursor-wait'
                  : 'bg-gray-800 hover:bg-gray-700'
                }
              `}
            >
              <div className="flex justify-between items-center text-white">
                <div>
                  <div className="font-semibold">{game.name}</div>
                  <div className="text-xs text-gray-400">
                    {game.player_count} / {game.max_players} players
                  </div>
                </div>
                <div className="text-sm text-gray-300">
                  {game.time_until_start ? 
                    formatTime(game.time_until_start) : 
                    'Starting...'
                  }
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
