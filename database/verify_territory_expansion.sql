-- Verify territory expansion is working
-- Run these queries in Supabase SQL Editor to check territory state

-- 1. Check total sectors per game
SELECT 
  game_id,
  COUNT(*) as total_sectors,
  COUNT(DISTINCT owner_id) as unique_owners,
  COUNT(DISTINCT controlled_by_planet_id) as unique_planets
FROM territory_sectors
GROUP BY game_id
ORDER BY total_sectors DESC;

-- 2. Check sector distribution by tier
SELECT 
  game_id,
  expansion_tier,
  COUNT(*) as sector_count
FROM territory_sectors
GROUP BY game_id, expansion_tier
ORDER BY game_id, expansion_tier;

-- 3. Check recent sector additions (last 5 minutes)
SELECT 
  game_id,
  owner_id,
  controlled_by_planet_id,
  expansion_tier,
  expansion_wave,
  captured_at,
  EXTRACT(EPOCH FROM (NOW() - captured_at)) as age_seconds
FROM territory_sectors
WHERE captured_at > NOW() - INTERVAL '5 minutes'
ORDER BY captured_at DESC
LIMIT 50;

-- 4. Check sectors per planet
SELECT 
  s.name as planet_name,
  s.owner_id,
  COUNT(ts.id) as sector_count,
  MAX(ts.expansion_tier) as max_tier,
  MAX(ts.expansion_wave) as max_wave
FROM systems s
LEFT JOIN territory_sectors ts ON ts.controlled_by_planet_id = s.id
WHERE s.owner_id IS NOT NULL
GROUP BY s.id, s.name, s.owner_id
ORDER BY sector_count DESC;

-- 5. Check for orphaned sectors (sectors with no controlling planet)
SELECT 
  ts.id,
  ts.game_id,
  ts.controlled_by_planet_id,
  ts.owner_id
FROM territory_sectors ts
LEFT JOIN systems s ON s.id = ts.controlled_by_planet_id
WHERE s.id IS NULL;

-- 6. Check expansion rate (sectors added per minute)
SELECT 
  game_id,
  owner_id,
  COUNT(*) as sectors_last_minute,
  COUNT(*) * 1.0 as expansion_rate_per_minute
FROM territory_sectors
WHERE captured_at > NOW() - INTERVAL '1 minute'
GROUP BY game_id, owner_id
ORDER BY expansion_rate_per_minute DESC;

-- 7. Check if territory transfers on capture are working
SELECT 
  ts.id,
  ts.controlled_by_planet_id,
  ts.owner_id as sector_owner,
  s.owner_id as planet_owner,
  CASE WHEN ts.owner_id = s.owner_id THEN 'MATCH' ELSE 'MISMATCH' END as status
FROM territory_sectors ts
JOIN systems s ON s.id = ts.controlled_by_planet_id
WHERE ts.owner_id != s.owner_id;
