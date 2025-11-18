import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, Text, Ring } from '@react-three/drei'
import * as THREE from 'three'
import type { System } from '../services/supabase'
import { useGameStore } from '../store/gameStore'

interface SolarSystemProps {
  system: System
}

export function SolarSystem({ system }: SolarSystemProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const selectSystem = useGameStore(state => state.selectSystem)
  const selectedSystem = useGameStore(state => state.selectedSystem)
  const player = useGameStore(state => state.player)
  
  const isSelected = selectedSystem?.id === system.id
  const isOwned = system.owner_id === player?.id
  const isEnemy = system.owner_id && system.owner_id !== player?.id
  
  // Determine system color based on ownership
  const systemColor = isOwned ? '#00ff00' : isEnemy ? '#ff0000' : '#ffff00'
  
  // Animate the system
  useFrame((state) => {
    if (meshRef.current) {
      // Gentle pulsing for selected system
      if (isSelected) {
        meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.1)
      }
    }
  })
  
  return (
    <group position={[system.x_pos, system.y_pos, system.z_pos]}>
      {/* Main star */}
      <Sphere
        ref={meshRef}
        args={[2, 32, 32]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={() => selectSystem(system)}
      >
        <meshStandardMaterial
          color={systemColor}
          emissive={systemColor}
          emissiveIntensity={0.5}
        />
      </Sphere>
      
      {/* Selection ring */}
      {(isSelected || hovered) && (
        <Ring
          args={[3, 3.5, 32]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <meshBasicMaterial
            color={isSelected ? '#ffffff' : '#888888'}
            transparent
            opacity={0.5}
          />
        </Ring>
      )}
      
      {/* System name */}
      {(isSelected || hovered) && (
        <Text
          position={[0, 4, 0]}
          fontSize={1}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {system.name}
        </Text>
      )}
      
      {/* Influence sphere (if owned) */}
      {isOwned && (
        <Sphere args={[15, 16, 16]}>
          <meshBasicMaterial
            color="#00ff00"
            transparent
            opacity={0.1}
            wireframe
          />
        </Sphere>
      )}
      
      {/* Mineral indicator */}
      {system.has_minerals && (
        <group position={[3, 0, 0]}>
          <Sphere args={[0.5, 16, 16]}>
            <meshStandardMaterial color="#8888ff" metalness={1} roughness={0.2} />
          </Sphere>
        </group>
      )}
      
      {/* Nebula effect */}
      {system.in_nebula && (
        <Sphere args={[10, 16, 16]}>
          <meshBasicMaterial
            color="#ff00ff"
            transparent
            opacity={0.05}
          />
        </Sphere>
      )}
    </group>
  )
}
