import { useEffect, useState } from 'react'
import { Game } from './components/Game'
import { StartScreen } from './components/StartScreen'
import { GameLobby } from './components/GameLobby'
import { useGameStore } from './store/gameStore'
import { supabase } from './services/supabase'
import type { System } from './services/supabase'

type GameState = 'start' | 'lobby' | 'active' | 'completed' | 'playing' | 'menu'

function App() {
  const [gameState, setGameState] = useState<GameState>('start')
  const currentGame = useGameStore(state => state.currentGame)
  const setPlayer = useGameStore(state => state.setPlayer)
  const setGame = useGameStore(state => state.setGame)
  const setPlanets = useGameStore(state => state.setPlanets)
  const setAttacks = useGameStore(state => state.setAttacks)
  
  useEffect(() => {
    // Check game state when it changes
    if (currentGame) {
      if (currentGame.status === 'waiting') {
        setGameState('lobby')
      } else if (currentGame.status === 'active') {
        setGameState('active')
        // Initialize game world when entering active state
        initGameWorld()
      } else if (currentGame.status === 'completed') {
        setGameState('completed')
      }
    }
  }, [currentGame])
  
  const initGameWorld = async () => {
    if (currentGame) {
      // Load systems (planets) from database
      let attempts = 0
      let systems: System[] | null = null
      
      while (attempts < 5 && (!systems || systems.length === 0)) {
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
      
      if (systems && systems.length > 0) {
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
        <Game />
      </div>
    )
  }
  
  if (gameState === 'completed') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Game Over</h1>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Return to Menu
          </button>
        </div>
      </div>
    )
  }
  
  return null
}

export default App
