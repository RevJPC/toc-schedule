const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Path to database
const dbPath = path.join(process.cwd(), 'data', 'schedule.db');

if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath}`);
    process.exit(1);
}

// Get query from args
const query = process.argv[2];

if (!query) {
    console.error('Please provide a SQL query as an argument.');
    console.error('Usage: node scripts/query.js "SELECT * FROM tableName"');
    process.exit(1);
}

try {
    const db = new Database(dbPath, { readonly: false }); // Allow write in case they want to INSERT/UPDATE

    // Normalize query
    let sql = query.trim();
    const lowerSql = sql.toLowerCase();

    // Handle common aliases (MySQL/Postgres style -> SQLite)
    if (lowerSql === 'show tables') {
        sql = "SELECT name, type FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
    } else if (lowerSql.startsWith('describe ')) {
        const tableName = sql.split(' ')[1];
        if (tableName) {
            sql = `PRAGMA table_info(${tableName})`;
        }
    }

    const isSelect = sql.trim().toLowerCase().startsWith('select') || sql.trim().toLowerCase().startsWith('pragma');

    console.log(`Executing: ${sql}\n`);

    if (isSelect) {
        const rows = db.prepare(sql).all();
        if (rows.length === 0) {
            console.log('(No results)');
        } else {
            console.table(rows);
            console.log(`\n(${rows.length} rows)`);
        }
    } else {
        const info = db.prepare(sql).run();
        console.log('Result:', info);
    }
} catch (error) {
    console.error('Error executing query:');
    console.error(error.message);
    process.exit(1);
}
