import { useGameStore } from '../store/gameStore'

export function HUD() {
  const resources = useGameStore(state => state.resources)
  const selectedSystem = useGameStore(state => state.selectedSystem)
  const selectedFleet = useGameStore(state => state.selectedFleet)
  const player = useGameStore(state => state.player)
  
  return (
    <>
      {/* Top Bar - Resources */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex justify-center space-x-8 text-white">
          <ResourceDisplay label="Energy" value={resources.energy} color="text-yellow-400" />
          <ResourceDisplay label="Credits" value={resources.credits} color="text-green-400" />
          <ResourceDisplay label="Minerals" value={resources.minerals} color="text-blue-400" />
          <ResourceDisplay label="Research" value={resources.research} color="text-purple-400" />
        </div>
      </div>
      
      {/* Left Panel - System Info */}
      {selectedSystem && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 p-4 w-80 pointer-events-none">
          <div className="bg-black/80 backdrop-blur rounded-lg p-4 text-white border border-gray-700">
            <h3 className="text-xl font-bold mb-3">{selectedSystem.name}</h3>
            <div className="space-y-2 text-sm">
              <InfoRow label="Position" value={`${selectedSystem.x_pos.toFixed(1)}, ${selectedSystem.y_pos.toFixed(1)}, ${selectedSystem.z_pos.toFixed(1)}`} />
              <InfoRow label="Energy Gen" value={`${selectedSystem.energy_generation}/tick`} />
              <InfoRow label="Minerals" value={selectedSystem.has_minerals ? 'Yes' : 'No'} />
              <InfoRow label="Nebula" value={selectedSystem.in_nebula ? 'Yes' : 'No'} />
              <InfoRow label="Owner" value={selectedSystem.owner_id === player?.id ? 'You' : selectedSystem.owner_id ? 'Enemy' : 'Neutral'} />
            </div>
            
            {/* Action Buttons */}
            <div className="mt-4 space-y-2 pointer-events-auto">
              {!selectedSystem.owner_id && (
                <button className="w-full bg-green-600 hover:bg-green-700 px-3 py-2 rounded transition-colors">
                  Capture System
                </button>
              )}
              {selectedSystem.owner_id === player?.id && (
                <>
                  <button className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded transition-colors">
                    Build Structure
                  </button>
                  <button className="w-full bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded transition-colors">
                    Deploy Fleet
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Right Panel - Fleet Info */}
      {selectedFleet && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 p-4 w-80 pointer-events-none">
          <div className="bg-black/80 backdrop-blur rounded-lg p-4 text-white border border-gray-700">
            <h3 className="text-xl font-bold mb-3">Fleet {selectedFleet.id.slice(0, 8)}</h3>
            <div className="space-y-2 text-sm">
              <InfoRow label="Type" value={selectedFleet.type} />
              <InfoRow label="Size" value={selectedFleet.size.toString()} />
              <InfoRow label="Health" value={`${selectedFleet.health}%`} />
              <InfoRow label="Position" value={`${selectedFleet.position.x.toFixed(1)}, ${selectedFleet.position.y.toFixed(1)}, ${selectedFleet.position.z.toFixed(1)}`} />
            </div>
            
            {/* Fleet Actions */}
            <div className="mt-4 space-y-2 pointer-events-auto">
              <button className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded transition-colors">
                Move Fleet
              </button>
              <button className="w-full bg-red-600 hover:bg-red-700 px-3 py-2 rounded transition-colors">
                Attack
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Bottom Bar - Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <div className="flex justify-center space-x-4">
          <ControlButton icon="🏗️" label="Build" />
          <ControlButton icon="🚀" label="Fleets" />
          <ControlButton icon="🔬" label="Research" />
          <ControlButton icon="🤝" label="Diplomacy" />
          <ControlButton icon="⚙️" label="Settings" />
        </div>
      </div>
    </>
  )
}

// Helper Components
function ResourceDisplay({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</span>
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

function ControlButton({ icon, label }: { icon: string; label: string }) {
  return (
    <button className="pointer-events-auto bg-gray-800/80 hover:bg-gray-700/80 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 text-white">
      <span className="text-xl">{icon}</span>
      <span className="text-sm">{label}</span>
    </button>
  )
}
