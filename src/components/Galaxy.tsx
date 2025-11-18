import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function Galaxy() {
  const starsRef = useRef<THREE.Points>(null)
  
  // Generate star field
  const starGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const vertices = []
    const colors = []
    
    for (let i = 0; i < 10000; i++) {
      // Random position in a large sphere
      const radius = 500 + Math.random() * 2000
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos((Math.random() * 2) - 1)
      
      const x = radius * Math.sin(phi) * Math.cos(theta)
      const y = radius * Math.sin(phi) * Math.sin(theta)
      const z = radius * Math.cos(phi)
      
      vertices.push(x, y, z)
      
      // Random star colors (white to blue)
      const colorIntensity = 0.5 + Math.random() * 0.5
      colors.push(colorIntensity, colorIntensity, colorIntensity * (0.8 + Math.random() * 0.4))
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
    
    return geometry
  }, [])
  
  // Slowly rotate the star field
  useFrame((_state, delta) => {
    if (starsRef.current) {
      starsRef.current.rotation.y += delta * 0.01
    }
  })
  
  return (
    <>
      {/* Starfield */}
      <points ref={starsRef} geometry={starGeometry}>
        <pointsMaterial
          size={1.5}
          vertexColors
          transparent
          opacity={0.8}
          sizeAttenuation={false}
        />
      </points>
      
      {/* Ambient space dust/nebula effect */}
      <fog attach="fog" args={['#000033', 100, 3000]} />
    </>
  )
}
