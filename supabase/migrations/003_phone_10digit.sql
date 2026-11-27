-- Normalize phones to 10-digit Indian mobiles + unique indexes
UPDATE users
SET phone = CASE
  WHEN phone IS NULL OR btrim(phone) = '' THEN NULL
  WHEN regexp_replace(phone, '\D', '', 'g') ~ '^91[6-9][0-9]{9}$'
    THEN substring(regexp_replace(phone, '\D', '', 'g') from 3)
  WHEN regexp_replace(phone, '\D', '', 'g') ~ '^0[6-9][0-9]{9}$'
    THEN substring(regexp_replace(phone, '\D', '', 'g') from 2)
  WHEN regexp_replace(phone, '\D', '', 'g') ~ '^[6-9][0-9]{9}$'
    THEN regexp_replace(phone, '\D', '', 'g')
  ELSE regexp_replace(phone, '\D', '', 'g')
END;

UPDATE clients
SET phone = CASE
  WHEN phone IS NULL OR btrim(phone) = '' THEN NULL
  WHEN regexp_replace(phone, '\D', '', 'g') ~ '^91[6-9][0-9]{9}$'
    THEN substring(regexp_replace(phone, '\D', '', 'g') from 3)
  WHEN regexp_replace(phone, '\D', '', 'g') ~ '^0[6-9][0-9]{9}$'
    THEN substring(regexp_replace(phone, '\D', '', 'g') from 2)
  WHEN regexp_replace(phone, '\D', '', 'g') ~ '^[6-9][0-9]{9}$'
    THEN regexp_replace(phone, '\D', '', 'g')
  ELSE regexp_replace(phone, '\D', '', 'g')
END;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
  ON users (phone)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE UNIQUE INDEX IF NOT EXISTS clients_phone_unique
  ON clients (phone)
  WHERE phone IS NOT NULL AND phone <> '';
