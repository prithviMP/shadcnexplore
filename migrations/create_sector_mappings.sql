-- Create sector_mappings table if it doesn't exist
CREATE TABLE IF NOT EXISTS sector_mappings (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    screener_sector text NOT NULL,
    custom_sector_id varchar NOT NULL REFERENCES sectors(id),
    created_at timestamp NOT NULL DEFAULT NOW(),
    updated_at timestamp NOT NULL DEFAULT NOW(),
    UNIQUE(screener_sector, custom_sector_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sector_mappings_screener_sector ON sector_mappings(screener_sector);
CREATE INDEX IF NOT EXISTS idx_sector_mappings_custom_sector_id ON sector_mappings(custom_sector_id);

