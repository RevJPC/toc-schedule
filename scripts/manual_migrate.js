const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'schedule.db');
const db = new Database(dbPath);

console.log('Connected to', dbPath);

try {
    // Use simple queries to check table presence
    const oldMarketsExist = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='markets'").get();
    const oldDriversExist = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='drivers'").get();

    if (oldMarketsExist.count > 0 || oldDriversExist.count > 0) {
        console.log("Starting DB Migration...");
        db.pragma('foreign_keys = OFF');

        db.transaction(() => {
            const marketMap = {
                'Asheville': 'avl', 'Chapel Hill': 'tto', 'Raleigh': 'rto',
                'Durham': 'dto', 'Wilmington': 'ilm', 'Greensboro': 'gso', 'Winston-Salem': 'int'
            };

            // 1. Markets -> count
            if (oldMarketsExist.count > 0) {
                console.log("Migrating 'markets' -> 'count'...");
                const oldMarkets = db.prepare("SELECT * FROM markets").all();

                // Create count table if not exists (it might not exist yet if we are running this manually)
                db.exec(`
                CREATE TABLE IF NOT EXISTS count (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  market TEXT NOT NULL UNIQUE, 
                  defaultcity TEXT NOT NULL, 
                  status INTEGER DEFAULT 1 
                );
              `);

                const insertCount = db.prepare("INSERT OR IGNORE INTO count (market, defaultcity, status) VALUES (?, ?, ?)");
                for (const m of oldMarkets) {
                    const code = marketMap[m.name] || m.name.substring(0, 3).toLowerCase();
                    insertCount.run(code, m.name, m.active);
                }

                // Update shift_templates DATA
                const templates = db.prepare("SELECT * FROM shift_templates").all();
                const updateTemplateMarket = db.prepare("UPDATE shift_templates SET market = ? WHERE id = ?");
                for (const t of templates) {
                    const newMarket = marketMap[t.market] || t.market.substring(0, 3).toLowerCase();
                    updateTemplateMarket.run(newMarket, t.id);
                }

                db.exec("DROP TABLE markets");

                console.log("Recreating shift_templates schema...");
                db.exec("ALTER TABLE shift_templates RENAME TO shift_templates_old");
                db.exec(`
                CREATE TABLE shift_templates (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  market TEXT NOT NULL,
                  start_time TEXT NOT NULL,
                  end_time TEXT NOT NULL,
                  capacity INTEGER DEFAULT 1 CHECK(capacity >= 1 AND capacity <= 20),
                  FOREIGN KEY (market) REFERENCES count(market),
                  UNIQUE(market, start_time, end_time)
                );
              `);
                db.exec("INSERT INTO shift_templates SELECT * FROM shift_templates_old");
                db.exec("DROP TABLE shift_templates_old");
            }

            // 2. Drivers -> Drivers
            if (oldDriversExist.count > 0) {
                console.log("Migrating 'drivers' -> 'Drivers'...");
                const oldDrivers = db.prepare("SELECT * FROM drivers").all();

                db.exec(`
                CREATE TABLE IF NOT EXISTS Drivers (
                  did INTEGER PRIMARY KEY AUTOINCREMENT, 
                  Owner_fname TEXT NOT NULL,
                  Owner_lname TEXT NOT NULL,
                  displayName TEXT, 
                  email TEXT NOT NULL UNIQUE,
                  phone TEXT, 
                  market TEXT NOT NULL, 
                  schedule_priority INTEGER DEFAULT 5 CHECK(schedule_priority >= 1 AND schedule_priority <= 5), 
                  status INTEGER DEFAULT 1, 
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (market) REFERENCES count(market)
                );
              `);

                const insertDriver = db.prepare(`
                  INSERT INTO Drivers (did, Owner_fname, Owner_lname, displayName, email, phone, market, schedule_priority, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);

                for (const d of oldDrivers) {
                    const parts = d.name.trim().split(' ');
                    const fname = parts[0];
                    const lname = parts.slice(1).join(' ') || '';
                    const phone = d.phone ? d.phone.replace(/-/g, '') : '';
                    const marketCode = marketMap[d.market] || d.market.substring(0, 3).toLowerCase();
                    const status = d.blocked ? 0 : 1;
                    insertDriver.run(d.id, fname, lname, d.name, d.email, phone, marketCode, d.priority, status);
                }

                db.exec("DROP TABLE drivers");

                console.log("Recreating scheduled_shifts schema...");
                db.exec("ALTER TABLE scheduled_shifts RENAME TO scheduled_shifts_old");
                db.exec(`
                CREATE TABLE scheduled_shifts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  driver_id INTEGER NOT NULL,
                  template_id INTEGER NOT NULL,
                  date TEXT NOT NULL,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (driver_id) REFERENCES Drivers(did),
                  FOREIGN KEY (template_id) REFERENCES shift_templates(id),
                  UNIQUE(driver_id, template_id, date)
                );
              `);
                db.exec("INSERT INTO scheduled_shifts SELECT * FROM scheduled_shifts_old");
                db.exec("DROP TABLE scheduled_shifts_old");
            }
        })();

        db.pragma('foreign_keys = ON');
        console.log("Migration complete.");
    } else {
        console.log("No migration needed (markets/drivers tables not found or already migrated).");
    }

} catch (e) {
    console.error("Migration failed:", e);
}
