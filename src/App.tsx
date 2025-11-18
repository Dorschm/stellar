import { useEffect } from 'react'
import { Game } from './components/Game'
import { useGameStore } from './store/gameStore'

function App() {
  const setGame = useGameStore(state => state.setGame)
  const setSystems = useGameStore(state => state.setSystems)
  const setPlayer = useGameStore(state => state.setPlayer)
  const setFleets = useGameStore(state => state.setFleets)
  
  useEffect(() => {
    // Initialize game with test data for now
    // TODO: Replace with actual game creation/loading from Supabase
    initializeTestGame()
  }, [])
  
  const initializeTestGame = () => {
    // Create test game
    setGame({
      id: 'test-game',
      name: 'Test Game',
      status: 'active',
      max_players: 8,
      victory_condition: 80,
      tick_rate: 100,
      created_at: new Date().toISOString()
    })
    
    // Create test player
    setPlayer({
      id: 'test-player',
      username: 'TestCommander',
      credits: 10000,
      energy: 50000,
      minerals: 1000,
      research_points: 0,
      created_at: new Date().toISOString()
    })
    
    // Generate test solar systems in a 3D grid
    const systems = []
    const gridSize = 5
    const spacing = 50
    
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        for (let z = 0; z < gridSize; z++) {
          const systemId = `system-${x}-${y}-${z}`
          const isHomeSystem = x === 2 && y === 2 && z === 2
          
          systems.push({
            id: systemId,
            game_id: 'test-game',
            name: `System ${String.fromCharCode(65 + x)}${y}${z}`,
            x_pos: (x - gridSize / 2) * spacing,
            y_pos: (y - gridSize / 2) * spacing,
            z_pos: (z - gridSize / 2) * spacing,
            owner_id: isHomeSystem ? 'test-player' : undefined,
            energy_generation: 100 + Math.floor(Math.random() * 100),
            has_minerals: Math.random() > 0.7,
            in_nebula: Math.random() > 0.9
          })
        }
      }
    }
    
    setSystems(systems)
    
    // Create test fleets
    const testFleets = [
      {
        id: 'fleet-1',
        owner_id: 'test-player',
        type: 'scout' as const,
        size: 5,
        position: { x: 0, y: 0, z: 0 },
        health: 100
      },
      {
        id: 'fleet-2',
        owner_id: 'test-player',
        type: 'attack' as const,
        size: 10,
        position: { x: 10, y: 5, z: -10 },
        destination: { x: -20, y: 10, z: 30 },
        health: 100
      },
      {
        id: 'fleet-3',
        owner_id: 'enemy',
        type: 'defense' as const,
        size: 15,
        position: { x: -30, y: -10, z: 20 },
        health: 75
      }
    ]
    
    setFleets(testFleets)
  }
  
  return (
    <div className="w-full h-screen bg-black">
      <Game />
    </div>
  )
}

export default App
