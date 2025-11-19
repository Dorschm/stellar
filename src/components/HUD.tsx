import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { CombatLog } from '../services/supabase'
import { BuildMenu } from './BuildMenu'

export function HUD() {
  const resources = useGameStore(state => state.resources)
  const selectedPlanet = useGameStore(state => state.selectedPlanet)
  const player = useGameStore(state => state.player)
  const commandMode = useGameStore(state => state.commandMode)
  const setCommandMode = useGameStore(state => state.setCommandMode)
  const planets = useGameStore(state => state.planets)
  const attacks = useGameStore(state => state.attacks)
  const currentTick = useGameStore(state => state.currentTick)
  const territoryStats = useGameStore(state => state.territoryStats)
  const combatLogs = useGameStore(state => state.combatLogs)
  const recentCombatLog = useGameStore(state => state.recentCombatLog)
  const structures = useGameStore(state => state.structures)
  
  const [isBuildMenuOpen, setIsBuildMenuOpen] = useState(false)
  const [buildTargetSystemId, setBuildTargetSystemId] = useState<string | undefined>(undefined)

  const playerTerritoryPercentage = player?.id
    ? territoryStats.get(player.id)?.percentage ?? 0
    : 0
  
  return (
    <>
      {/* Top Bar - Resources (OpenFront style) */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex justify-center space-x-8 text-white">
          <ResourceDisplay label="Credits" value={Number(resources.gold)} color="text-yellow-400" icon="💰" />
          <ResourceDisplay label="Energy" value={resources.energy} color="text-cyan-400" icon="⚡" />
          <ResourceDisplay label="Minerals" value={resources.minerals} color="text-blue-400" icon="💎" />
          <ResourceDisplay label="Research" value={resources.research} color="text-purple-400" icon="🔬" />
          <ResourceDisplay label="Troops" value={planets.filter(p => p.owner_id === player?.id).reduce((sum, p) => sum + p.troops, 0)} color="text-orange-400" icon="⚔️" />
          <ResourceDisplay label="Attacks" value={attacks.filter(a => a.attackerId === player?.id).length} color="text-red-400" icon="🚀" />
          <ResourceDisplay label="Planets" value={planets.filter(p => p.owner_id === player?.id).length} color="text-green-400" />
          <ResourceDisplay label="Territory" value={Math.round(playerTerritoryPercentage)} color="text-cyan-300" />
        </div>
      </div>
      
      {/* Left Panel - Planet Info (OpenFront style) */}
      {selectedPlanet && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 p-4 w-80 pointer-events-none">
          <div className="bg-black/80 backdrop-blur rounded-lg p-4 text-white border border-gray-700">
            <h3 className="text-xl font-bold mb-3">{selectedPlanet.name}</h3>
            <div className="space-y-2 text-sm">
              <InfoRow label="Owner" value={selectedPlanet.owner_id === player?.id ? 'You' : selectedPlanet.owner_id ? 'Enemy' : 'Neutral'} />
              <InfoRow label="Troops" value={selectedPlanet.troops.toString()} />
              <InfoRow label="Max Troops" value={selectedPlanet.maxTroops.toString()} />
              {(() => {
                const base = 10 + Math.pow(selectedPlanet.troops, 0.73) / 4
                const ratio = Math.max(0, 1 - (selectedPlanet.troops / selectedPlanet.maxTroops))
                const growth = Math.floor(Math.max(0, base * ratio))
                return <InfoRow label="Growth" value={`${growth}/tick`} />
              })()}
            </div>
            
            {/* Structures on this planet */}
            {(() => {
              const planetStructures = structures.filter(s => s.system_id === selectedPlanet.id && s.is_active)
              return planetStructures.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <h4 className="text-sm font-semibold mb-2 text-gray-300">Structures</h4>
                  <div className="space-y-1">
                    {planetStructures.map(structure => {
                      const icons: Record<string, string> = {
                        trade_station: '💰',
                        mining_station: '⛏️',
                        colony_station: '🏙️',
                        defense_platform: '🛡️',
                        missile_battery: '🚀',
                        point_defense: '🎯'
                      }
                      const names: Record<string, string> = {
                        trade_station: 'Trade Station',
                        mining_station: 'Mining Station',
                        colony_station: 'Colony Station',
                        defense_platform: 'Defense Platform',
                        missile_battery: 'Missile Battery',
                        point_defense: 'Point Defense'
                      }
                      return (
                        <div key={structure.id} className="flex items-center justify-between text-xs">
                          <span>
                            {icons[structure.structure_type]} {names[structure.structure_type]}
                          </span>
                          <span className="text-gray-400">Lv.{structure.level} ({structure.health}%)</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null
            })()}
            
            {/* Action Buttons (OpenFront style) */}
            <div className="mt-4 space-y-2 pointer-events-auto">
              {selectedPlanet.owner_id === player?.id && selectedPlanet.troops > 1 && (
                <button 
                  onClick={() => setCommandMode({ type: 'send_troops', sourcePlanetId: selectedPlanet.id })}
                  className={`w-full px-3 py-2 rounded transition-colors ${
                    commandMode?.type === 'send_troops' && commandMode.sourcePlanetId === selectedPlanet.id
                      ? 'bg-yellow-600 hover:bg-yellow-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {commandMode?.type === 'send_troops' && commandMode.sourcePlanetId === selectedPlanet.id
                    ? 'Click target planet...'
                    : 'Send Troops (50%)'}
                </button>
              )}
              {selectedPlanet.owner_id === player?.id && (
                <button 
                  onClick={() => {
                    setBuildTargetSystemId(selectedPlanet.id)
                    setIsBuildMenuOpen(true)
                  }}
                  className="w-full px-3 py-2 rounded bg-green-600 hover:bg-green-700 transition-colors"
                >
                  🏗️ Build Structure
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Instructions (OpenFront style) */}
      <div className="absolute right-4 top-4 p-4 w-64 bg-black/60 backdrop-blur rounded-lg text-white text-sm pointer-events-none">
        <h4 className="font-bold mb-2">Controls:</h4>
        <ul className="space-y-1 text-xs">
          <li>• Click planet to select</li>
          <li>• Click "Send Troops" then target</li>
          <li>• Planets auto-generate troops</li>
          <li>• Credits grow with territory</li>
          <li>• Capture enemy planets!</li>
        </ul>
      </div>

      <div className="absolute right-4 bottom-4 p-4 w-64 bg-black/60 backdrop-blur rounded-lg text-white text-sm pointer-events-none">
        <h4 className="font-bold mb-2">Territory Control</h4>
        <div className="space-y-1">
          {Array.from(territoryStats.entries())
            .sort((a, b) => b[1].percentage - a[1].percentage)
            .map(([playerId, stats]) => (
              <div key={playerId} className="flex justify-between text-xs">
                <span className={playerId === player?.id ? 'text-green-400' : 'text-gray-400'}>
                  {playerId === player?.id ? 'You' : 'Enemy'}
                </span>
                <span>{Math.round(stats.percentage)}%</span>
              </div>
            ))}
        </div>
      </div>
      
      {/* Combat Log Panel */}
      {combatLogs.length > 0 && (
        <CombatLogPanel logs={combatLogs} player={player} />
      )}
      
      {/* Combat Result Toast (animated) */}
      {recentCombatLog && (
        <CombatResultToast log={recentCombatLog} player={player} planets={planets} />
      )}
      
      {/* Build Menu */}
      <BuildMenu 
        isOpen={isBuildMenuOpen} 
        onClose={() => {
          setIsBuildMenuOpen(false)
          setBuildTargetSystemId(undefined)
        }}
        systemId={buildTargetSystemId}
      />
    </>
  )
}

// Helper Components
function ResourceDisplay({ label, value, color, icon }: { label: string; value: number; color: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-lg font-bold ${color}`}>
        {icon && <span className="mr-1">{icon}</span>}
        {value.toLocaleString()}
      </span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}:</span>
      <span>{value}</span>
    </div>
  )
}

function CombatLogPanel({ logs, player }: { logs: CombatLog[]; player: any }) {
  return (
    <div className="absolute left-4 bottom-4 p-4 w-80 bg-black/80 backdrop-blur rounded-lg text-white text-sm pointer-events-none max-h-64 overflow-y-auto">
      <h4 className="font-bold mb-2">Combat Log</h4>
      <div className="space-y-2">
        {logs.map((log) => (
          <CombatLogEntry key={log.id} log={log} player={player} />
        ))}
      </div>
    </div>
  )
}

function CombatLogEntry({ log, player }: { log: CombatLog; player: any }) {
  const isPlayerInvolved = log.attacker_id === player?.id || log.defender_id === player?.id
  const isPlayerWinner = log.winner_id === player?.id
  const resultColor = log.combat_result === 'retreat' ? 'text-yellow-400' : 
                     isPlayerWinner ? 'text-green-400' : 
                     isPlayerInvolved ? 'text-red-400' : 'text-gray-400'
  
  const resultText = log.combat_result === 'retreat' ? 'Retreat' :
                    log.was_encircled ? 'Encircled!' :
                    log.combat_result === 'attacker_victory' ? 'Victory' : 'Defended'
  
  const modifiers = []
  if (log.had_flanking) modifiers.push('Flanking')
  if (log.terrain_type === 'nebula') modifiers.push('Nebula')
  if (log.terrain_type === 'asteroid') modifiers.push('Asteroid')
  
  return (
    <div className={`text-xs p-2 rounded bg-black/40 border-l-2 ${isPlayerInvolved ? 'border-yellow-400' : 'border-gray-600'}`}>
      <div className="flex justify-between">
        <span className={resultColor}>{resultText}</span>
        <span className="text-gray-500">{new Date(log.occurred_at).toLocaleTimeString()}</span>
      </div>
      <div className="text-gray-400 mt-1">
        Attacker: {log.attacker_troops} (-{log.attacker_losses}) → {log.attacker_survivors}
      </div>
      <div className="text-gray-400">
        Defender: {log.defender_troops} (-{log.defender_losses}) → {log.defender_survivors}
      </div>
      {modifiers.length > 0 && (
        <div className="text-cyan-400 mt-1">
          {modifiers.join(', ')}
        </div>
      )}
    </div>
  )
}

function CombatResultToast({ log, player, planets }: { log: CombatLog; player: any; planets: any[] }) {
  const system = planets.find(p => p.id === log.system_id)
  const isPlayerInvolved = log.attacker_id === player?.id || log.defender_id === player?.id
  const isPlayerWinner = log.winner_id === player?.id
  
  if (!isPlayerInvolved) return null
  
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 p-4 bg-black/90 backdrop-blur rounded-lg text-white border-2 animate-bounce pointer-events-none"
         style={{ borderColor: isPlayerWinner ? '#00ff00' : '#ff0000' }}>
      <div className="text-xl font-bold mb-2">
        {isPlayerWinner ? '🎉 Victory!' : '💥 Defeat!'}
      </div>
      <div className="text-sm">
        {system?.name || 'Unknown System'}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        {log.attacker_survivors} troops {isPlayerWinner ? 'captured' : 'lost'}
      </div>
    </div>
  )
}
