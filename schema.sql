/* ==========================================
   AD BLOCKER HUB DATABASE
   STAGE 2
========================================== */

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


/* ==========================================
   USERS
========================================== */

CREATE TABLE IF NOT EXISTS users (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,

    email VARCHAR(255) UNIQUE NOT NULL,

    password_hash TEXT NOT NULL,

    role VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'admin')),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


/* ==========================================
   SUBSCRIPTIONS
========================================== */

CREATE TABLE IF NOT EXISTS subscriptions (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    plan_name VARCHAR(50) NOT NULL,

    paystack_customer_code VARCHAR(100),

    paystack_subscription_code VARCHAR(100),

    paystack_email_token TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'active',
                'cancelled',
                'expired'
            )
        ),

    start_date TIMESTAMPTZ,

    end_date TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


/* ==========================================
   PAYMENTS
========================================== */

CREATE TABLE IF NOT EXISTS payments (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    subscription_id UUID
        REFERENCES subscriptions(id)
        ON DELETE SET NULL,

    reference VARCHAR(150) UNIQUE NOT NULL,

    amount INTEGER NOT NULL,

    currency VARCHAR(10) NOT NULL DEFAULT 'ZAR',

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'success',
                'failed',
                'abandoned'
            )
        ),

    paystack_transaction_id BIGINT,

    paid_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


/* ==========================================
   SERVICE REQUESTS
========================================== */

CREATE TABLE IF NOT EXISTS service_requests (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    platform VARCHAR(50) NOT NULL,

    device VARCHAR(100),

    browser VARCHAR(100),

    issue_description TEXT NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'in_progress',
                'completed',
                'closed'
            )
        ),

    admin_notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


/* ==========================================
   SUPPORT MESSAGES
========================================== */

CREATE TABLE IF NOT EXISTS support_messages (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    service_request_id UUID
        REFERENCES service_requests(id)
        ON DELETE CASCADE,

    sender_role VARCHAR(20) NOT NULL
        CHECK (
            sender_role IN (
                'user',
                'admin'
            )
        ),

    message TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


/* ==========================================
   LOGIN SESSIONS
========================================== */

CREATE TABLE IF NOT EXISTS sessions (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    token_hash TEXT UNIQUE NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


/* ==========================================
   INDEXES
========================================== */

CREATE INDEX IF NOT EXISTS
idx_users_email
ON users(email);


CREATE INDEX IF NOT EXISTS
idx_subscriptions_user
ON subscriptions(user_id);


CREATE INDEX IF NOT EXISTS
idx_payments_user
ON payments(user_id);


CREATE INDEX IF NOT EXISTS
idx_payments_reference
ON payments(reference);


CREATE INDEX IF NOT EXISTS
idx_requests_user
ON service_requests(user_id);


CREATE INDEX IF NOT EXISTS
idx_requests_status
ON service_requests(status);


CREATE INDEX IF NOT EXISTS
idx_support_user
ON support_messages(user_id);


/* ==========================================
   DONE
========================================== */

SELECT 'Ad Blocker Hub database ready' AS message;
