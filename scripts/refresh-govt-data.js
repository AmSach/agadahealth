/**
 * scripts/refresh-govt-data.js
 * 
 * Phase 2 feature — Automated monthly government data refresh.
 * 
 * This script automates the download and re-import of government data.
 * Run via cron job (monthly recommended for Jan Aushadhi, quarterly for CDSCO).
 * 
 * Current status: STUB — full implementation in Phase 2.
 * The download URLs and Excel structure must be manually verified
 * before automating, as government portals change format without notice.
 * 
 * Usage (once implemented):
 *   node scripts/refresh-govt-data.js --source cdsco
 *   node scripts/refresh-govt-data.js --source jan_aushadhi
 *   node scripts/refresh-govt-data.js --source nppa
 *   node scripts/refresh-govt-data.js --source all
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Data source configurations
const SOURCES = {
  cdsco: {
    name: 'CDSCO Drug Registry',
    url: 'https://cdsco.gov.in/opencms/opencms/en/Drugs/',
    table: 'cdsco_drugs',
    frequency: 'quarterly',
    notes: 'Download "Approved Drug List" Excel. Manual download required — no direct Excel URL.',
  },
  jan_aushadhi: {
    name: 'Jan Aushadhi Product List',
    url: 'https://janaushadhi.gov.in/product_list.html',
    table: 'jan_aushadhi_generics',
    frequency: 'monthly',
    notes: 'BPPI updates this as new products are added. Download the Excel from product list page.',
  },
  nppa: {
    name: 'NPPA DPCO 2013 Price Ceilings',
    url: 'https://nppaindia.nic.in/price-list',
    table: 'nppa_prices',
    frequency: 'as_revised',
    notes: 'Update only when NPPA issues a new Gazette notification.',
  },
}

async function checkDataFreshness() {
  console.log('📊 Checking data freshness...\n')

  for (const [key, source] of Object.entries(SOURCES)) {
    const { data } = await supabase
      .from(source.table)
      .select('last_updated')
      .order('last_updated', { ascending: false })
      .limit(1)
      .single()

    const lastUpdated = data?.last_updated
    const daysSince = lastUpdated 
      ? Math.floor((Date.now() - new Date(lastUpdated)) / (1000 * 60 * 60 * 24))
      : 'Unknown'

    console.log(`${source.name}`)
    console.log(`  Table: ${source.table}`)
    console.log(`  Last updated: ${lastUpdated || 'Never'} (${daysSince} days ago)`)
    console.log(`  Recommended frequency: ${source.frequency}`)
    console.log(`  Source: ${source.url}`)
    console.log()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1]
    || args[args.indexOf('--source') + 1]

  if (!sourceArg || sourceArg === 'status') {
    await checkDataFreshness()
    console.log('To refresh data, see docs/DATA_PIPELINE.md for manual import instructions.')
    console.log('Automated refresh coming in Phase 2.')
    return
  }

  console.log('⚠️  Automated refresh not yet implemented.')
  console.log('Please follow the manual data pipeline in docs/DATA_PIPELINE.md')
  console.log('This feature will be automated in Phase 2 of development.')
}

main().catch(console.error)
