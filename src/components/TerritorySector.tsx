import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box } from '@react-three/drei'
import * as THREE from 'three'
import type { TerritorySector as TerritorySectorType } from '../services/supabase'

interface TerritorySectorProps {
  sector: TerritorySectorType
  playerColors: Map<string, string>
}

export function TerritorySector({ sector, playerColors }: TerritorySectorProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  
  // Get color based on owner
  const color = sector.owner_id 
    ? playerColors.get(sector.owner_id) || '#888888'
    : '#333333'
  
  // Animate pulse and hover opacity
  useFrame((state) => {
    if (!meshRef.current) return
    const material = meshRef.current.material as THREE.MeshStandardMaterial
    const pulseOpacity = 0.2 + Math.sin(state.clock.elapsedTime * 2) * 0.1
    material.opacity = hovered ? 0.5 : sector.owner_id ? pulseOpacity : 0.15
  })
  
  return (
    <Box
      ref={meshRef}
      position={[sector.x_pos, sector.y_pos, sector.z_pos]}
      args={[10, 0.3, 10]}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <meshStandardMaterial 
        color={color}
        transparent
        opacity={0.25}
        side={THREE.DoubleSide}
        emissive={sector.owner_id ? color : '#000000'}
        emissiveIntensity={0.3}
        roughness={0.8}
        metalness={0.1}
      />
    </Box>
  )
}
