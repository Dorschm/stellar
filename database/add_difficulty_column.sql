-- Migration: Add difficulty column to games table
-- This allows storing bot difficulty setting when games are created

-- Add difficulty column to games table
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'normal';

-- Add check constraint to ensure only valid difficulty values
ALTER TABLE games 
ADD CONSTRAINT difficulty_check 
CHECK (difficulty IN ('easy', 'normal', 'hard'));

-- Update existing games to have 'normal' difficulty if NULL
UPDATE games 
SET difficulty = 'normal' 
WHERE difficulty IS NULL;
