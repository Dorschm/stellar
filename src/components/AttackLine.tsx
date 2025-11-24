import { useMemo, useEffect, useRef } from 'react'
import { Line, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore, type Attack, type Planet } from '../store/gameStore'

interface AttackLineProps {
  attack: Attack
  planets: Planet[]
}

export function AttackLine({ attack, planets }: AttackLineProps) {
  const currentTick = useGameStore(state => state.currentTick)
  const lastLoggedMilestone = useRef<number>(-1)
  
  const sourcePlanet = planets.find(p => p.id === attack.sourcePlanetId)
  const targetPlanet = planets.find(p => p.id === attack.targetPlanetId)
  
  // Add mount/unmount logging
  useEffect(() => {
    console.log('[ATTACK LINE] Mounted:', {
      attackId: attack.id,
      source: attack.sourcePlanetId,
      target: attack.targetPlanetId,
      troops: attack.troops
    })
    
    return () => {
      console.log('[ATTACK LINE] Unmounted:', { attackId: attack.id })
    }
  }, [attack.id, attack.sourcePlanetId, attack.targetPlanetId, attack.troops])
  
  // Log missing planet data
  if (!sourcePlanet || !targetPlanet) {
    console.log('[ATTACK LINE] Missing planet data:', {
      attackId: attack.id,
      missingSource: !sourcePlanet,
      missingTarget: !targetPlanet
    })
    return null
  }
  
  const sourcePos = new THREE.Vector3(sourcePlanet.x_pos, sourcePlanet.y_pos, sourcePlanet.z_pos)
  const targetPos = new THREE.Vector3(targetPlanet.x_pos, targetPlanet.y_pos, targetPlanet.z_pos)
  
  // Calculate progress (0 to 1)
  const totalTicks = attack.arrivalTick - attack.startTick
  const elapsedTicks = currentTick - attack.startTick
  const progress = totalTicks <= 0
    ? 1
    : Math.min(1, Math.max(0, elapsedTicks / totalTicks))
  
  // Log progress milestones
  const progressPercent = progress * 100
  let currentMilestone = -1
  
  if (progressPercent >= 100) currentMilestone = 100
  else if (progressPercent >= 75) currentMilestone = 75
  else if (progressPercent >= 50) currentMilestone = 50
  else if (progressPercent >= 25) currentMilestone = 25
  
  if (currentMilestone !== -1 && currentMilestone !== lastLoggedMilestone.current) {
    console.log('[ATTACK LINE] Progress milestone:', {
      attackId: attack.id,
      progress: currentMilestone + '%',
      retreating: attack.retreating
    })
    lastLoggedMilestone.current = currentMilestone
  }
  
  // Interpolate position
  const currentPos = useMemo(() => {
    if (attack.retreating) {
      // Retreat: interpolate from target back to source
      return new THREE.Vector3().lerpVectors(targetPos, sourcePos, progress)
    }
    return new THREE.Vector3().lerpVectors(sourcePos, targetPos, progress)
  }, [sourcePos, targetPos, progress, attack.retreating])
  
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
        
        {/* Retreat direction indicator */}
        {attack.retreating && (
          <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.3, 0.6, 8]} />
            <meshBasicMaterial color="#ffaa00" />
          </mesh>
        )}
        
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
        
        {/* ETA display */}
        <Text
          position={[0, 2.5, 0]}
          fontSize={0.6}
          color="#888888"
          anchorX="center"
          anchorY="middle"
        >
          {attack.retreating ? 'Retreating' : `ETA: ${Math.max(0, attack.arrivalTick - currentTick)} ticks`}
        </Text>
      </group>
    </group>
  )
}
