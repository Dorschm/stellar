import { useEffect, useState } from 'react'
import { Game } from './components/Game'
import { StartScreen } from './components/StartScreen'
import { GameLobby } from './components/GameLobby'
import { VictoryScreen } from './components/VictoryScreen'
import { useGameStore } from './store/gameStore'
import { supabase } from './services/supabase'
import type { System } from './services/supabase'

type GameState = 'start' | 'lobby' | 'active' | 'completed' | 'playing' | 'menu' | 'defeated'

function App() {
  const [gameState, setGameState] = useState<GameState>('start')
  const currentGame = useGameStore(state => state.currentGame)
  const player = useGameStore(state => state.player)
  const gameStats = useGameStore(state => state.gameStats)
  const winnerPlayer = useGameStore(state => state.winnerPlayer)
  const setGame = useGameStore(state => state.setGame)
  const setPlanets = useGameStore(state => state.setPlanets)
  const setAttacks = useGameStore(state => state.setAttacks)
  const fetchGameStats = useGameStore(state => state.fetchGameStats)
  const resetGameState = useGameStore(state => state.resetGameState)
  
  useEffect(() => {
    // Check game state when it changes
    if (currentGame) {
      if (currentGame.status === 'waiting') {
        console.log('[APP] Game status: waiting, showing lobby')
        setGameState('lobby')
      } else if (currentGame.status === 'active') {
        console.log('[APP] Game status: active, initializing world')
        setGameState('active')
        // Initialize game world when entering active state
        initGameWorld()
      } else if (currentGame.status === 'completed') {
        console.log('[APP] Game status: completed, fetching stats')
        setGameState('completed')
        // Fetch game stats when game completes
        fetchGameStatsData()
      }
    }
  }, [currentGame])
  
  const fetchGameStatsData = async () => {
    if (!currentGame) return
    
    try {
      // Fetch game stats using the store method - single source of truth
      await fetchGameStats(currentGame.id)
    } catch (error) {
      console.error('Error fetching game stats:', error)
    }
  }
  
  const handleGameComplete = () => {
    // Refresh game data to get completion status
    if (currentGame) {
      // Small delay to ensure DB writes are committed
      setTimeout(() => {
        supabase
          .from('games')
          .select('*')
          .eq('id', currentGame.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setGame(data)
              // This will trigger the useEffect above to set gameState to 'completed'
            }
          })
      }, 100)
    }
  }
  
  const handlePlayerEliminated = () => {
    // Player has been eliminated - show defeat screen
    console.log('[APP] Player eliminated, showing defeat screen')
    setGameState('defeated')
    // Fetch stats early for the defeat screen
    if (currentGame) {
      fetchGameStatsData()
    }
  }
  
  const handleReturnToMenu = () => {
    // Reset all game state and return to start menu
    resetGameState()
    setGameState('start')
  }
  
  const initGameWorld = async () => {
    if (currentGame) {
      // Load systems (planets) from database
      let attempts = 0
      let systems: System[] = []
      
      while (attempts < 5 && systems.length === 0) {
        const { data, error } = await supabase
          .from('systems')
          .select('*')
          .eq('game_id', currentGame.id)

        if (error) {
          console.error('Error loading systems:', error)
          break
        }

        if (data && data.length > 0) {
          systems = data
          break
        }

        attempts++
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      if (systems.length > 0) {
        setPlanets(systems) // Converts systems to planets with troops
        setAttacks([]) // Start with no active attacks
        setGameState('playing')
      } else {
        console.error('Failed to load game world after 5 attempts')
        setGameState('menu')
      }
    }
  }
  
  // Render appropriate screen based on game state
  if (gameState === 'start') {
    return <StartScreen onGameStart={() => setGameState('lobby')} />
  }
  
  if (gameState === 'lobby') {
    return <GameLobby onStartGame={() => setGameState('active')} />
  }
  
  if (gameState === 'active') {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading game world...</p>
        </div>
      </div>
    )
  }
  
  if (gameState === 'playing') {
    return (
      <div className="w-full h-screen bg-black">
        <Game onGameComplete={handleGameComplete} onPlayerEliminated={handlePlayerEliminated} />
      </div>
    )
  }
  
  if (gameState === 'defeated') {
    return (
      <VictoryScreen
        game={currentGame}
        gameStats={gameStats}
        winnerPlayer={winnerPlayer}
        currentPlayer={player}
        onReturnToMenu={handleReturnToMenu}
      />
    )
  }
  
  if (gameState === 'completed') {
    return (
      <VictoryScreen
        game={currentGame}
        gameStats={gameStats}
        winnerPlayer={winnerPlayer}
        currentPlayer={player}
        onReturnToMenu={handleReturnToMenu}
      />
    )
  }
  
  return null
}

export default App
