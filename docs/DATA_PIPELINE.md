# Agada — Data Pipeline: Importing Government Data

All three Agada databases are sourced from Indian government Excel/CSV files.
This document explains how to download, clean, and import them into Supabase.

---

## Philosophy: Pre-load, Don't Live-Query

Agada does NOT make live API calls to CDSCO, Jan Aushadhi, or NPPA at runtime.

**Why?** Government APIs in India are:
- Unreliable (frequent downtime)
- Not documented for consumer-scale use
- Not designed for 1,000 concurrent queries

**Solution:** Download → Clean → Load into Supabase. Query Supabase in real time.
Refresh monthly for Jan Aushadhi, quarterly for CDSCO.

---

## Source 1: CDSCO Drug Registry

### Download
1. Go to: `https://cdsco.gov.in/opencms/opencms/en/Drugs/`
2. Click **"Approved Drug List"** → Download the Excel file
3. File name: usually `Approved_Drug_List_DDMMYYYY.xlsx`

### Excel Structure (raw)
The file has these columns (may vary by download date):
```
Brand Name | Salt Composition | Dosage Form | Strength | Manufacturer | 
State | Licence Number | Category | Schedule | Status | Approval Date
```

### Cleaning Steps
1. Open in Excel or Google Sheets
2. Delete any header rows above the data (rows 1-3 are often metadata)
3. Delete any footer/summary rows at the bottom
4. Rename columns to match Supabase schema:

| Excel Column | Supabase Column |
|-------------|-----------------|
| Brand Name | `brand_name` |
| Salt Composition / Generic Name | `salt_composition` |
| Dosage Form | `dosage_form` |
| Strength | `strength` |
| Manufacturer | `manufacturer` |
| State | `manufacturer_state` |
| Licence Number | `license_number` |
| Category / Therapeutic Category | `category` |
| Schedule | `schedule` |
| Status (Active/Expired) | Use to set `is_active` (TRUE/FALSE) |
| Approval Date | `approved_date` |

5. Add `is_active` column:
   - `=IF(OR(G2="Active", G2=""), TRUE, FALSE)` (adjust column reference)
6. Export as CSV: **File → Download → CSV**
7. Verify row count matches source (~100,000+ records expected)

### Import to Supabase
1. Supabase Dashboard → **Table Editor** → `cdsco_drugs`
2. Click **"Insert" → "Import data from CSV"**
3. Upload your CSV
4. Map columns (Supabase will auto-detect most)
5. Click **Import**
6. Verify: `SELECT COUNT(*) FROM cdsco_drugs;`

---

## Source 2: Jan Aushadhi Product List

### Download
1. Go to: `https://janaushadhi.gov.in/product_list.html`
2. Download the Excel file (usually a direct link on the page)
3. Alternatively: `https://janaushadhi.gov.in/Data/product_list.xlsx`

### Excel Structure
```
Product Code | Product Name | Salt Composition | MRP | Pack Size | 
Dosage Form | Therapeutic Class | Manufacturer
```

### Cleaning Steps
1. Remove header rows
2. Rename columns to match Supabase schema:

| Excel Column | Supabase Column |
|-------------|-----------------|
| Product Code | `product_code` |
| Product Name | `product_name` |
| Salt / Generic Name | `salt_composition` |
| MRP (₹) | `mrp` (numeric) |
| Pack Size | `pack_size` |
| Dosage Form | `dosage_form` |
| Therapeutic Class | `therapeutic_class` |
| Manufacturer | `manufacturer` |

3. Ensure `mrp` column is numeric (remove ₹ symbol if present)
4. Add `is_available` column: set all to TRUE
5. Export as CSV

### Import to Supabase
Same process as CDSCO above, targeting `jan_aushadhi_generics` table.
Verify: `SELECT COUNT(*) FROM jan_aushadhi_generics;` (expect ~1,900+ rows)

---

## Source 3: NPPA Price Ceilings

### Download
1. Go to: `https://nppaindia.nic.in/price-list`
2. Download **"Scheduled Formulations"** Excel (DPCO 2013)
3. May be split into multiple files by category — download all and merge

### Excel Structure
```
S.No | Generic Name | Brand Name | Strength | Dosage Form | Pack Size |
Ceiling Price | Unit | Revised Date | Gazette Reference
```

### Cleaning Steps
1. If multiple Excel files, merge them into one sheet first
2. Rename columns:

| Excel Column | Supabase Column |
|-------------|-----------------|
| Generic Name / Salt | `salt_composition` |
| Brand Name (if listed) | `brand_name` |
| Strength | `strength` |
| Dosage Form | `dosage_form` |
| Pack Size | `pack_size` |
| Ceiling Price (₹/unit) | `ceiling_price` (numeric) |
| Unit (per tab/ml/etc) | `unit` |
| Revised Date | `revised_date` |
| Gazette Reference | `gazette_reference` |

3. Ensure `ceiling_price` is numeric
4. Export as CSV

### Import to Supabase
Target: `nppa_prices` table
Verify: `SELECT COUNT(*) FROM nppa_prices;` (expect ~800+ rows)

---

## After Import: Run GIN Indexes

These were included in `schema.sql` but run them again to ensure they're built:

```sql
-- In Supabase SQL Editor
CREATE INDEX IF NOT EXISTS idx_cdsco_brand_trgm
    ON public.cdsco_drugs USING gin(brand_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_jan_salt_trgm
    ON public.jan_aushadhi_generics USING gin(salt_composition gin_trgm_ops);
```

---

## End-to-End Test

After import, test with this query in Supabase SQL Editor:

```sql
-- Should return Crocin / GlaxoSmithKline
SELECT brand_name, manufacturer, license_number, is_active
FROM cdsco_drugs
WHERE brand_name ILIKE '%crocin%'
LIMIT 3;

-- Should return Paracetamol under ₹5
SELECT product_name, salt_composition, mrp
FROM jan_aushadhi_generics
WHERE salt_composition ILIKE '%paracetamol%'
ORDER BY mrp ASC
LIMIT 3;

-- Should return NPPA ceiling for paracetamol
SELECT salt_composition, ceiling_price, unit
FROM nppa_prices
WHERE salt_composition ILIKE '%paracetamol%'
LIMIT 3;
```

If all three queries return results, your data pipeline is complete.
Deploy Agada and scan a Crocin strip to do the live end-to-end test.

---

## Monthly Refresh Schedule

| Database | Source update frequency | Recommended refresh |
|----------|------------------------|---------------------|
| CDSCO | Quarterly | Every 3 months |
| Jan Aushadhi | As new products added | Monthly |
| NPPA | As DPCO revised | When gazette notification issued |

**Automation (Phase 2):** `scripts/refresh-govt-data.js` will automate this via a monthly cron job.
