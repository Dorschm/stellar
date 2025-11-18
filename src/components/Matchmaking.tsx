// Matchmaking system adapted from OpenFront
import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useGameStore } from '../store/gameStore'

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
    
    let checkInterval: ReturnType<typeof setInterval>
    
    const findMatch = async () => {
      setStatus('searching')
      
      // Look for games needing players
      const { data: waitingGames, error } = await supabase
        .from('games')
        .select(`
          *,
          game_players!inner(count)
        `)
        .eq('status', 'waiting')
        .lt('game_players.count', 'max_players')
        .order('created_at', { ascending: true })
        .limit(1)
      
      if (error) {
        console.error('Matchmaking error:', error)
        return
      }
      
      if (waitingGames && waitingGames.length > 0) {
        // Join existing game
        const game = waitingGames[0]
        await joinGame(game)
      } else {
        // Create new game
        await createMatchmakingGame()
      }
    }
    
    const joinGame = async (game: any) => {
      try {
        // Add player to game
        const { error } = await supabase
          .from('game_players')
          .insert({
            game_id: game.id,
            player_id: player.id,
            empire_color: generateRandomColor(),
            placement_order: (game.game_players?.[0]?.count || 0) + 1
          })
        
        if (error) throw error
        
        setGame(game)
        setMatchData(game)
        setStatus('found')
        onMatchFound(game.id)
      } catch (error) {
        console.error('Error joining game:', error)
      }
    }
    
    const createMatchmakingGame = async () => {
      try {
        // Create new public game
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
        
        // Add creator as first player
        const { error: playerError } = await supabase
          .from('game_players')
          .insert({
            game_id: game.id,
            player_id: player.id,
            empire_color: generateRandomColor(),
            placement_order: 1
          })
        
        if (playerError) throw playerError
        
        setGame(game)
        
        // Start checking for game start
        checkInterval = setInterval(async () => {
          await checkGameStatus(game.id)
        }, 3000)
      } catch (error) {
        console.error('Error creating matchmaking game:', error)
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
      
      // Auto-start if enough players
      if (data.game_players?.[0]?.count >= 2) {
        // Update game status
        await supabase
          .from('games')
          .update({
            status: 'active',
            started_at: new Date().toISOString()
          })
          .eq('id', gameId)
        
        setStatus('found')
        onMatchFound(gameId)
      }
    }
    
    // Start matchmaking
    setTimeout(() => {
      setStatus('searching')
      findMatch()
    }, 1000)
    
    return () => {
      if (checkInterval) clearInterval(checkInterval)
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
