// Supabase Edge Function - Mark player inactive
// Lightweight endpoint for navigator.sendBeacon calls from beforeunload handlers
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req: Request) => {
  // CORS headers constant for consistent response formatting across all paths
  const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    })
  }

  try {
    const { gameId, playerId } = await req.json()
    
    if (!gameId || !playerId) {
      return new Response(
        JSON.stringify({ error: 'gameId and playerId required' }), 
        { 
          status: 400,
          headers: CORS_HEADERS
        }
      )
    }

    // Mark player as inactive
    const { error } = await supabase
      .from('game_players')
      .update({ is_active: false })
      .eq('game_id', gameId)
      .eq('player_id', playerId)

    if (error) {
      console.error('[MARK-INACTIVE] Error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to mark player inactive' }), 
        { 
          status: 500,
          headers: CORS_HEADERS
        }
      )
    }

    console.log(`[MARK-INACTIVE] Player ${playerId} marked inactive for game ${gameId}`)

    return new Response(
      JSON.stringify({ success: true }), 
      { 
        headers: CORS_HEADERS
      }
    )
  } catch (error) {
    console.error('[MARK-INACTIVE] Exception:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { 
        status: 500,
        headers: CORS_HEADERS
      }
    )
  }
})
