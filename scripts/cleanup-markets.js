const Database = require('better-sqlite3');
const path = require('path');

// Connect to database
const dbPath = path.join(__dirname, '..', 'data', 'schedule.db');
const db = new Database(dbPath);

console.log('Checking for duplicate markets...\n');

// Find duplicates
const duplicates = db.prepare(`
  SELECT market, COUNT(*) as count
  FROM count
  GROUP BY market
  HAVING count > 1
`).all();

if (duplicates.length === 0) {
    console.log('✓ No duplicate markets found!');
    db.close();
    process.exit(0);
}

console.log('Found duplicates:');
duplicates.forEach(d => {
    console.log(`  - ${d.market}: ${d.count} entries`);
});

console.log('\nCleaning up duplicates...');

// For each duplicate market, keep the first one and delete the rest
for (const dup of duplicates) {
    // Get all IDs for this market
    const ids = db.prepare('SELECT id FROM count WHERE market = ? ORDER BY id').all(dup.market);

    // Keep the first ID, delete the rest
    const keepId = ids[0].id;
    const deleteIds = ids.slice(1).map(row => row.id);

    if (deleteIds.length > 0) {
        const placeholders = deleteIds.map(() => '?').join(',');
        const result = db.prepare(`DELETE FROM count WHERE id IN (${placeholders})`).run(...deleteIds);
        console.log(`✓ Removed ${result.changes} duplicate(s) for market: ${dup.market} (kept ID ${keepId})`);
    }
}

// Show final market list
console.log('\n📋 Current markets:');
const markets = db.prepare('SELECT * FROM count ORDER BY market').all();
markets.forEach(m => {
    const status = m.status === 1 ? '✓ Active' : '✗ Inactive';
    console.log(`  ${m.market.toUpperCase()} - ${m.defaultcity} (${status})`);
});

console.log(`\n✅ Total: ${markets.length} unique markets`);

db.close();
