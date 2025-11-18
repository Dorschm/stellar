import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Stars } from '@react-three/drei'
import { Galaxy } from './Galaxy'
import { SolarSystem } from './SolarSystem'
import { Fleet } from './Fleet'
import { useGameStore } from '../store/gameStore'
import { HUD } from './HUD'
import { GameEngine } from '../game/GameEngine'

const gameEngine = new GameEngine()

export function Game() {
  const systems = useGameStore(state => state.systems)
  const fleets = useGameStore(state => state.fleets)
  const cameraPosition = useGameStore(state => state.cameraPosition)
  const updateResources = useGameStore(state => state.updateResources)
  const resources = useGameStore(state => state.resources)
  const player = useGameStore(state => state.player)
  
  // Start resource generation
  useEffect(() => {
    gameEngine.start((tick) => {
      // Calculate resource generation every 10 ticks
      if (tick % 10 === 0) {
        // Count owned systems
        const ownedSystems = systems.filter(s => s.owner_id === player?.id)
        const mineralSystems = ownedSystems.filter(s => s.has_minerals)
        
        // Calculate energy regeneration using OpenFront formula
        const maxEnergy = 100000 + ownedSystems.length * 25000
        const energyRegen = gameEngine.calculateEnergyRegen(resources.energy, maxEnergy)
        
        // Update resources
        updateResources({
          energy: Math.min(resources.energy + energyRegen, maxEnergy),
          credits: resources.credits + 100, // Flat credit generation
          minerals: resources.minerals + (mineralSystems.length * 50), // 50 per mineral system
          research: resources.research + Math.floor(ownedSystems.length / 5) // 1 research per 5 systems
        })
      }
    })
    
    return () => gameEngine.stop()
  }, [systems, resources, updateResources, player])
  
  return (
    <div className="w-full h-screen relative">
      {/* 3D Scene */}
      <Canvas className="bg-black">
        <PerspectiveCamera
          makeDefault
          position={[cameraPosition.x, cameraPosition.y, cameraPosition.z]}
          fov={75}
        />
        
        {/* Controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={10}
          maxDistance={500}
        />
        
        {/* Lighting */}
        <ambientLight intensity={0.2} />
        <pointLight position={[0, 0, 0]} intensity={1} />
        
        {/* Background */}
        <Stars
          radius={1000}
          depth={500}
          count={5000}
          factor={4}
          saturation={0}
          fade
        />
        
        {/* Galaxy background */}
        <Galaxy />
        
        {/* Solar Systems */}
        {systems.map(system => (
          <SolarSystem key={system.id} system={system} />
        ))}
        
        {/* Fleets */}
        {fleets.map(fleet => (
          <Fleet key={fleet.id} fleet={fleet} />
        ))}
      </Canvas>
      
      {/* UI Overlay */}
      <HUD />
    </div>
  )
}
