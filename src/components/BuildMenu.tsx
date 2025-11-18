import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

interface Structure {
  id: string
  name: string
  type: string
  cost: {
    credits: number
    minerals: number
    energy: number
  }
  description: string
  icon: string
}

const STRUCTURES: Structure[] = [
  {
    id: 'trade-station',
    name: 'Trade Station',
    type: 'economic',
    cost: { credits: 50000, minerals: 500, energy: 1000 },
    description: 'Generates credits through trade routes',
    icon: '💰'
  },
  {
    id: 'mining-station',
    name: 'Mining Station',
    type: 'economic',
    cost: { credits: 50000, minerals: 200, energy: 500 },
    description: 'Extracts minerals from asteroid fields',
    icon: '⛏️'
  },
  {
    id: 'colony-station',
    name: 'Colony Station',
    type: 'economic',
    cost: { credits: 100000, minerals: 1000, energy: 2000 },
    description: 'Increases energy capacity by 25,000',
    icon: '🏙️'
  },
  {
    id: 'defense-platform',
    name: 'Defense Platform',
    type: 'military',
    cost: { credits: 25000, minerals: 500, energy: 500 },
    description: '5x defense multiplier in range',
    icon: '🛡️'
  },
  {
    id: 'missile-battery',
    name: 'Missile Battery',
    type: 'military',
    cost: { credits: 75000, minerals: 1000, energy: 1000 },
    description: 'Launch space torpedoes at enemies',
    icon: '🚀'
  },
  {
    id: 'point-defense',
    name: 'Point Defense',
    type: 'military',
    cost: { credits: 50000, minerals: 750, energy: 750 },
    description: 'Intercepts incoming torpedoes',
    icon: '🎯'
  }
]

interface BuildMenuProps {
  isOpen: boolean
  onClose: () => void
  systemId?: string
}

export function BuildMenu({ isOpen, onClose, systemId }: BuildMenuProps) {
  const [selectedStructure, setSelectedStructure] = useState<Structure | null>(null)
  const resources = useGameStore(state => state.resources)
  const buildStructure = useGameStore(state => state.buildStructure)
  
  if (!isOpen || !systemId) return null
  
  const canAfford = (structure: Structure) => {
    return resources.credits >= structure.cost.credits &&
           resources.minerals >= structure.cost.minerals &&
           resources.energy >= structure.cost.energy
  }
  
  const handleBuild = (structure: Structure) => {
    if (canAfford(structure)) {
      buildStructure(systemId, structure.type)
      // TODO: Deduct resources
      onClose()
    }
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Build Structure</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4 overflow-y-auto max-h-[60vh]">
          {STRUCTURES.map(structure => (
            <div
              key={structure.id}
              className={`
                border rounded-lg p-4 cursor-pointer transition-all
                ${selectedStructure?.id === structure.id
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                }
                ${!canAfford(structure) ? 'opacity-50' : ''}
              `}
              onClick={() => setSelectedStructure(structure)}
            >
              <div className="flex items-start space-x-3">
                <span className="text-3xl">{structure.icon}</span>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">{structure.name}</h3>
                  <p className="text-sm text-gray-400 mb-2">{structure.description}</p>
                  
                  {/* Cost */}
                  <div className="flex space-x-3 text-sm">
                    <span className={`${resources.credits >= structure.cost.credits ? 'text-green-400' : 'text-red-400'}`}>
                      💰 {structure.cost.credits.toLocaleString()}
                    </span>
                    <span className={`${resources.minerals >= structure.cost.minerals ? 'text-blue-400' : 'text-red-400'}`}>
                      💎 {structure.cost.minerals.toLocaleString()}
                    </span>
                    <span className={`${resources.energy >= structure.cost.energy ? 'text-yellow-400' : 'text-red-400'}`}>
                      ⚡ {structure.cost.energy.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Action buttons */}
        <div className="flex justify-end space-x-3 mt-4 pt-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedStructure && handleBuild(selectedStructure)}
            disabled={!selectedStructure || !canAfford(selectedStructure)}
            className={`
              px-4 py-2 rounded transition-colors text-white
              ${selectedStructure && canAfford(selectedStructure)
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-700 opacity-50 cursor-not-allowed'
              }
            `}
          >
            Build
          </button>
        </div>
      </div>
    </div>
  )
}
