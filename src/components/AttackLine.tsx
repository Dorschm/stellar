import { useMemo } from 'react'
import { Line, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore, type Attack, type Planet } from '../store/gameStore'

interface AttackLineProps {
  attack: Attack
  planets: Planet[]
}

export function AttackLine({ attack, planets }: AttackLineProps) {
  const currentTick = useGameStore(state => state.currentTick)
  
  const sourcePlanet = planets.find(p => p.id === attack.sourcePlanetId)
  const targetPlanet = planets.find(p => p.id === attack.targetPlanetId)
  
  if (!sourcePlanet || !targetPlanet) return null
  
  const sourcePos = new THREE.Vector3(sourcePlanet.x_pos, sourcePlanet.y_pos, sourcePlanet.z_pos)
  const targetPos = new THREE.Vector3(targetPlanet.x_pos, targetPlanet.y_pos, targetPlanet.z_pos)
  
  // Calculate progress (0 to 1)
  const totalTicks = attack.arrivalTick - attack.startTick
  const elapsedTicks = currentTick - attack.startTick
  const progress = totalTicks <= 0
    ? 1
    : Math.min(1, Math.max(0, elapsedTicks / totalTicks))
  
  // Interpolate position
  const currentPos = useMemo(() => {
    return new THREE.Vector3().lerpVectors(sourcePos, targetPos, progress)
  }, [sourcePos, targetPos, progress])
  
  // Line color based on attacker and retreat status
  const player = useGameStore(state => state.player)
  const lineColor = attack.retreating ? '#ffaa00' : // Orange for retreating
                   attack.attackerId === player?.id ? '#00ff00' : '#ff0000'
  
  return (
    <group>
      {/* Line from source to target */}
      <Line
        points={[sourcePos, targetPos]}
        color={lineColor}
        lineWidth={2}
        transparent
        opacity={attack.retreating ? 0.3 + Math.sin(Date.now() / 200) * 0.3 : 0.6}
        dashed
        dashScale={5}
        dashSize={1}
        gapSize={1}
      />
      
      {/* Moving troop indicator */}
      <group position={currentPos}>
        <mesh>
          <sphereGeometry args={[attack.retreating ? 0.3 : 0.5, 16, 16]} />
          <meshBasicMaterial color={lineColor} />
        </mesh>
        
        {/* Troop count text */}
        <Text
          position={[0, 1.5, 0]}
          fontSize={0.8}
          color={attack.retreating ? '#ffaa00' : 'white'}
          anchorX="center"
          anchorY="middle"
        >
          {attack.retreating ? `↩ ${attack.troops}` : attack.troops.toString()}
        </Text>
      </group>
    </group>
  )
}
