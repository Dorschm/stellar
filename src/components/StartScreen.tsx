import { useState } from 'react'
import { supabase } from '../services/supabase'
import { useGameStore } from '../store/gameStore'

interface StartScreenProps {
  onGameStart: () => void
}

export function StartScreen({ onGameStart }: StartScreenProps) {
  const [username, setUsername] = useState('')
  const [showCreateGame, setShowCreateGame] = useState(false)
  const [showJoinGame, setShowJoinGame] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const setPlayer = useGameStore(state => state.setPlayer)
  const setGame = useGameStore(state => state.setGame)

  const handleQuickPlay = async () => {
    if (!username.trim()) {
      alert('Please enter a username')
      return
    }

    setIsLoading(true)
    try {
      // Create anonymous player
      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          username: username.trim(),
          credits: 10000,
          energy: 50000,
          minerals: 1000,
          research_points: 0
        })
        .select()
        .single()

      if (playerError) throw playerError

      setPlayer(player)

      // Find or create a waiting game
      const { data: waitingGames, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('status', 'waiting')
        .lt('max_players', 8)
        .limit(1)

      if (gamesError) throw gamesError

      let game
      if (waitingGames && waitingGames.length > 0) {
        // Join existing game
        game = waitingGames[0]
      } else {
        // Create new game
        const { data: newGame, error: newGameError } = await supabase
          .from('games')
          .insert({
            name: `${username}'s Game`,
            status: 'waiting',
            max_players: 8,
            victory_condition: 80,
            tick_rate: 100
          })
          .select()
          .single()

        if (newGameError) throw newGameError
        game = newGame
      }

      // Add player to game
      await supabase
        .from('game_players')
        .insert({
          game_id: game.id,
          player_id: player.id,
          empire_color: '#' + Math.floor(Math.random()*16777215).toString(16),
          placement_order: 1
        })

      setGame(game)
      onGameStart()
    } catch (error) {
      console.error('Error starting game:', error)
      alert('Failed to start game. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-black flex items-center justify-center">
      <div className="max-w-2xl w-full p-8">
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-white mb-4 tracking-wider">
            STELLAR
          </h1>
          <p className="text-xl text-gray-300">3D Space Real-Time Strategy</p>
          <p className="text-sm text-gray-500 mt-2">Based on OpenFront.io</p>
        </div>

        {/* Username Input */}
        <div className="mb-8">
          <input
            type="text"
            placeholder="Enter your commander name..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-6 py-4 text-xl bg-gray-800/50 border-2 border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none transition-colors"
            maxLength={20}
          />
        </div>

        {/* Main Menu Buttons */}
        <div className="space-y-4">
          <button
            onClick={handleQuickPlay}
            disabled={isLoading || !username.trim()}
            className={`
              w-full px-8 py-4 text-xl font-bold rounded-lg transition-all
              ${isLoading || !username.trim()
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white transform hover:scale-105'
              }
            `}
          >
            {isLoading ? 'Finding Game...' : '⚡ Quick Play'}
          </button>

          <button
            onClick={() => setShowCreateGame(true)}
            disabled={isLoading || !username.trim()}
            className={`
              w-full px-8 py-4 text-xl font-bold rounded-lg transition-all
              ${isLoading || !username.trim()
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-800 hover:bg-gray-700 text-white border-2 border-gray-700 hover:border-gray-600'
              }
            `}
          >
            🎮 Create Private Game
          </button>

          <button
            onClick={() => setShowJoinGame(true)}
            disabled={isLoading || !username.trim()}
            className={`
              w-full px-8 py-4 text-xl font-bold rounded-lg transition-all
              ${isLoading || !username.trim()
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-800 hover:bg-gray-700 text-white border-2 border-gray-700 hover:border-gray-600'
              }
            `}
          >
            🔍 Join Game
          </button>

          <button
            onClick={() => {
              // TODO: Implement singleplayer vs AI
              alert('Singleplayer mode coming soon!')
            }}
            disabled={isLoading || !username.trim()}
            className={`
              w-full px-8 py-4 text-xl font-bold rounded-lg transition-all
              ${isLoading || !username.trim()
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-800 hover:bg-gray-700 text-white border-2 border-gray-700 hover:border-gray-600'
              }
            `}
          >
            🤖 Singleplayer
          </button>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <div className="flex justify-center space-x-6 text-gray-400 text-sm">
            <a href="#" className="hover:text-white transition-colors">Help</a>
            <a href="#" className="hover:text-white transition-colors">Settings</a>
            <a href="https://github.com/Dorschm/stellar" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCreateGame && (
        <CreateGameModal
          username={username}
          onClose={() => setShowCreateGame(false)}
          onGameCreated={onGameStart}
        />
      )}

      {showJoinGame && (
        <JoinGameModal
          username={username}
          onClose={() => setShowJoinGame(false)}
          onGameJoined={onGameStart}
        />
      )}
    </div>
  )
}

// Create Game Modal Component
function CreateGameModal({ username, onClose, onGameCreated }: {
  username: string
  onClose: () => void
  onGameCreated: () => void
}) {
  const [gameName, setGameName] = useState(`${username}'s Game`)
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [isCreating, setIsCreating] = useState(false)
  const setPlayer = useGameStore(state => state.setPlayer)
  const setGame = useGameStore(state => state.setGame)

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      // Create player
      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          username: username.trim(),
          credits: 10000,
          energy: 50000,
          minerals: 1000,
          research_points: 0
        })
        .select()
        .single()

      if (playerError) throw playerError
      setPlayer(player)

      // Create game
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({
          name: gameName,
          status: 'waiting',
          max_players: maxPlayers,
          victory_condition: 80,
          tick_rate: 100
        })
        .select()
        .single()

      if (gameError) throw gameError

      // Add player as host
      await supabase
        .from('game_players')
        .insert({
          game_id: game.id,
          player_id: player.id,
          empire_color: '#' + Math.floor(Math.random()*16777215).toString(16),
          placement_order: 1
        })

      setGame(game)
      onGameCreated()
    } catch (error) {
      console.error('Error creating game:', error)
      alert('Failed to create game')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-8 max-w-md w-full border-2 border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-6">Create Private Game</h2>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Game Name</label>
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Max Players</label>
            <select
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:border-blue-500 focus:outline-none"
            >
              <option value={2}>2 Players</option>
              <option value={4}>4 Players</option>
              <option value={6}>6 Players</option>
              <option value={8}>8 Players</option>
            </select>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Game'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Join Game Modal Component
function JoinGameModal({ username, onClose, onGameJoined }: {
  username: string
  onClose: () => void
  onGameJoined: () => void
}) {
  const [games, setGames] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const setPlayer = useGameStore(state => state.setPlayer)
  const setGame = useGameStore(state => state.setGame)

  // Load available games
  useState(() => {
    loadGames()
  })

  const loadGames = async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*, game_players(count)')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })

      if (error) throw error
      setGames(data || [])
    } catch (error) {
      console.error('Error loading games:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoin = async (gameId: string) => {
    try {
      // Create player
      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          username: username.trim(),
          credits: 10000,
          energy: 50000,
          minerals: 1000,
          research_points: 0
        })
        .select()
        .single()

      if (playerError) throw playerError
      setPlayer(player)

      // Join game
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select()
        .eq('id', gameId)
        .single()

      if (gameError) throw gameError

      await supabase
        .from('game_players')
        .insert({
          game_id: game.id,
          player_id: player.id,
          empire_color: '#' + Math.floor(Math.random()*16777215).toString(16),
          placement_order: 2
        })

      setGame(game)
      onGameJoined()
    } catch (error) {
      console.error('Error joining game:', error)
      alert('Failed to join game')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-8 max-w-2xl w-full border-2 border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-6">Join Game</h2>

        {isLoading ? (
          <div className="text-center py-8 text-gray-400">Loading games...</div>
        ) : games.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No games available</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {games.map((game) => (
              <div
                key={game.id}
                className="flex justify-between items-center p-4 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
              >
                <div>
                  <div className="text-white font-semibold">{game.name}</div>
                  <div className="text-sm text-gray-400">
                    Players: {game.game_players?.[0]?.count || 0} / {game.max_players}
                  </div>
                </div>
                <button
                  onClick={() => handleJoin(game.id)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-6 w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
