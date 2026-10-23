-- Extend email_send_history to also track WhatsApp share attempts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_send_history' AND column_name = 'channel') THEN
    ALTER TABLE email_send_history ADD COLUMN channel text NOT NULL DEFAULT 'email';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_send_history' AND column_name = 'recipient_phone') THEN
    ALTER TABLE email_send_history ADD COLUMN recipient_phone text;
  END IF;
END $$;
