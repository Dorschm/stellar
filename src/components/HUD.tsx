import { useState, useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import type { CombatLog } from '../services/supabase'
import { BuildMenu } from './BuildMenu'
import { territoryControl } from '../game/TerritoryControl'

export function HUD() {
  const resources = useGameStore(state => state.resources)
  const selectedPlanet = useGameStore(state => state.selectedPlanet)
  const player = useGameStore(state => state.player)
  const commandMode = useGameStore(state => state.commandMode)
  const setCommandMode = useGameStore(state => state.setCommandMode)
  const planets = useGameStore(state => state.planets)
  const attacks = useGameStore(state => state.attacks)
  const territoryStats = useGameStore(state => state.territoryStats)
  const territorySectors = useGameStore(state => state.territorySectors)
  const combatLogs = useGameStore(state => state.combatLogs)
  const recentCombatLog = useGameStore(state => state.recentCombatLog)
  const structures = useGameStore(state => state.structures)
  const territoryDebugMode = useGameStore(state => state.territoryDebugMode)
  const setTerritoryDebugMode = useGameStore(state => state.setTerritoryDebugMode)
  const isTickStale = useGameStore(state => state.isTickStale)
  
  const [isBuildMenuOpen, setIsBuildMenuOpen] = useState(false)
  const [buildTargetSystemId, setBuildTargetSystemId] = useState<string | undefined>(undefined)
  const [newSectorCount, setNewSectorCount] = useState(0)
  const [showExpansionNotification, setShowExpansionNotification] = useState(false)
  const [recentExpansions, setRecentExpansions] = useState<Array<{timestamp: number, count: number}>>([])
  const [resourceRates, setResourceRates] = useState<{ gold: number; energy: number; minerals: number }>({ gold: 0, energy: 0, minerals: 0 })
  
  // Store previous resource snapshot for rate calculation
  const prevResourcesRef = useRef({ gold: Number(resources.gold), energy: resources.energy, minerals: resources.minerals })

  const playerTerritoryPercentage = player?.id
    ? territoryStats.get(player.id)?.percentage ?? 0
    : 0
  
  // Track new sector expansion for notifications
  const [prevSectorCount, setPrevSectorCount] = useState<number | null>(null)
  
  // Initialize prevSectorCount when player first loads
  useEffect(() => {
    if (player?.id && prevSectorCount === null) {
      const currentSectorCount = territorySectors.filter(s => s.owner_id === player.id).length
      setPrevSectorCount(currentSectorCount)
    }
  }, [player?.id, prevSectorCount])
  
  // Detect sector expansion and show notification
  useEffect(() => {
    if (!player?.id) return
    if (prevSectorCount === null) return // Skip on initial run
    
    const currentSectorCount = territorySectors.filter(s => s.owner_id === player.id).length
    if (currentSectorCount > prevSectorCount) {
      const newSectors = currentSectorCount - prevSectorCount
      setNewSectorCount(newSectors)
      setShowExpansionNotification(true)
      
      // Track expansion event for debug panel
      setRecentExpansions(prev => [
        { timestamp: Date.now(), count: newSectors },
        ...prev.slice(0, 4) // Keep last 5 events
      ])
      
      // Update baseline for next comparison
      setPrevSectorCount(currentSectorCount)
      
      setTimeout(() => {
        setShowExpansionNotification(false)
      }, 2000)
    }
  }, [territorySectors, player?.id, prevSectorCount])
  
  // Calculate resource generation rates using ref to track previous values
  useEffect(() => {
    const timer = setTimeout(() => {
      // Compute delta from stored previous snapshot
      setResourceRates({
        gold: Number(resources.gold) - prevResourcesRef.current.gold,
        energy: resources.energy - prevResourcesRef.current.energy,
        minerals: resources.minerals - prevResourcesRef.current.minerals
      })
      // Update ref with current snapshot after computing delta
      prevResourcesRef.current = { gold: Number(resources.gold), energy: resources.energy, minerals: resources.minerals }
    }, 1000)
    return () => clearTimeout(timer)
  }, [resources])
  
  return (
    <>
      {/* Top Bar - Resources (OpenFront style) */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex flex-col items-center">
          <div className="flex justify-center space-x-6 text-white">
            <ResourceDisplay label="Credits" value={Number(resources.gold)} color="text-yellow-400" icon="💰" />
            <ResourceDisplay label="Energy" value={resources.energy} color="text-cyan-400" icon="⚡" />
            <ResourceDisplay label="Minerals" value={resources.minerals} color="text-blue-400" icon="💎" />
            <ResourceDisplay label="Troops" value={planets.filter(p => p.owner_id === player?.id).reduce((sum, p) => sum + p.troops, 0)} color="text-orange-400" icon="⚔️" />
            <ResourceDisplay label="Attacks" value={attacks.filter(a => a.attackerId === player?.id).length} color="text-red-400" icon="🚀" />
            <ResourceDisplay label="Planets" value={planets.filter(p => p.owner_id === player?.id).length} color="text-green-400" />
            <ResourceDisplay label="Territory" value={Math.round(playerTerritoryPercentage)} color="text-cyan-300" />
          </div>
          {(resourceRates.gold > 0 || resourceRates.energy > 0 || resourceRates.minerals > 0) && (
            <div className="text-xs text-gray-400 mt-1 flex space-x-4">
              {resourceRates.gold > 0 && <span>+{resourceRates.gold}/sec</span>}
              {resourceRates.energy > 0 && <span>+{resourceRates.energy}/sec</span>}
              {resourceRates.minerals > 0 && <span>+{resourceRates.minerals}/sec</span>}
            </div>
          )}
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
              <InfoRow label="Max Troops" value={`${selectedPlanet.maxTroops} (base: 500 + colony bonuses)`} />
              {(() => {
                const base = 10 + Math.pow(selectedPlanet.troops, 0.73) / 4
                const ratio = Math.max(0, 1 - (selectedPlanet.troops / selectedPlanet.maxTroops))
                const growth = Math.floor(Math.max(0, base * ratio))
                const efficiency = (ratio * 100).toFixed(1)
                return (
                  <div title="OpenFront formula: base = 10 + (troops^0.73)/4, growth = base * (1 - troops/maxTroops)">
                    <InfoRow label="Growth" value={`${growth}/tick`} />
                    <InfoRow label="Efficiency" value={`${efficiency}%`} />
                  </div>
                )
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
            
            {/* Expansion Tier Display */}
            {selectedPlanet.owner_id === player?.id && (() => {
              const tierInfo = territoryControl.calculateExpansionTier(selectedPlanet.id)
              const tierColors = {
                1: 'text-yellow-400',
                2: 'text-blue-400',
                3: 'text-purple-400'
              }
              const tierNames = {
                1: 'Bronze',
                2: 'Silver',
                3: 'Gold'
              }
              
              return (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Expansion Tier:</span>
                      <span className={tierColors[tierInfo.tier as 1 | 2 | 3]}>
                        {tierNames[tierInfo.tier as 1 | 2 | 3]} (Tier {tierInfo.tier})
                      </span>
                    </div>
                    {tierInfo.tier < 3 && (
                      <div className="mt-1">
                        <div className="text-gray-500 text-xs">Next tier in {tierInfo.nextTierIn} ticks</div>
                        <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                          <div 
                            className={`h-1.5 rounded-full transition-all ${tierColors[tierInfo.tier as 1 | 2 | 3]}`}
                            style={{ 
                              width: `${tierInfo.tier === 1 ? (tierInfo.ownershipDuration / 50) * 100 : ((tierInfo.ownershipDuration - 50) / 100) * 100}%` 
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
            
            {/* Action Buttons (OpenFront style) */}
            <div className="mt-4 space-y-2 pointer-events-auto">
              {selectedPlanet.owner_id === player?.id && selectedPlanet.troops > 1 && (
                <button 
                  onClick={() => {
                    // Log Send Troops button click
                    console.log('[HUD] Send Troops button clicked for planet:', {
                      planetId: selectedPlanet.id,
                      name: selectedPlanet.name,
                      troops: selectedPlanet.troops
                    })
                    
                    // Log command mode being set
                    console.log('[HUD] Setting command mode:', {
                      type: 'send_troops',
                      sourcePlanetId: selectedPlanet.id
                    })
                    
                    setCommandMode({ type: 'send_troops', sourcePlanetId: selectedPlanet.id })
                    
                    // Log command mode active
                    console.log('[HUD] Command mode active, waiting for target selection')
                  }}
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
      
      {/* Territory Debug Toggle Button */}
      <button 
        onClick={() => setTerritoryDebugMode(!territoryDebugMode)} 
        className="absolute top-20 right-4 px-2 py-1 bg-gray-800 text-white text-xs rounded pointer-events-auto hover:bg-gray-700 transition-colors"
      >
        🔍 Territory Debug
      </button>

      {/* Stale Tick Warning Indicator */}
      {isTickStale && (
        <div className="absolute top-32 right-4 px-3 py-2 bg-red-900/90 backdrop-blur rounded-lg text-white text-xs pointer-events-none border border-red-500">
          <div className="flex items-center space-x-2">
            <span className="animate-pulse">⚠️</span>
            <span>Game tick system stale</span>
          </div>
          <div className="text-xs text-gray-300 mt-1">
            Ticks may not be processing
          </div>
        </div>
      )}

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
        
        {/* Territory Expansion Stats */}
        {player?.id && (() => {
          const expansionRate = territoryControl.calculateExpansionRate(player.id)
          const frontierPlanets = territoryControl.getFrontierPlanets(player.id)
          const sectorCount = territoryControl.getSectorCount(player.id)
          
          return (
            <div className="mt-3 pt-3 border-t border-gray-600">
              <div className="text-xs text-gray-400 space-y-1">
                <div className="flex justify-between">
                  <span>Sectors:</span>
                  <span className="text-cyan-300">{sectorCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Expansion Rate:</span>
                  <span className="text-green-300">+{expansionRate}/min</span>
                </div>
                <div className="flex justify-between">
                  <span>Frontier Planets:</span>
                  <span className="text-yellow-300">{frontierPlanets.length}</span>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
      
      {/* Territory Debug Panel */}
      {territoryDebugMode && player?.id && (
        <div className="absolute top-32 right-4 p-4 w-80 bg-black/80 backdrop-blur rounded-lg text-white text-sm pointer-events-auto border border-cyan-500">
          <h4 className="font-bold mb-3 text-cyan-400">Territory Expansion Monitor</h4>
          
          {/* Total Sectors */}
          <div className="mb-3">
            <div className="text-xs text-gray-400 mb-1">Total Sectors in Game</div>
            <div className="text-2xl font-bold text-cyan-300">{territorySectors.length}</div>
          </div>
          
          {/* Sectors per Player */}
          <div className="mb-3">
            <div className="text-xs text-gray-400 mb-1">Distribution by Player</div>
            <div className="space-y-1">
              {Array.from(
                territorySectors.reduce((acc, s) => {
                  if (s.owner_id) {
                    acc.set(s.owner_id, (acc.get(s.owner_id) || 0) + 1)
                  }
                  return acc
                }, new Map<string, number>())
              )
              .sort((a, b) => b[1] - a[1])
              .map(([ownerId, count]) => {
                const percentage = (count / territorySectors.length * 100).toFixed(1)
                return (
                  <div key={ownerId} className="flex justify-between text-xs">
                    <span className={ownerId === player.id ? 'text-green-400' : 'text-gray-300'}>
                      {ownerId === player.id ? 'You' : ownerId.slice(0, 8)}
                    </span>
                    <span className="text-cyan-300">{count} ({percentage}%)</span>
                  </div>
                )
              })}
            </div>
          </div>
          
          {/* Your Expansion Stats */}
          <div className="mb-3 pt-3 border-t border-gray-600">
            <div className="text-xs text-gray-400 mb-1">Your Expansion Stats</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Expansion Rate:</span>
                <span className="text-green-400">+{territoryControl.calculateExpansionRate(player.id)}/min</span>
              </div>
              <div className="flex justify-between">
                <span>Frontier Planets:</span>
                <span className="text-yellow-400">{territoryControl.getFrontierPlanets(player.id).length}</span>
              </div>
              <div className="flex justify-between">
                <span>Your Sectors:</span>
                <span className="text-cyan-400">{territoryControl.getSectorCount(player.id)}</span>
              </div>
            </div>
          </div>
          
          {/* Recent Expansion Events */}
          {recentExpansions.length > 0 && (
            <div className="pt-3 border-t border-gray-600">
              <div className="text-xs text-gray-400 mb-1">Recent Expansions (Last 5)</div>
              <div className="space-y-1">
                {recentExpansions.map((event, idx) => {
                  const secondsAgo = Math.floor((Date.now() - event.timestamp) / 1000)
                  return (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-gray-300">{secondsAgo}s ago</span>
                      <span className="text-green-400">+{event.count} sectors</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          
          <div className="mt-3 pt-3 border-t border-gray-600 text-xs text-gray-500">
            Check browser console for [EXPANSION] and [TERRITORY] logs
          </div>
        </div>
      )}
      
      {/* Territory Expansion Notification */}
      {showExpansionNotification && (
        <div className="absolute top-24 right-4 p-3 bg-green-900/90 backdrop-blur rounded-lg text-white text-sm animate-bounce pointer-events-none border-2 border-green-400">
          <div className="font-bold">🌟 Territory Expanded</div>
          <div className="text-xs text-gray-300">+{newSectorCount} sectors captured</div>
        </div>
      )}
      
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
