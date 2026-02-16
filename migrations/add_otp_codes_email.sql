-- Add email column to otp_codes for two-step login (OTP sent to email)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'otp_codes'
      AND column_name = 'email'
  ) THEN
    ALTER TABLE otp_codes ADD COLUMN email text NOT NULL DEFAULT '';
  END IF;
END $$;
