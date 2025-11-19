import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Cone, Text, Trail } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '../store/gameStore'

interface FleetProps {
  fleet: {
    id: string
    owner_id: string
    type: 'scout' | 'attack' | 'defense' | 'carrier' | 'trade'
    size: number
    position: { x: number; y: number; z: number }
    destination?: { x: number; y: number; z: number }
    health: number
  }
}

const FLEET_COLORS = {
  scout: '#00ffff',
  attack: '#ff0000',
  defense: '#0000ff',
  carrier: '#ffff00',
  trade: '#00ff00'
}

const FLEET_SPEEDS = {
  scout: 2,
  attack: 1,
  defense: 0.5,
  carrier: 0.8,
  trade: 1.2
}

export function Fleet({ fleet }: FleetProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const selectFleet = useGameStore(state => state.selectFleet)
  const selectedFleet = useGameStore(state => state.selectedFleet)
  const player = useGameStore(state => state.player)
  const commandMode = useGameStore(state => state.commandMode)
  const attackFleet = useGameStore(state => state.attackFleet)
  const setCommandMode = useGameStore(state => state.setCommandMode)
  
  const isSelected = selectedFleet?.id === fleet.id
  const isOwned = fleet.owner_id === player?.id
  const fleetColor = isOwned ? FLEET_COLORS[fleet.type] : '#ff0000'
  
  // Animate fleet movement
  useFrame((state, delta) => {
    if (!meshRef.current) return
    
    // Rotate the fleet
    meshRef.current.rotation.y += delta * 0.5
    
    // Move towards destination if set
    if (fleet.destination) {
      const speed = FLEET_SPEEDS[fleet.type] * delta
      const dx = fleet.destination.x - fleet.position.x
      const dy = fleet.destination.y - fleet.position.y
      const dz = fleet.destination.z - fleet.position.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      
      if (distance > 1) {
        // Normalize and move
        const moveX = (dx / distance) * speed
        const moveY = (dy / distance) * speed
        const moveZ = (dz / distance) * speed
        
        fleet.position.x += moveX
        fleet.position.y += moveY
        fleet.position.z += moveZ
        
        // Look at destination
        meshRef.current.lookAt(fleet.destination.x, fleet.destination.y, fleet.destination.z)
      }
    }
    
    // Pulse when selected
    if (isSelected) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.1
      meshRef.current.scale.setScalar(scale * (fleet.size / 10))
    } else {
      meshRef.current.scale.setScalar(fleet.size / 10)
    }
  })
  
  return (
    <group position={[fleet.position.x, fleet.position.y, fleet.position.z]}>
      {/* Fleet trail effect */}
      <Trail
        width={2}
        length={10}
        color={fleetColor}
        attenuation={(width) => width}
      >
        {/* Fleet ship model (simplified as cone) */}
        <Cone
          ref={meshRef}
          args={[0.5, 1.5, 4]}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
          onClick={() => {
            if (commandMode?.type === 'attack_fleet' && fleet.owner_id !== player?.id) {
              attackFleet(commandMode.attackerId, fleet.id)
              setCommandMode(null)
            } else {
              selectFleet(fleet)
            }
          }}
        >
          <meshStandardMaterial
            color={fleetColor}
            emissive={fleetColor}
            emissiveIntensity={0.3}
            metalness={0.8}
            roughness={0.2}
          />
        </Cone>
      </Trail>
      
      {/* Fleet size indicator */}
      {(hovered || isSelected) && (
        <>
          <Text
            position={[0, 2, 0]}
            fontSize={0.5}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
          >
            {fleet.type.toUpperCase()}
          </Text>
          <Text
            position={[0, 1.5, 0]}
            fontSize={0.4}
            color="#aaaaaa"
            anchorX="center"
            anchorY="middle"
          >
            Size: {fleet.size} | HP: {fleet.health}%
          </Text>
        </>
      )}
      
      {/* Health bar */}
      {(hovered || isSelected) && (
        <group position={[0, -1, 0]}>
          {/* Background */}
          <mesh>
            <planeGeometry args={[1, 0.1]} />
            <meshBasicMaterial color="#333333" />
          </mesh>
          {/* Health */}
          <mesh position={[(1 - fleet.health / 100) * -0.5, 0, 0.01]}>
            <planeGeometry args={[fleet.health / 100, 0.1]} />
            <meshBasicMaterial color={fleet.health > 50 ? '#00ff00' : fleet.health > 25 ? '#ffff00' : '#ff0000'} />
          </mesh>
        </group>
      )}
      
      {/* Destination line */}
      {fleet.destination && (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([
                0, 0, 0,
                fleet.destination.x - fleet.position.x,
                fleet.destination.y - fleet.position.y,
                fleet.destination.z - fleet.position.z
              ])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineDashedMaterial
            color={fleetColor}
            opacity={0.3}
            transparent
            dashSize={1}
            gapSize={1}
          />
        </line>
      )}
    </group>
  )
}
