import { useEffect, useState } from 'react'
import { Game } from './components/Game'
import { StartScreen } from './components/StartScreen'
import { GameLobby } from './components/GameLobby'
import { useGameStore } from './store/gameStore'
import { supabase } from './services/supabase'

type GameState = 'start' | 'lobby' | 'active' | 'completed'

function App() {
  const [gameState, setGameState] = useState<GameState>('start')
  const currentGame = useGameStore(state => state.currentGame)
  const player = useGameStore(state => state.player)
  const setSystems = useGameStore(state => state.setSystems)
  const setFleets = useGameStore(state => state.setFleets)
  
  useEffect(() => {
    // Check game state when it changes
    if (currentGame) {
      if (currentGame.status === 'waiting') {
        setGameState('lobby')
      } else if (currentGame.status === 'active') {
        setGameState('active')
        // Initialize game world when entering active state
        initializeGameWorld()
      } else if (currentGame.status === 'completed') {
        setGameState('completed')
      }
    }
  }, [currentGame])
  
  const initializeGameWorld = async () => {
    if (!currentGame || !player) return
    
    try {
      // Load systems for this game
      const { data: systems, error: systemsError } = await supabase
        .from('systems')
        .select('*')
        .eq('game_id', currentGame.id)
      
      if (systemsError) throw systemsError
      
      // If no systems exist, generate them
      if (!systems || systems.length === 0) {
        await generateGalaxy(currentGame.id)
        // Reload systems after generation
        const { data: newSystems } = await supabase
          .from('systems')
          .select('*')
          .eq('game_id', currentGame.id)
        setSystems(newSystems || [])
      } else {
        setSystems(systems)
      }
      
      // Load fleets
      const { data: fleets, error: fleetsError } = await supabase
        .from('fleets')
        .select('*')
        .eq('game_id', currentGame.id)
      
      if (fleetsError) throw fleetsError
      
      setFleets(fleets || [])
    } catch (error) {
      console.error('Error initializing game world:', error)
    }
  }
  
  const generateGalaxy = async (gameId: string) => {
    const systems = []
    const gridSize = 5
    const spacing = 50
    
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        for (let z = 0; z < gridSize; z++) {
          systems.push({
            game_id: gameId,
            name: `System ${String.fromCharCode(65 + x)}${y}${z}`,
            x_pos: (x - gridSize / 2) * spacing,
            y_pos: (y - gridSize / 2) * spacing,
            z_pos: (z - gridSize / 2) * spacing,
            energy_generation: 100 + Math.floor(Math.random() * 100),
            has_minerals: Math.random() > 0.7,
            in_nebula: Math.random() > 0.9
          })
        }
      }
    }
    
    // Insert all systems
    await supabase.from('systems').insert(systems)
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
