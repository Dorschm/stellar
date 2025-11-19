import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, Ring, Text, Box, Octahedron, Cylinder } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore, type Planet as PlanetType } from '../store/gameStore'

interface PlanetProps {
  planet: PlanetType
}

export function Planet({ planet }: PlanetProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const selectPlanet = useGameStore(state => state.selectPlanet)
  const selectedPlanet = useGameStore(state => state.selectedPlanet)
  const player = useGameStore(state => state.player)
  const commandMode = useGameStore(state => state.commandMode)
  const requestSendTroops = useGameStore(state => state.requestSendTroops)
  const structures = useGameStore(state => state.structures)
  
  const isSelected = selectedPlanet?.id === planet.id
  const isOwned = planet.owner_id === player?.id
  const isEnemy = planet.owner_id && planet.owner_id !== player?.id
  const isCommandSource = commandMode?.type === 'send_troops' && commandMode.sourcePlanetId === planet.id
  
  // OpenFront-style colors: green=owned, red=enemy, gray=neutral
  const planetColor = isOwned ? '#00ff00' : isEnemy ? '#ff0000' : '#888888'
  
  // Animate the planet
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001
      
      // Pulse effect when selected or acting as command source
      if (isSelected || isCommandSource) {
        const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1
        meshRef.current.scale.setScalar(scale)
      } else {
        meshRef.current.scale.setScalar(1)
      }
    }
  })
  
  const handleClick = async () => {
    if (commandMode?.type === 'send_troops' && commandMode.sourcePlanetId !== planet.id) {
      // Send 50% of troops from source to target (OpenFront style)
      const sourcePlanet = useGameStore.getState().planets.find(p => p.id === commandMode.sourcePlanetId)
      if (sourcePlanet && sourcePlanet.troops > 1) {
        const troopsToSend = Math.floor(sourcePlanet.troops * 0.5)
        await requestSendTroops(commandMode.sourcePlanetId, planet.id, troopsToSend)
      }
    } else {
      selectPlanet(planet)
    }
  }
  
  // Get structures on this planet
  const planetStructures = structures.filter(s => s.system_id === planet.id && s.is_active)
  
  return (
    <group position={[planet.x_pos, planet.y_pos, planet.z_pos]}>
      {/* Main planet */}
      <Sphere
        ref={meshRef}
        args={[2, 32, 32]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
      >
        <meshStandardMaterial
          color={planetColor}
          emissive={planetColor}
          emissiveIntensity={isCommandSource ? 1 : 0.5}
        />
      </Sphere>
      
      {/* Selection ring */}
      {(isSelected || hovered || isCommandSource) && (
        <Ring args={[3, 3.5, 32]} rotation={[Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color={isCommandSource ? '#ffd700' : '#ffffff'} transparent opacity={0.7} />
        </Ring>
      )}
      
      {/* Troop count text (OpenFront style) */}
      <Text
        position={[0, 3.5, 0]}
        fontSize={1.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {planet.troops?.toString() ?? '0'}
      </Text>
      
      {/* Planet name */}
      <Text
        position={[0, -3.5, 0]}
        fontSize={0.8}
        color="#aaaaaa"
        anchorX="center"
        anchorY="middle"
      >
        {planet.name}
      </Text>
      
      {/* Structure indicators */}
      {planetStructures.map((structure, index) => {
        const angle = (index / Math.max(planetStructures.length, 1)) * Math.PI * 2
        const radius = 4
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const y = 1
        
        // Different shapes and colors for different structures
        switch (structure.structure_type) {
          case 'trade_station':
            return (
              <Box key={structure.id} args={[0.5, 0.5, 0.5]} position={[x, y, z]}>
                <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.5} />
              </Box>
            )
          case 'mining_station':
            return (
              <Box key={structure.id} args={[0.6, 0.4, 0.6]} position={[x, y, z]}>
                <meshStandardMaterial color="#4169E1" emissive="#4169E1" emissiveIntensity={0.5} />
              </Box>
            )
          case 'colony_station':
            return (
              <Cylinder key={structure.id} args={[0.3, 0.3, 0.8, 6]} position={[x, y, z]}>
                <meshStandardMaterial color="#32CD32" emissive="#32CD32" emissiveIntensity={0.5} />
              </Cylinder>
            )
          case 'defense_platform':
            return (
              <Octahedron key={structure.id} args={[0.4, 0]} position={[x, y, z]}>
                <meshStandardMaterial color="#1E90FF" emissive="#1E90FF" emissiveIntensity={0.7} />
              </Octahedron>
            )
          case 'missile_battery':
            return (
              <Cylinder key={structure.id} args={[0.2, 0.3, 0.7, 8]} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
                <meshStandardMaterial color="#FF4500" emissive="#FF4500" emissiveIntensity={0.6} />
              </Cylinder>
            )
          case 'point_defense':
            return (
              <Sphere key={structure.id} args={[0.3, 8, 8]} position={[x, y, z]}>
                <meshStandardMaterial color="#00CED1" emissive="#00CED1" emissiveIntensity={0.5} wireframe />
              </Sphere>
            )
          default:
            return null
        }
      })}
    </group>
  )
}
