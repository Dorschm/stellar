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
  created_at: string
}

export interface Game {
  id: string
  name: string
  status: 'waiting' | 'active' | 'completed'
  max_players: number
  victory_condition: number
  tick_rate: number
  created_at: string
  started_at?: string
  ended_at?: string
}

export interface System {
  id: string
  game_id: string
  name: string
  x_pos: number
  y_pos: number
  z_pos: number
  owner_id?: string
  energy_generation: number
  has_minerals: boolean
  in_nebula: boolean
}
