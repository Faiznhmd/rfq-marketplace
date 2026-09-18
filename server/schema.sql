CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(8) NOT NULL CHECK (role IN ('BUYER', 'SUPPLIER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rfqs (
  id UUID PRIMARY KEY,
  buyer_id UUID NOT NULL REFERENCES users(id),
  product_name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  delivery_location VARCHAR(200) NOT NULL,
  deadline DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Additive and repeatable: existing RFQs keep their data and default to OPEN.
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS status VARCHAR(6) NOT NULL DEFAULT 'OPEN'
  CONSTRAINT rfqs_status_check CHECK (status IN ('OPEN', 'CLOSED'));

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY,
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id),
  price NUMERIC(14,2) NOT NULL CHECK (price > 0),
  delivery_time VARCHAR(200) NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (rfq_id, supplier_id)
);

-- Preserve all existing quotations as ACTIVE on first upgrade.
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS status VARCHAR(9) NOT NULL DEFAULT 'ACTIVE'
  CONSTRAINT quotations_status_check CHECK (status IN ('ACTIVE', 'WITHDRAWN'));

CREATE TABLE IF NOT EXISTS saved_rfqs (
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (supplier_id, rfq_id)
);
CREATE INDEX IF NOT EXISTS saved_rfqs_rfq_idx ON saved_rfqs(rfq_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS rfqs_buyer_idx ON rfqs(buyer_id);
CREATE INDEX IF NOT EXISTS rfqs_deadline_idx ON rfqs(deadline);
CREATE INDEX IF NOT EXISTS rfqs_product_idx ON rfqs(lower(product_name));
CREATE INDEX IF NOT EXISTS rfqs_location_idx ON rfqs(lower(delivery_location));
CREATE INDEX IF NOT EXISTS quotations_supplier_idx ON quotations(supplier_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
