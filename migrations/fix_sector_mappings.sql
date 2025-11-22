-- Fix sector_mappings table: rename custom_sector to custom_sector_id if it exists
-- or create custom_sector_id if it doesn't exist

-- Check if custom_sector column exists and rename it
DO $$
BEGIN
    -- Check if custom_sector column exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sector_mappings' 
        AND column_name = 'custom_sector'
    ) THEN
        -- Rename custom_sector to custom_sector_id
        ALTER TABLE sector_mappings RENAME COLUMN custom_sector TO custom_sector_id;
        
        -- Change type to varchar if needed
        ALTER TABLE sector_mappings ALTER COLUMN custom_sector_id TYPE varchar;
        
        -- Add NOT NULL constraint if not already present
        ALTER TABLE sector_mappings ALTER COLUMN custom_sector_id SET NOT NULL;
    ELSE
        -- Create custom_sector_id column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'sector_mappings' 
            AND column_name = 'custom_sector_id'
        ) THEN
            ALTER TABLE sector_mappings ADD COLUMN custom_sector_id varchar NOT NULL REFERENCES sectors(id);
        END IF;
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sector_mappings' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE sector_mappings ADD COLUMN updated_at timestamp NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'sector_mappings_screener_sector_custom_sector_id_key'
    ) THEN
        ALTER TABLE sector_mappings 
        ADD CONSTRAINT sector_mappings_screener_sector_custom_sector_id_key 
        UNIQUE (screener_sector, custom_sector_id);
    END IF;
END $$;

