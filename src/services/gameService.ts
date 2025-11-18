// Game service adapted from OpenFront's server-side architecture
import { supabase } from './supabase'
import type { Game, Player, System } from './supabase'

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
  
  // Create a new game (adapted from OpenFront's /api/create_game)
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
      // Verify the player is the host (first player)
      const { data: players, error: playersError } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', gameId)
        .order('placement_order', { ascending: true })
      
      if (playersError) throw playersError
      if (!players || players.length === 0) {
        console.error('No players in game')
        return false
      }
      
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
      
      // Update game status to active
      const { error: updateError } = await supabase
        .from('games')
        .update({
          status: 'active',
          started_at: new Date().toISOString()
        })
        .eq('id', gameId)
      
      if (updateError) throw updateError
      
      // Generate galaxy for the game
      await this.generateGalaxy(gameId, players.length)
      
      console.log(`Game ${gameId} started with ${players.length} players`)
      
      return true
    } catch (error) {
      console.error('Error starting game:', error)
      throw error
    }
  }
  
  // Generate galaxy (adapted from OpenFront's map generation)
  private async generateGalaxy(gameId: string, playerCount: number): Promise<void> {
    try {
      const systems: Omit<System, 'id' | 'created_at'>[] = []
      const gridSize = Math.max(5, Math.ceil(Math.cbrt(playerCount * 20))) // Scale with players
      const spacing = 50
      
      // Generate systems in 3D grid
      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          for (let z = 0; z < gridSize; z++) {
            systems.push({
              game_id: gameId,
              name: `System ${String.fromCharCode(65 + x)}${y}${z}`,
              x_pos: (x - gridSize / 2) * spacing,
              y_pos: (y - gridSize / 2) * spacing,
              z_pos: (z - gridSize / 2) * spacing,
              owner_id: undefined,
              energy_generation: 100 + Math.floor(Math.random() * 100),
              has_minerals: Math.random() > 0.7,
              in_nebula: Math.random() > 0.9
            })
          }
        }
      }
      
      // Insert all systems
      const { error } = await supabase
        .from('systems')
        .insert(systems)
      
      if (error) throw error
      
      console.log(`Generated ${systems.length} systems for game ${gameId}`)
    } catch (error) {
      console.error('Error generating galaxy:', error)
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
}

// Export singleton instance
export const gameService = new GameService()
