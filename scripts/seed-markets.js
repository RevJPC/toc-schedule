const Database = require('better-sqlite3');
const path = require('path');

// Connect to database
const dbPath = path.join(__dirname, '..', 'data', 'schedule.db');
const db = new Database(dbPath);

console.log('Adding markets...');

// Market data
const markets = [
    { market: 'avl', defaultcity: 'Asheville', status: 1 },
    { market: 'tto', defaultcity: 'Chapel Hill', status: 1 },
    { market: 'dto', defaultcity: 'Durham', status: 1 },
    { market: 'rto', defaultcity: 'Raleigh', status: 1 },
    { market: 'ilm', defaultcity: 'Wilmington', status: 1 },
    { market: 'gso', defaultcity: 'Greensboro', status: 1 },
    { market: 'int', defaultcity: 'Winston-Salem', status: 1 },
];

// Insert markets
const insertMarket = db.prepare(`
  INSERT OR IGNORE INTO count (market, defaultcity, status)
  VALUES (?, ?, ?)
`);

let successCount = 0;

for (const market of markets) {
    const result = insertMarket.run(market.market, market.defaultcity, market.status);
    if (result.changes > 0) {
        console.log(`✓ Added: ${market.defaultcity} (${market.market})`);
        successCount++;
    } else {
        console.log(`- Skipped: ${market.defaultcity} (${market.market}) - already exists`);
    }
}

console.log(`\n✅ Successfully added ${successCount} new markets`);

db.close();
console.log('\nDone! You can now run the seed-drivers.js script.');
