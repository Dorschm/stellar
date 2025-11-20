import { useRef, useState, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { TerritorySector as TerritorySectorType } from '../services/supabase'

interface TerritorySectorProps {
  sector: TerritorySectorType
  playerColors: Map<string, string>
  debug?: boolean
}

export function TerritorySector({ sector, playerColors, debug }: TerritorySectorProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  
  // Debug logging for sector lifecycle
  useEffect(() => {
    if (debug) {
      console.log('[SECTOR] Rendering sector at', sector.x_pos, sector.y_pos, sector.z_pos, 'tier', sector.expansion_tier, 'wave', sector.expansion_wave)
    }
    return () => {
      if (debug) {
        console.log('[SECTOR] Unmounting sector')
      }
    }
  }, [debug, sector])
  
  // Get color based on owner
  const color = sector.owner_id 
    ? playerColors.get(sector.owner_id) || '#888888'
    : '#333333'
  
  // Store captured timestamp (computed once)
  const sectorCapturedAtMs = useMemo(() => {
    return new Date(sector.captured_at).getTime()
  }, [sector.captured_at])
  
  // Calculate size based on distance from planet
  const sectorSize = useMemo(() => {
    const distance = sector.distance_from_planet || 50
    if (distance < 30) {
      return [12, 0.4, 12] as [number, number, number] // Near planet: larger
    } else if (distance < 60) {
      return [10, 0.3, 10] as [number, number, number] // Medium distance: current size
    } else {
      return [8, 0.25, 8] as [number, number, number] // Far from planet: smaller
    }
  }, [sector.distance_from_planet])
  
  // Calculate emissive intensity based on expansion tier
  const emissiveIntensity = useMemo(() => {
    const tier = sector.expansion_tier || 1
    if (tier === 1) return 0.2
    if (tier === 2) return 0.3
    return 0.4 // Tier 3: most prominent
  }, [sector.expansion_tier])
  
  // Animate pulse, hover opacity, and height variation with dynamic age
  useFrame((state) => {
    if (!meshRef.current) return
    
    // Calculate current age dynamically
    const ageSeconds = (Date.now() - sectorCapturedAtMs) / 1000
    
    // Determine visual properties based on current age
    let baseOpacity: number
    let pulseSpeed: number
    
    if (ageSeconds < 5) {
      baseOpacity = 0.15  // New sectors: low opacity
      pulseSpeed = 3      // Fast pulse
    } else if (ageSeconds < 30) {
      baseOpacity = 0.25  // Medium age: normal opacity
      pulseSpeed = 2      // Normal pulse
    } else {
      baseOpacity = 0.35  // Old sectors: higher opacity
      pulseSpeed = 1.5    // Slow pulse
    }
    
    // Apply pulsing opacity
    const material = meshRef.current.material as THREE.MeshStandardMaterial
    const pulseOpacity = baseOpacity + Math.sin(state.clock.elapsedTime * pulseSpeed) * 0.1
    material.opacity = hovered ? 0.5 : sector.owner_id ? pulseOpacity : 0.15
    
    // Subtle height variation for "growing" effect on new sectors
    if (ageSeconds < 3) {
      const growthProgress = ageSeconds / 3
      const yOffset = -0.5 * (1 - growthProgress)
      meshRef.current.position.y = sector.y_pos + yOffset
    } else {
      meshRef.current.position.y = sector.y_pos
    }
  })
  
  return (
    <Box
      ref={meshRef}
      position={[sector.x_pos, sector.y_pos, sector.z_pos]}
      args={sectorSize}
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
        emissiveIntensity={emissiveIntensity}
        roughness={0.8}
        metalness={0.1}
      />
      {debug && (
        <Html position={[0, 2, 0]}>
          <div style={{ fontSize: '8px', color: 'white', backgroundColor: 'rgba(0,0,0,0.7)', padding: '2px' }}>
            {sector.owner_id?.slice(0, 4)} T{sector.expansion_tier} W{sector.expansion_wave}
          </div>
        </Html>
      )}
    </Box>
  )
}
