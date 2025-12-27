const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Path to database
const dbPath = path.join(process.cwd(), 'data', 'schedule.db');

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  console.error('Make sure you have run the application at least once to initialize the database.');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

console.log(`Connected to database at ${dbPath}\n`);

// List all tables
const tables = db.prepare(`
  SELECT name FROM sqlite_schema 
  WHERE type ='table' AND name NOT LIKE 'sqlite_%';
`).all();

console.log('Tables found:');
tables.forEach(table => {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get().count;
  console.log(`- ${table.name} (${count} rows)`);
});

console.log('\n--- Full Database Dump ---\n');

tables.forEach(table => {
  const rows = db.prepare(`SELECT * FROM ${table.name}`).all();
  console.log(`\n--- Table: ${table.name} (${rows.length} rows) ---`);
  if (rows.length > 0) {
    console.table(rows);
  } else {
    console.log('(empty)');
  }
});
