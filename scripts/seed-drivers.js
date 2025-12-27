const Database = require('better-sqlite3');
const path = require('path');

// Connect to database
const dbPath = path.join(__dirname, '..', 'data', 'schedule.db');
const db = new Database(dbPath);

console.log('Adding dummy driver data...');

// Sample driver data
const dummyDrivers = [
    // Asheville (avl) drivers
    { fname: 'John', lname: 'Smith', email: 'john.smith@example.com', phone: '8285551001', market: 'avl', priority: 1 },
    { fname: 'Sarah', lname: 'Johnson', email: 'sarah.johnson@example.com', phone: '8285551002', market: 'avl', priority: 2 },
    { fname: 'Mike', lname: 'Williams', email: 'mike.williams@example.com', phone: '8285551003', market: 'avl', priority: 3 },
    { fname: 'Emily', lname: 'Brown', email: 'emily.brown@example.com', phone: '8285551004', market: 'avl', priority: 4 },
    { fname: 'David', lname: 'Davis', email: 'david.davis@example.com', phone: '8285551005', market: 'avl', priority: 5 },

    // Chapel Hill (tto) drivers
    { fname: 'Jessica', lname: 'Miller', email: 'jessica.miller@example.com', phone: '9195551001', market: 'tto', priority: 1 },
    { fname: 'Chris', lname: 'Wilson', email: 'chris.wilson@example.com', phone: '9195551002', market: 'tto', priority: 2 },
    { fname: 'Amanda', lname: 'Moore', email: 'amanda.moore@example.com', phone: '9195551003', market: 'tto', priority: 3 },
    { fname: 'Ryan', lname: 'Taylor', email: 'ryan.taylor@example.com', phone: '9195551004', market: 'tto', priority: 4 },

    // Durham (dto) drivers
    { fname: 'Lisa', lname: 'Anderson', email: 'lisa.anderson@example.com', phone: '9195552001', market: 'dto', priority: 1 },
    { fname: 'Kevin', lname: 'Thomas', email: 'kevin.thomas@example.com', phone: '9195552002', market: 'dto', priority: 2 },
    { fname: 'Nicole', lname: 'Jackson', email: 'nicole.jackson@example.com', phone: '9195552003', market: 'dto', priority: 3 },

    // Raleigh (rto) drivers
    { fname: 'Brian', lname: 'White', email: 'brian.white@example.com', phone: '9195553001', market: 'rto', priority: 1 },
    { fname: 'Michelle', lname: 'Harris', email: 'michelle.harris@example.com', phone: '9195553002', market: 'rto', priority: 2 },
    { fname: 'Jason', lname: 'Martin', email: 'jason.martin@example.com', phone: '9195553003', market: 'rto', priority: 3 },
    { fname: 'Lauren', lname: 'Garcia', email: 'lauren.garcia@example.com', phone: '9195553004', market: 'rto', priority: 4 },
];

// Insert drivers
const insertDriver = db.prepare(`
  INSERT INTO Drivers (Owner_fname, Owner_lname, displayName, email, phone, market, schedule_priority, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1)
`);

let successCount = 0;
let errorCount = 0;

for (const driver of dummyDrivers) {
    try {
        const displayName = `${driver.fname} ${driver.lname}`;
        insertDriver.run(
            driver.fname,
            driver.lname,
            displayName,
            driver.email,
            driver.phone,
            driver.market,
            driver.priority
        );
        console.log(`✓ Added: ${displayName} (${driver.market}, Priority ${driver.priority})`);
        successCount++;
    } catch (error) {
        console.error(`✗ Failed to add ${driver.fname} ${driver.lname}:`, error.message);
        errorCount++;
    }
}

console.log(`\n✅ Successfully added ${successCount} drivers`);
if (errorCount > 0) {
    console.log(`❌ Failed to add ${errorCount} drivers (possibly duplicates)`);
}

db.close();
console.log('\nDone! Refresh your admin dashboard to see the new drivers.');
