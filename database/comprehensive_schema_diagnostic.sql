-- Comprehensive Schema Diagnostic Script
-- Checks for all required columns across games, game_players, systems, and players tables
-- and provides migration recommendations.

WITH required_columns AS (
    SELECT 'games' as table_name, 'difficulty' as column_name, 'text' as expected_type, 'normal' as expected_default, 'add_difficulty_column.sql' as migration_file
    UNION ALL SELECT 'games', 'tick_rate', 'integer', '100', 'add_tick_rate_column.sql'
    UNION ALL SELECT 'games', 'victory_condition', 'integer', '80', 'add_victory_condition_column.sql'
    UNION ALL SELECT 'games', 'is_public', 'boolean', 'false', 'add_is_public_column.sql'
    UNION ALL SELECT 'game_players', 'empire_color', 'text', NULL, 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'is_alive', 'boolean', 'true', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'systems_controlled', 'integer', '0', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'is_ready', 'boolean', 'false', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'is_eliminated', 'boolean', 'false', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'final_territory_percentage', 'numeric', NULL, 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'total_troops_sent', 'integer', '0', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'planets_captured', 'integer', '0', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'placement_order', 'integer', NULL, 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'systems', 'troop_count', 'integer', '0', 'add_economic_columns.sql'
    UNION ALL SELECT 'systems', 'energy_generation', 'numeric', NULL, 'add_economic_columns.sql'
    UNION ALL SELECT 'systems', 'has_minerals', 'boolean', 'false', 'add_economic_columns.sql'
    UNION ALL SELECT 'systems', 'in_nebula', 'boolean', 'false', 'add_economic_columns.sql'
    UNION ALL SELECT 'players', 'is_bot', 'boolean', 'false', 'add_bot_players.sql'
    UNION ALL SELECT 'players', 'bot_difficulty', 'text', 'normal', 'fix_bot_functions.sql'
    UNION ALL SELECT 'players', 'credits', 'integer', '0', 'add_economic_columns.sql'
    UNION ALL SELECT 'players', 'energy', 'integer', '0', 'add_economic_columns.sql'
    UNION ALL SELECT 'players', 'minerals', 'integer', '0', 'add_economic_columns.sql'
    UNION ALL SELECT 'players', 'research_points', 'integer', '0', 'add_economic_columns.sql'
),
column_check AS (
    SELECT 
        rc.table_name,
        rc.column_name,
        rc.expected_type,
        rc.expected_default,
        rc.migration_file,
        CASE WHEN c.column_name IS NOT NULL THEN '✅' ELSE '❌' END as status,
        c.data_type as actual_type,
        c.column_default as actual_default
    FROM required_columns rc
    LEFT JOIN information_schema.columns c 
        ON rc.table_name = c.table_name 
        AND rc.column_name = c.column_name
        AND c.table_schema = 'public'
)
SELECT 
    table_name,
    column_name,
    status,
    expected_type,
    COALESCE(actual_type, 'MISSING') as current_type,
    expected_default,
    COALESCE(actual_default, 'MISSING') as current_default,
    migration_file
FROM column_check
ORDER BY table_name, column_name;

-- Summary of missing migrations
WITH required_columns AS (
    SELECT 'games' as table_name, 'difficulty' as column_name, 'add_difficulty_column.sql' as migration_file
    UNION ALL SELECT 'games', 'tick_rate', 'add_tick_rate_column.sql'
    UNION ALL SELECT 'games', 'victory_condition', 'add_victory_condition_column.sql'
    UNION ALL SELECT 'games', 'is_public', 'add_is_public_column.sql'
    UNION ALL SELECT 'game_players', 'empire_color', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'is_alive', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'systems_controlled', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'is_ready', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'is_eliminated', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'final_territory_percentage', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'total_troops_sent', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'planets_captured', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'game_players', 'placement_order', 'add_game_players_missing_columns.sql'
    UNION ALL SELECT 'systems', 'troop_count', 'add_economic_columns.sql'
    UNION ALL SELECT 'systems', 'energy_generation', 'add_economic_columns.sql'
    UNION ALL SELECT 'systems', 'has_minerals', 'add_economic_columns.sql'
    UNION ALL SELECT 'systems', 'in_nebula', 'add_economic_columns.sql'
    UNION ALL SELECT 'players', 'is_bot', 'add_bot_players.sql'
    UNION ALL SELECT 'players', 'bot_difficulty', 'fix_bot_functions.sql'
    UNION ALL SELECT 'players', 'credits', 'add_economic_columns.sql'
    UNION ALL SELECT 'players', 'energy', 'add_economic_columns.sql'
    UNION ALL SELECT 'players', 'minerals', 'add_economic_columns.sql'
    UNION ALL SELECT 'players', 'research_points', 'add_economic_columns.sql'
)
SELECT DISTINCT 
    'MISSING COLUMN: ' || rc.table_name || '.' || rc.column_name || ' -> Run ' || rc.migration_file as recommendation
FROM required_columns rc
LEFT JOIN information_schema.columns c 
    ON rc.table_name = c.table_name 
    AND rc.column_name = c.column_name
    AND c.table_schema = 'public'
WHERE c.column_name IS NULL
ORDER BY recommendation;
