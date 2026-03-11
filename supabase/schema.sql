-- ================================================================
-- AGADA — Supabase PostgreSQL Schema
-- ================================================================
-- Run this entire file in Supabase Dashboard → SQL Editor
-- after creating your project.
--
-- This creates 3 tables preloaded from Indian government data:
--   1. cdsco_drugs           — CDSCO approved drug registry
--   2. jan_aushadhi_generics — Jan Aushadhi/BPPI scheme products
--   3. nppa_prices           — NPPA DPCO 2013 price ceilings
--
-- After creating tables:
--   1. Import data using the Data Load instructions in docs/
--   2. Create GIN indexes (at the bottom of this file)
--   3. Apply Row Level Security policies
-- ================================================================

-- ─────────────────────────────────────────────────────────────────
-- TABLE 1: cdsco_drugs
-- Source: cdsco.gov.in/opencms/opencms/en/Drugs/ (Approved Drugs)
-- Update frequency: Quarterly
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cdsco_drugs (
    id                  BIGSERIAL PRIMARY KEY,

    -- Core identification
    brand_name          TEXT NOT NULL,           -- Trade name as registered
    salt_composition    TEXT,                    -- Active pharmaceutical ingredient(s) + dosage
    dosage_form         TEXT,                    -- Tablet, Capsule, Syrup, Injection, etc.
    strength            TEXT,                    -- e.g., "500mg", "10mg/5ml"

    -- Manufacturer
    manufacturer        TEXT,                    -- Licensed manufacturer name
    manufacturer_state  TEXT,                    -- State of manufacture
    manufacturing_address TEXT,                  -- Facility address

    -- Regulatory
    license_number      TEXT,                    -- CDSCO licence number (unique per drug+manufacturer)
    license_type        TEXT,                    -- New Drug, Fixed Dose Combination, etc.
    schedule            TEXT,                    -- H, H1, X (prescription), or OTC
    category            TEXT,                    -- Therapeutic category
    is_active           BOOLEAN DEFAULT TRUE,    -- FALSE if licence expired/suspended/cancelled
    license_expiry_date DATE,                    -- Date licence expires (if applicable)
    approved_date       DATE,                    -- Original approval date

    -- Metadata
    cdsco_source_file   TEXT,                    -- Which Excel file this came from (for traceability)
    last_updated        TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.cdsco_drugs IS
    'CDSCO Central Drug Registry — India national approved drug database. '
    'Source: cdsco.gov.in. Updated quarterly. '
    'Used for real-time medicine authenticity verification at point of purchase.';

COMMENT ON COLUMN public.cdsco_drugs.is_active IS
    'TRUE = licence is current and active. '
    'FALSE = licence has expired, been suspended, or cancelled. '
    'A medicine with is_active = FALSE should trigger a warning to the user.';

COMMENT ON COLUMN public.cdsco_drugs.schedule IS
    'H = Requires prescription (most common). '
    'H1 = Controlled prescription (psychotropics, high-risk). '
    'X = Special restricted prescription. '
    'NULL or blank = OTC (over the counter, no prescription needed).';


-- ─────────────────────────────────────────────────────────────────
-- TABLE 2: jan_aushadhi_generics
-- Source: janaushadhi.gov.in/product_list.html (BPPI Product List)
-- Update frequency: Monthly (new products added regularly)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jan_aushadhi_generics (
    id                  BIGSERIAL PRIMARY KEY,

    -- Product identification
    product_code        TEXT UNIQUE,             -- BPPI product code
    product_name        TEXT NOT NULL,           -- Jan Aushadhi product name (generic)
    salt_composition    TEXT NOT NULL,           -- Active ingredient(s) — used for matching
    strength            TEXT,                    -- Dosage strength
    dosage_form         TEXT,                    -- Tablet, Capsule, Syrup, etc.
    pack_size           TEXT,                    -- e.g., "30 Tablets", "100ml"

    -- Pricing (key differentiator)
    mrp                 NUMERIC(10, 2),          -- Maximum Retail Price (Jan Aushadhi)
    unit                TEXT,                    -- Per tablet, per ml, per strip
    mrp_per_unit        NUMERIC(10, 4),          -- Calculated: MRP / pack quantity

    -- Classification
    therapeutic_class   TEXT,                    -- ATC therapeutic classification
    category            TEXT,                    -- Tablet/Capsule/Liquid/Surgical

    -- Sourcing
    manufacturer        TEXT,                    -- CPSU / contracted generic manufacturer
    is_available        BOOLEAN DEFAULT TRUE,    -- Currently in stock across Kendras

    -- Metadata
    bppi_source_file    TEXT,
    last_updated        TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.jan_aushadhi_generics IS
    'Pradhan Mantri Jan Aushadhi Pariyojana product list. '
    'Source: janaushadhi.gov.in — BPPI (Bureau of Pharma PSUs of India). '
    '14,000+ Jan Aushadhi Kendras across India stock these medicines. '
    'Prices are 50-90% below branded equivalents. '
    'Used to show patients cheaper alternatives to branded prescriptions.';


-- ─────────────────────────────────────────────────────────────────
-- TABLE 3: nppa_prices
-- Source: nppaindia.nic.in/price-list (DPCO 2013 Ceiling Prices)
-- Update frequency: As NPPA revises (typically annual or ad-hoc)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nppa_prices (
    id                  BIGSERIAL PRIMARY KEY,

    -- Drug identification
    brand_name          TEXT,                    -- Brand name as listed in DPCO
    salt_composition    TEXT NOT NULL,           -- Generic name / INN
    strength            TEXT,                    -- Dosage strength
    dosage_form         TEXT,                    -- Tablet, Capsule, etc.
    pack_size           TEXT,                    -- Pack size for reference

    -- Pricing (legally mandated ceiling)
    ceiling_price       NUMERIC(10, 4) NOT NULL, -- NPPA ceiling price per unit
    unit                TEXT NOT NULL,           -- Per tablet, per ml, per vial, etc.
    ceiling_mrp         NUMERIC(10, 2),          -- Ceiling MRP for standard pack

    -- Regulatory
    schedule_entry      TEXT,                    -- DPCO Schedule I/II entry number
    revised_date        DATE,                    -- Date this price ceiling was last revised
    gazette_reference   TEXT,                    -- Government Gazette notification reference

    -- Metadata
    nppa_source_file    TEXT,
    last_updated        TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.nppa_prices IS
    'National Pharmaceutical Pricing Authority — DPCO 2013 price ceiling data. '
    'Source: nppaindia.nic.in. These are LEGALLY MANDATED maximum prices. '
    'Manufacturers and retailers cannot charge above these ceilings. '
    'Used to show users when they may have been overcharged illegally.';


-- ================================================================
-- GIN INDEXES FOR FUZZY SEARCH PERFORMANCE
-- ================================================================
-- These indexes are CRITICAL for performance. Without them,
-- ILIKE queries on 100,000+ drug names will be very slow.
-- Run AFTER importing data.
-- ================================================================

-- CDSCO: Index on brand name (primary search field)
CREATE INDEX IF NOT EXISTS idx_cdsco_brand_gin
    ON public.cdsco_drugs
    USING gin(to_tsvector('english', brand_name));

-- CDSCO: Index on salt composition (fallback search)
CREATE INDEX IF NOT EXISTS idx_cdsco_salt_gin
    ON public.cdsco_drugs
    USING gin(to_tsvector('english', coalesce(salt_composition, '')));

-- CDSCO: Index for fast is_active + brand_name lookups
CREATE INDEX IF NOT EXISTS idx_cdsco_active_brand
    ON public.cdsco_drugs (is_active, brand_name);

-- Jan Aushadhi: Index on salt composition (primary search for alternatives)
CREATE INDEX IF NOT EXISTS idx_jan_salt_gin
    ON public.jan_aushadhi_generics
    USING gin(to_tsvector('english', salt_composition));

-- Jan Aushadhi: Index for MRP-ordered results
CREATE INDEX IF NOT EXISTS idx_jan_mrp
    ON public.jan_aushadhi_generics (mrp ASC);

-- NPPA: Index on salt composition
CREATE INDEX IF NOT EXISTS idx_nppa_salt_gin
    ON public.nppa_prices
    USING gin(to_tsvector('english', salt_composition));

-- Enable pg_trgm extension for trigram similarity (improves ILIKE performance)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_cdsco_brand_trgm
    ON public.cdsco_drugs
    USING gin(brand_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_jan_salt_trgm
    ON public.jan_aushadhi_generics
    USING gin(salt_composition gin_trgm_ops);


-- ================================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================================
-- Enables public read access. Blocks all writes via anon key.
-- The Supabase anon key is safe to expose in the browser.
-- ================================================================

ALTER TABLE public.cdsco_drugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jan_aushadhi_generics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nppa_prices ENABLE ROW LEVEL SECURITY;

-- Public SELECT allowed (read-only for all anonymous users)
CREATE POLICY "public_read_cdsco"
    ON public.cdsco_drugs
    FOR SELECT TO anon USING (true);

CREATE POLICY "public_read_jan_aushadhi"
    ON public.jan_aushadhi_generics
    FOR SELECT TO anon USING (true);

CREATE POLICY "public_read_nppa"
    ON public.nppa_prices
    FOR SELECT TO anon USING (true);

-- NOTE: No INSERT/UPDATE/DELETE policy exists for anon role.
-- The anon key CANNOT modify data under any circumstances.
-- Only the service_role key (never used in frontend) can write data.


-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================
-- Run these after data import to confirm everything is working.
-- ================================================================

-- Count rows in each table
SELECT 'cdsco_drugs' as table_name, COUNT(*) as row_count FROM public.cdsco_drugs
UNION ALL
SELECT 'jan_aushadhi_generics', COUNT(*) FROM public.jan_aushadhi_generics
UNION ALL
SELECT 'nppa_prices', COUNT(*) FROM public.nppa_prices;

-- Test Crocin lookup (should return results)
SELECT brand_name, manufacturer, schedule, is_active
FROM public.cdsco_drugs
WHERE brand_name ILIKE '%crocin%'
LIMIT 3;

-- Test Jan Aushadhi Paracetamol lookup (should return results under ₹5)
SELECT product_name, salt_composition, mrp
FROM public.jan_aushadhi_generics
WHERE salt_composition ILIKE '%paracetamol%'
ORDER BY mrp ASC
LIMIT 3;
