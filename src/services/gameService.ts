// Game service adapted from OpenFront's server-side architecture
import { supabase } from './supabase'
import type { Game, System } from './supabase'
import { REAL_STELLAR_SYSTEMS } from '../data/stellarSystems'

export interface CreateGameParams {
  name: string
  maxPlayers: number
  victoryCondition: number
  isPublic?: boolean
  gameMap?: string
  difficulty?: string
}

export interface JoinGameParams {
  gameId: string
  playerId: string
  empireColor: string
}

export class GameService {
  private static readonly STARTING_TROOP_COUNT = 100
  
  // Create a new game (adapted from OpenFront's /api/create_game)
  // NOTE: This method uses the 'difficulty' column at line 37. If you encounter
  // "Could not find the 'difficulty' column of 'games' in the schema cache" errors,
  // run database/add_difficulty_column.sql migration and reload PostgREST schema cache.
  // See SUPABASE_SCHEMA_CACHE_REFRESH.md for detailed instructions.
  async createGame(creatorPlayerId: string, params: CreateGameParams): Promise<Game> {
    try {
      // Create game
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({
          name: params.name,
          status: 'waiting',
          max_players: params.maxPlayers,
          victory_condition: params.victoryCondition || 80,
          tick_rate: 100,
          is_public: params.isPublic || false,
          difficulty: params.difficulty || 'normal', // Used for bot AI behavior (easy/normal/hard)
          created_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (gameError) throw gameError
      if (!game) throw new Error('Failed to create game')
      
      // Add creator as first player (host)
      const { error: playerError } = await supabase
        .from('game_players')
        .insert({
          game_id: game.id,
          player_id: creatorPlayerId,
          empire_color: this.generateRandomColor(),
          is_alive: true,
          systems_controlled: 0,
          placement_order: 1
        })
      
      if (playerError) throw playerError
      
      console.log(`Created game ${game.id} with creator ${creatorPlayerId}`)
      
      return game
    } catch (error) {
      console.error('Error creating game:', error)
      throw error
    }
  }
  
  // Join an existing game (adapted from OpenFront's join flow)
  async joinGame(params: JoinGameParams): Promise<boolean> {
    try {
      // Check if game exists and is waiting
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('*, game_players(count)')
        .eq('id', params.gameId)
        .single()
      
      if (gameError) throw gameError
      if (!game) {
        console.error('Game not found')
        return false
      }
      
      if (game.status !== 'waiting') {
        console.error('Game already started')
        return false
      }
      
      // Check if game is full
      const currentPlayers = game.game_players?.[0]?.count || 0
      if (currentPlayers >= game.max_players) {
        console.error('Game is full')
        return false
      }
      
      // Add player to game
      const { error: joinError } = await supabase
        .from('game_players')
        .insert({
          game_id: params.gameId,
          player_id: params.playerId,
          empire_color: params.empireColor,
          is_alive: true,
          systems_controlled: 0,
          placement_order: currentPlayers + 1
        })
      
      if (joinError) {
        // Check if player is already in the game
        if (joinError.code === '23505') { // Unique constraint violation
          console.log('Player already in game')
          return true
        }
        throw joinError
      }
      
      console.log(`Player ${params.playerId} joined game ${params.gameId}`)
      
      return true
    } catch (error) {
      console.error('Error joining game:', error)
      throw error
    }
  }
  
  // Start the game (adapted from OpenFront's /api/start_game)
  async startGame(gameId: string, hostPlayerId: string): Promise<boolean> {
    try {
      // Fetch game info for capacity calculations
      const { data: gameRecord, error: gameRecordError } = await supabase
        .from('games')
        .select('id, max_players, status, difficulty')
        .eq('id', gameId)
        .single()

      if (gameRecordError) throw gameRecordError
      if (!gameRecord) {
        console.error('Game not found')
        return false
      }

      if (gameRecord.status !== 'waiting') {
        console.error('Game already started')
        return false
      }

      // Verify the player is the host (first player)
      const { data: initialPlayers, error: playersError } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', gameId)
        .order('placement_order', { ascending: true })
      
      if (playersError) throw playersError
      if (!initialPlayers || initialPlayers.length === 0) {
        console.error('No players in game')
        return false
      }

      let players = initialPlayers
      
      // Check if requestor is the host
      if (players[0].player_id !== hostPlayerId) {
        console.error('Only the host can start the game')
        return false
      }
      
      // Check minimum players
      if (players.length < 1) {
        console.error('Not enough players to start')
        return false
      }

      // Auto-fill with bot players if lobby isn't full
      const botsNeeded = Math.max(0, (gameRecord.max_players || players.length) - players.length)
      if (botsNeeded > 0) {
        // Pass difficulty to add_bots_to_game RPC, which stores it in players table
        // Edge Function (game-tick/index.ts) reads this to apply difficulty multipliers
        const difficulty = gameRecord.difficulty || 'normal'
        const { error: botsError } = await supabase.rpc('add_bots_to_game', {
          p_game_id: gameId,
          p_num_bots: botsNeeded,
          p_difficulty: difficulty // Configures bot AI behavior in Edge Function
        })

        if (botsError) throw botsError

        const { data: refreshedPlayers, error: refreshedPlayersError } = await supabase
          .from('game_players')
          .select('*')
          .eq('game_id', gameId)
          .order('placement_order', { ascending: true })

        if (refreshedPlayersError) throw refreshedPlayersError
        if (!refreshedPlayers) throw new Error('Failed to retrieve players after adding bots')
        players = refreshedPlayers
      }
      
      // Update game status to active
      const { error: updateError } = await supabase
        .from('games')
        .update({
          status: 'active',
          started_at: new Date().toISOString()
        })
        .eq('id', gameId)
      
      if (updateError) throw updateError
      
      // Generate solar-system scale map for the game
      await this.generateSolarSystemMap(gameId, players.length)

      // Assign initial planets to each player
      await this.assignStartingPlanets(gameId, players)
      
      console.log(`Game ${gameId} started with ${players.length} players (difficulty: ${gameRecord.difficulty || 'normal'})`)
      
      return true
    } catch (error) {
      console.error('Error starting game:', error)
      throw error
    }
  }
  
  // Generate a solar-system scale map using real Milky Way data
  private async generateSolarSystemMap(gameId: string, playerCount: number): Promise<void> {
    try {
      const viableSystems = REAL_STELLAR_SYSTEMS.filter(system => system.planets.length >= 4)
      if (viableSystems.length === 0) {
        throw new Error('No viable stellar systems available for map generation')
      }

      const selectedSystem = viableSystems[Math.floor(Math.random() * viableSystems.length)]
      const orbitalScale = 350 // scales AU distances into gameplay space
      const systems: Omit<System, 'id' | 'created_at'>[] = []

      selectedSystem.planets.forEach((planet, index) => {
        const orbitalAngle = (2 * Math.PI * index) / selectedSystem.planets.length + Math.random() * 0.4
        const distance = Math.max(planet.semiMajorAxisAu, 0.02) * orbitalScale + 50
        const inclination = (Math.random() - 0.5) * 0.25

        systems.push({
          game_id: gameId,
          name: planet.name,
          x_pos: Math.cos(orbitalAngle) * distance,
          y_pos: Math.sin(orbitalAngle) * distance,
          z_pos: distance * inclination,
          owner_id: undefined,
          troop_count: 0,
          energy_generation: 80 + Math.round(planet.radiusEarth * 12),
          has_minerals: planet.radiusEarth >= 1.5,
          in_nebula: planet.orbitalEccentricity ? planet.orbitalEccentricity > 0.2 : Math.random() > 0.85
        })
      })

      // Add additional resource nodes (asteroid belts) for parity with OpenFront pacing
      const supplementalNodes = Math.max(playerCount * 2, 6)
      for (let i = 0; i < supplementalNodes; i++) {
        const orbit = 200 + i * 60
        const theta = Math.random() * Math.PI * 2
        systems.push({
          game_id: gameId,
          name: `Asteroid Belt ${i + 1}`,
          x_pos: Math.cos(theta) * orbit,
          y_pos: Math.sin(theta) * orbit,
          z_pos: (Math.random() - 0.5) * 80,
          owner_id: undefined,
          troop_count: 0,
          energy_generation: 60 + Math.floor(Math.random() * 40),
          has_minerals: true,
          in_nebula: Math.random() > 0.7
        })
      }

      const { error } = await supabase
        .from('systems')
        .insert(systems)

      if (error) throw error

      console.log(`Generated solar system map '${selectedSystem.name}' with ${systems.length} nodes for game ${gameId}`)
    } catch (error) {
      console.error('Error generating solar-system map:', error)
      throw error
    }
  }
  
  // Leave game (before it starts)
  async leaveGame(gameId: string, playerId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('game_players')
        .delete()
        .eq('game_id', gameId)
        .eq('player_id', playerId)
      
      if (error) throw error
      
      // Check if game is now empty and delete if so
      const { data: players } = await supabase
        .from('game_players')
        .select('player_id')
        .eq('game_id', gameId)
      
      if (!players || players.length === 0) {
        await supabase
          .from('games')
          .delete()
          .eq('id', gameId)
        
        console.log(`Deleted empty game ${gameId}`)
      }
      
      return true
    } catch (error) {
      console.error('Error leaving game:', error)
      throw error
    }
  }
  
  // Get game info (adapted from OpenFront's /api/game/:id/exists)
  async getGameInfo(gameId: string): Promise<Game | null> {
    try {
      const { data, error } = await supabase
        .from('games')
        .select(`
          *,
          game_players (
            player_id,
            empire_color,
            placement_order,
            players (
              username
            )
          )
        `)
        .eq('id', gameId)
        .single()
      
      if (error) {
        console.error('Error fetching game info:', error)
        return null
      }
      
      return data
    } catch (error) {
      console.error('Error getting game info:', error)
      return null
    }
  }
  
  // Check if game exists (adapted from OpenFront's exists check)
  async gameExists(gameId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('id')
        .eq('id', gameId)
        .single()
      
      if (error) return false
      return !!data
    } catch (error) {
      return false
    }
  }
  
  // List public games (adapted from OpenFront's public lobbies)
  async listPublicGames(): Promise<Game[]> {
    try {
      const { data, error } = await supabase
        .from('games')
        .select(`
          *,
          game_players (count)
        `)
        .eq('status', 'waiting')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(20)
      
      if (error) throw error
      
      return data || []
    } catch (error) {
      console.error('Error listing public games:', error)
      return []
    }
  }
  
  // Helper to generate random empire color
  private generateRandomColor(): string {
    const colors = [
      '#FF6B6B', // Red
      '#4ECDC4', // Cyan
      '#45B7D1', // Blue
      '#F7DC6F', // Yellow
      '#BB8FCE', // Purple
      '#52C980', // Green
      '#FF8B94', // Pink
      '#FFA726', // Orange
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  private async assignStartingPlanets(gameId: string, players: { player_id: string }[]): Promise<void> {
    if (players.length === 0) return

    const { data: neutralSystems, error: systemsError } = await supabase
      .from('systems')
      .select('id')
      .eq('game_id', gameId)
      .is('owner_id', null)

    if (systemsError) throw systemsError
    if (!neutralSystems || neutralSystems.length < players.length) {
      throw new Error('Not enough neutral systems available to assign starting planets')
    }

    const availableSystems = [...neutralSystems]

    for (const player of players) {
      const systemIndex = Math.floor(Math.random() * availableSystems.length)
      const [assignedSystem] = availableSystems.splice(systemIndex, 1)

      const { error: updateSystemError } = await supabase
        .from('systems')
        .update({ owner_id: player.player_id, troop_count: GameService.STARTING_TROOP_COUNT })
        .eq('id', assignedSystem.id)

      if (updateSystemError) throw updateSystemError

      const { error: updatePlayerError } = await supabase
        .from('game_players')
        .update({ systems_controlled: 1 })
        .eq('game_id', gameId)
        .eq('player_id', player.player_id)

      if (updatePlayerError) throw updatePlayerError
    }
  }
}

// Export singleton instance
export const gameService = new GameService()
