# Stellar - OpenFront-Style Space RTS

## Gameplay Overview

This is a real-time strategy game adapted from [OpenFront.io](https://openfront.io/) but set in space with planets instead of land territories.

## Core Mechanics (OpenFront-Style)

### 1. **Territory Control**
- **Planets = Tiles**: Each planet is like a "tile" in OpenFront
- Players paint the map by capturing planets
- Green = Your planets, Red = Enemy planets, Gray = Neutral

### 2. **Troops System**
- Every owned planet has **troops** (displayed above planet)
- Planets **auto-generate troops** every tick (5 troops/tick by default)
- Maximum troops per planet: **500**
- Troops are used to attack and defend

### 3. **Attacking (Click & Send)**
- **Step 1**: Click one of your planets to select it
- **Step 2**: Click "Send Troops (50%)" button
- **Step 3**: Click target planet to send 50% of your troops there
- Troops travel through space (visible as moving spheres with troop count)
- When troops arrive:
  - **Friendly planet**: Reinforces (adds troops up to max)
  - **Enemy/Neutral planet**: Combat occurs (simple subtraction - higher wins)

### 4. **Resources**
- **Gold**: Main resource, generates from owned planets (10 gold/planet/tick)
- **Planets**: Number of planets you control
- **Troops**: Total troops across all your planets
- **Attacks**: Number of active troop movements

### 5. **Victory**
- Capture enemy planets by sending more troops than they have
- Expand your territory to generate more gold and troops
- Last player standing wins

## Controls

### Camera
- **Left Click + Drag**: Rotate view
- **Right Click + Drag**: Pan camera
- **Mouse Wheel**: Zoom in/out

### Gameplay
1. **Click planet** - Select/view planet info
2. **Send Troops** - Click button, then click target
3. **Auto-Growth** - Planets generate troops automatically
4. **Watch battles** - Troops travel as visible spheres

## Differences from Traditional Fleet-Based RTS

**OLD (Fleet-Based)**:
- Build fleets manually
- Deploy ships from systems
- Move fleets around manually
- Explicit attack commands

**NEW (OpenFront-Style)**:
- ✅ Planets auto-generate troops
- ✅ Click & send troops (50% at a time)
- ✅ Troops travel automatically
- ✅ Simple combat (subtract troops, winner captures)
- ✅ Territory expansion focus
- ✅ Fast-paced, streamlined gameplay

## Game Flow

1. **Start**: Each player gets 1 random planet with 100 troops
2. **Grow**: Planets auto-generate troops every 100ms (game tick)
3. **Expand**: Send troops to neutral planets to capture them
4. **Attack**: Send troops to enemy planets to conquer
5. **Defend**: Keep troops on planets to defend against attacks
6. **Dominate**: Control the most planets to win

## Technical Details

- **Tick Rate**: 10 ticks per second (100ms intervals)
- **Troop Generation**: 5 troops per tick per planet
- **Max Troops**: 500 per planet
- **Gold Generation**: 10 gold per planet per tick
- **Travel Speed**: 2 distance units per tick
- **Combat**: Simple subtraction (attacker troops - defender troops)

## Strategy Tips

1. **Mass troops** on border planets before attacking
2. **Send 50%** to keep some defense at home
3. **Chain attacks** by timing troop arrivals
4. **Expand early** to increase troop production
5. **Don't overextend** - protect your territory

---

**Based on**: [OpenFront.io](https://github.com/openfrontio/OpenFrontIO)  
**Adapted for**: Space / Solar system scale gameplay
