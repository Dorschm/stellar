# Stellar - 3D Space RTS

A 3D space real-time strategy game inspired by OpenFront.io, built with Three.js, React, and Supabase.

## Features Implemented

### Core Systems
- ✅ 3D galaxy with solar systems and nebulas
- ✅ Fleet management with different ship types (scout, attack, defense, carrier, trade)
- ✅ Resource system (energy, credits, minerals, research)
- ✅ Real-time resource generation based on owned systems
- ✅ Interactive HUD with system and fleet information
- ✅ Camera controls with orbit, zoom, and pan

### Game Mechanics
- Energy regeneration using OpenFront formula (optimal at 42% capacity)
- 3D combat calculations with flanking and elevation bonuses
- Encirclement detection for instant surrender
- Territory control through solar system capture
- Progressive territory expansion system (OpenFront-style)

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **3D Graphics**: Three.js with React Three Fiber
- **Backend**: Supabase (PostgreSQL)
- **State Management**: Zustand
- **Styling**: TailwindCSS

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Add your Supabase credentials to `.env`:
   ```
   VITE_SUPABASE_URL=your_url_here
   VITE_SUPABASE_ANON_KEY=your_key_here
   ```
4. Run the development server: `npm run dev`
5. Open http://localhost:3000

## Controls

- **Camera**: Click and drag to orbit, scroll to zoom
- **Selection**: Click on systems or fleets to select
- **Build**: Select an owned system and click "Build Structure"

## Territory Expansion System

### Overview
The territory expansion system mimics OpenFront's progressive tile growth, adapted for 3D space. Planets automatically expand their territory over time by creating sectors in a spherical pattern.

### How It Works
1. **Server-Side (game-tick/index.ts)**: Every 10 ticks (adjustable based on planet conditions), the server generates new sectors around owned planets
2. **Database (territory_sectors)**: Sectors are stored with metadata (tier, wave, distance, owner)
3. **Client Sync (Game.tsx)**: Client polls and subscribes to territory_sectors table for updates
4. **Rendering (TerritorySector.tsx)**: Sectors are rendered as colored boxes with animations

### Verification Steps

#### 1. Check Server Logs
Look for expansion messages in the game-tick function logs:
```
[EXPANSION] Checking planet <id> owned by <player> for <N> ticks
[EXPANSION] Created <N> new sectors this tick
```

#### 2. Run Database Queries
Use the queries in `database/verify_territory_expansion.sql` to check:
- Total sectors per game
- Recent sector additions
- Sector distribution by tier
- Orphaned sectors

#### 3. Enable Debug Mode
In the HUD, click the "🔍 Territory Debug" button to see:
- Real-time sector counts
- Expansion rates
- Frontier planets
- Recent expansion events

#### 4. Check Browser Console
Look for territory sync messages:
```
[TERRITORY] Fetched <N> sectors from database
[TERRITORY] Syncing <N> sectors
[TERRITORY] Stats updated
```

### Troubleshooting

**No sectors appearing:**
- Verify game-tick function is running (check for tick logs)
- Check RLS policies on territory_sectors table
- Ensure planets have owners (neutral planets don't expand)

**Sectors not rendering:**
- Check client sync logs in browser console
- Verify playerColors map is populated
- Inspect territorySectors array in gameStore

**Slow expansion:**
- Check tick rate (should be 100ms)
- Verify expansion interval calculations (default 10 ticks)
- Check for modifiers (nebula slows, minerals speed up)

**Territory not transferring on capture:**
- Check combat resolution logs
- Verify territory_sectors UPDATE queries are executing
- Run query #7 from verify_territory_expansion.sql to find mismatches

## Project Status

This is an active development project adapting OpenFront.io's 2D territory control mechanics to 3D space. Current focus is on core gameplay mechanics and multiplayer infrastructure.

## Based On

- [OpenFront.io](https://openfront.io) - Original 2D territory control game
- [OpenFrontIO GitHub](https://github.com/openfrontio/OpenFrontIO) - Open source reference

## License

TBD
