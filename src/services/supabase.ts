import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types (will be generated from Supabase CLI later)
export interface Player {
  id: string
  username: string
  email?: string
  credits: number
  energy: number
  minerals: number
  research_points: number
  is_bot?: boolean
  bot_difficulty?: 'easy' | 'normal' | 'hard'
  created_at: string
}

export interface Game {
  id: string
  name: string
  status: 'waiting' | 'active' | 'completed'
  max_players: number
  current_players?: number
  victory_condition: number
  tick_rate: number
  is_public?: boolean
  created_at: string
  started_at?: string
  ended_at?: string
  game_players?: GamePlayer[]
  winner_id?: string
  victory_type?: 'territory_control' | 'elimination' | 'time_limit'
  game_duration_seconds?: number
}

export interface GamePlayer {
  game_id: string
  player_id: string
  empire_color: string
  is_alive: boolean
  systems_controlled: number
  placement_order: number
  is_ready?: boolean
  players?: Player
  is_eliminated: boolean
  eliminated_at?: string
  final_territory_percentage?: number
  total_troops_sent?: number
  planets_captured?: number
  final_placement?: number
  /** Tracks if player is currently connected. Set to false on disconnect/unload. */
  is_active?: boolean
  /** Timestamp of last heartbeat ping. Updated every 30 seconds by client. */
  last_seen?: string
}

export interface System {
  id: string
  game_id: string
  name: string
  x_pos: number
  y_pos: number
  z_pos: number
  owner_id?: string
  troop_count: number | null
  energy_generation: number
  has_minerals: boolean
  in_nebula: boolean
}

export interface TerritorySector {
  id: string
  game_id: string
  owner_id: string | null
  x_pos: number
  y_pos: number
  z_pos: number
  controlled_by_planet_id: string
  captured_at: string
  expansion_tier?: number  // 1-3 indicating expansion phase
  expansion_wave?: number  // wave number for edge-based expansion
  distance_from_planet?: number  // distance from controlling planet
}

export interface ExpansionMetrics {
  ownershipDuration: number  // ticks owned
  currentTier: number  // 1, 2, or 3
  expansionRadius: number  // current expansion radius
  sectorsPerWave: number  // how many sectors to add per expansion
}

export interface CombatLog {
  id: string
  game_id: string
  attacker_id: string
  defender_id: string | null
  system_id: string
  attacker_troops: number
  defender_troops: number
  attacker_losses: number
  defender_losses: number
  attacker_survivors: number
  defender_survivors: number
  winner_id: string | null
  terrain_type: string
  had_flanking: boolean
  was_encircled: boolean
  had_defense_station: boolean
  combat_result: 'attacker_victory' | 'defender_victory' | 'retreat'
  occurred_at: string
}

export interface GameStats {
  id: string
  game_id: string
  player_id: string
  final_planets_controlled: number
  final_territory_percentage: number
  total_troops_sent: number
  total_troops_lost: number
  planets_captured: number
  planets_lost: number
  structures_built: number
  total_combat_wins: number
  total_combat_losses: number
  peak_territory_percentage: number
  created_at: string
}

export interface Structure {
  id: string
  game_id: string
  system_id: string
  owner_id: string
  structure_type: 'trade_station' | 'mining_station' | 'colony_station' | 'defense_platform' | 'missile_battery' | 'point_defense'
  level: number
  health: number
  built_at: string
  is_active: boolean
}
