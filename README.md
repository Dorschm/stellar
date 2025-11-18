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

## Project Status

This is an active development project adapting OpenFront.io's 2D territory control mechanics to 3D space. Current focus is on core gameplay mechanics and multiplayer infrastructure.

## Based On

- [OpenFront.io](https://openfront.io) - Original 2D territory control game
- [OpenFrontIO GitHub](https://github.com/openfrontio/OpenFrontIO) - Open source reference

## License

TBD
