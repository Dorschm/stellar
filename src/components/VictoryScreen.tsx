import type { Game, GameStats, Player } from '../services/supabase'

interface VictoryScreenProps {
  game: Game | null
  gameStats: GameStats[]
  winnerPlayer: Player | null
  currentPlayer: Player | null
  onReturnToMenu: () => void
}

export function VictoryScreen({
  game,
  gameStats,
  winnerPlayer,
  currentPlayer,
  onReturnToMenu
}: VictoryScreenProps) {
  if (!game || !gameStats || gameStats.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl">Loading game results...</p>
        </div>
      </div>
    )
  }

  const isWinner = currentPlayer && winnerPlayer && currentPlayer.id === winnerPlayer.id
  const currentPlayerStats = gameStats.find(s => s.player_id === currentPlayer?.id)

  // Sort players by final placement
  const sortedStats = [...gameStats].sort((a, b) => {
    // Sort by territory percentage descending
    return b.final_territory_percentage - a.final_territory_percentage
  })

  // Helper to format duration
  const formatDuration = (seconds: number | null | undefined): string => {
    if (!seconds || seconds === 0) return 'N/A'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  // Helper to get placement suffix
  const getPlacementSuffix = (place: number): string => {
    if (place === 1) return 'st'
    if (place === 2) return 'nd'
    if (place === 3) return 'rd'
    return 'th'
  }

  const currentPlacement = currentPlayer ? sortedStats.findIndex(s => s.player_id === currentPlayer.id) + 1 : 0

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900 text-white p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {/* Victory/Defeat Banner */}
        <div className="text-center mb-12">
          {isWinner ? (
            <>
              <h1 className="text-6xl font-bold text-yellow-400 mb-4 animate-pulse">
                🏆 VICTORY 🏆
              </h1>
              <p className="text-2xl text-gray-300">
                Congratulations, Commander! You have conquered the galaxy!
              </p>
            </>
          ) : (
            <>
              <h1 className="text-6xl font-bold text-red-400 mb-4">
                {currentPlayer ? 'DEFEAT' : 'GAME OVER'}
              </h1>
              <p className="text-2xl text-gray-300">
                {currentPlayer 
                  ? `You placed ${currentPlacement}${getPlacementSuffix(currentPlacement)} in this galactic conquest`
                  : 'The galactic conquest has ended'
                }
              </p>
            </>
          )}
          
          {winnerPlayer && (
            <div className="mt-6 text-xl text-gray-400">
              Winner: <span className="text-yellow-400 font-bold">{winnerPlayer.username}</span>
            </div>
          )}
        </div>

        {/* Game Info */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-3xl font-bold mb-4">Game Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-gray-400 text-sm">Game Name</p>
              <p className="text-xl font-semibold">{game.name}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Duration</p>
              <p className="text-xl font-semibold">
                {game.game_duration_seconds ? formatDuration(game.game_duration_seconds) : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Victory Type</p>
              <p className="text-xl font-semibold capitalize">
                {game.victory_type?.replace('_', ' ') || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Total Players</p>
              <p className="text-xl font-semibold">{gameStats.length}</p>
            </div>
          </div>
        </div>

        {/* Current Player Stats */}
        {currentPlayerStats && (
          <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded-lg p-6 mb-8 border-2 border-blue-500">
            <h2 className="text-3xl font-bold mb-4">Your Performance</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-blue-200 text-sm">Territory Control</p>
                <p className="text-2xl font-bold">{currentPlayerStats.final_territory_percentage.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-blue-200 text-sm">Planets Controlled</p>
                <p className="text-2xl font-bold">{currentPlayerStats.final_planets_controlled}</p>
              </div>
              <div>
                <p className="text-blue-200 text-sm">Troops Sent</p>
                <p className="text-2xl font-bold">{currentPlayerStats.total_troops_sent.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-blue-200 text-sm">Structures Built</p>
                <p className="text-2xl font-bold">{currentPlayerStats.structures_built}</p>
              </div>
              <div>
                <p className="text-blue-200 text-sm">Planets Captured</p>
                <p className="text-2xl font-bold">{currentPlayerStats.planets_captured}</p>
              </div>
              <div>
                <p className="text-blue-200 text-sm">Combat Victories</p>
                <p className="text-2xl font-bold text-green-400">{currentPlayerStats.total_combat_wins}</p>
              </div>
              <div>
                <p className="text-blue-200 text-sm">Combat Defeats</p>
                <p className="text-2xl font-bold text-red-400">{currentPlayerStats.total_combat_losses}</p>
              </div>
              <div>
                <p className="text-blue-200 text-sm">Peak Territory</p>
                <p className="text-2xl font-bold">{currentPlayerStats.peak_territory_percentage.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Final Standings */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-3xl font-bold mb-6">Final Standings</h2>
          <div className="space-y-3">
            {sortedStats.map((stats, index) => {
              if (!stats) return null // Skip null entries
              const placement = index + 1
              const isCurrentPlayer = stats.player_id === currentPlayer?.id
              const isWinner = placement === 1

              return (
                <div
                  key={stats.id}
                  className={`p-4 rounded-lg transition-all ${
                    isCurrentPlayer
                      ? 'bg-blue-900 border-2 border-blue-500'
                      : 'bg-gray-700 hover:bg-gray-600'
                  } ${isWinner ? 'ring-2 ring-yellow-400' : ''}`}
                >
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-1 text-center">
                      <span className={`text-3xl font-bold ${
                        placement === 1 ? 'text-yellow-400' :
                        placement === 2 ? 'text-gray-300' :
                        placement === 3 ? 'text-orange-600' : 'text-gray-500'
                      }`}>
                        {placement}
                        {isWinner && ' 👑'}
                      </span>
                    </div>
                    <div className="col-span-3">
                      <p className="font-semibold text-lg">
                        Player {stats.player_id.substring(0, 8)}...
                        {isCurrentPlayer && <span className="text-blue-400 ml-2">(You)</span>}
                      </p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-sm text-gray-400">Territory</p>
                      <p className="font-bold">{stats.final_territory_percentage.toFixed(1)}%</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-sm text-gray-400">Planets</p>
                      <p className="font-bold">{stats.final_planets_controlled}</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-sm text-gray-400">Wins</p>
                      <p className="font-bold text-green-400">{stats.total_combat_wins}</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-sm text-gray-400">Structures</p>
                      <p className="font-bold">{stats.structures_built}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Return Button */}
        <div className="text-center">
          <button
            onClick={onReturnToMenu}
            className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg text-xl font-bold transition-all transform hover:scale-105 shadow-lg"
          >
            Return to Main Menu
          </button>
        </div>
      </div>
    </div>
  )
}
