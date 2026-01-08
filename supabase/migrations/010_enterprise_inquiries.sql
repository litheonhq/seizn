-- Enterprise Inquiry System for Seizn

CREATE TABLE IF NOT EXISTS enterprise_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact info
  company_name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  job_title VARCHAR(100),

  -- Company details
  company_size VARCHAR(50),  -- '1-10', '11-50', '51-200', '201-500', '500+'
  industry VARCHAR(100),
  website VARCHAR(255),

  -- Inquiry details
  use_case TEXT NOT NULL,
  expected_volume VARCHAR(100),  -- API calls per month
  requirements TEXT,  -- Specific requirements (SSO, SLA, etc.)
  timeline VARCHAR(50),  -- 'immediate', '1-3 months', '3-6 months', '6+ months'

  -- Internal tracking
  status VARCHAR(20) NOT NULL DEFAULT 'new',  -- new, contacted, qualified, negotiating, closed_won, closed_lost
  assigned_to VARCHAR(100),
  notes TEXT,
  priority VARCHAR(20) DEFAULT 'normal',  -- low, normal, high, urgent

  -- Source tracking
  source VARCHAR(50),  -- 'website', 'referral', 'event', etc.
  referrer TEXT,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  contacted_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_email ON enterprise_inquiries(email);
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_status ON enterprise_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_created ON enterprise_inquiries(created_at DESC);

-- Comments
COMMENT ON TABLE enterprise_inquiries IS 'Enterprise sales inquiries';
