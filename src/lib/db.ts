import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Singleton database instance
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Use /tmp for Vercel serverless, local data dir for development
    const isVercel = process.env.VERCEL === '1';
    let dbPath: string;

    if (isVercel) {
      dbPath = '/tmp/schedule.db';
    } else {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      dbPath = path.join(dataDir, 'schedule.db');
    }

    console.log('[DB] Initializing database at:', dbPath);
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: Database.Database) {
  // Check for old tables to determine if migration is needed
  // We rename them immediately to avoid conflicts with new schema (especially case-insensitive names like drivers/Drivers)
  const oldMarketsExist = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='markets'").get() as { count: number };
  const oldDriversExist = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='drivers'").get() as { count: number };

  const migrationNeeded = oldMarketsExist.count > 0 || oldDriversExist.count > 0;

  // MIGRATION DISABLED - If you need to migrate old data, uncomment this block
  /*
  if (migrationNeeded) {
    console.log("Migration needed. Preparing tables...");
    db.pragma('foreign_keys = OFF');
    if (oldMarketsExist.count > 0) {
      try { db.exec("ALTER TABLE markets RENAME TO markets_temp"); } catch (e) { console.log('markets already renamed?'); }
    }
    if (oldDriversExist.count > 0) {
      try { db.exec("ALTER TABLE drivers RENAME TO drivers_temp"); } catch (e) { console.log('drivers already renamed?'); }
    }
  }
  */

  // Create tables (New Schema)
  db.exec(`
    -- Markets table (renamed to 'count')
    CREATE TABLE IF NOT EXISTS count (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market TEXT NOT NULL UNIQUE, -- 3 letter code (avl, tto, etc)
      defaultcity TEXT NOT NULL, -- Readable name (Asheville, etc)
      status INTEGER DEFAULT 1 -- 1=active, 0=inactive
    );

    -- Drivers table (renamed to 'Drivers')
    CREATE TABLE IF NOT EXISTS Drivers (
      did INTEGER PRIMARY KEY AUTOINCREMENT, -- was id
      Owner_fname TEXT NOT NULL,
      Owner_lname TEXT NOT NULL,
      displayName TEXT, -- Preferred name
      email TEXT NOT NULL UNIQUE,
      phone TEXT, -- No dashes
      market TEXT NOT NULL, -- 3 letter code
      schedule_priority INTEGER DEFAULT 5 CHECK(schedule_priority >= 1 AND schedule_priority <= 5), -- was priority
      status INTEGER DEFAULT 1, -- 1=active, 0=inactive (inverse of blocked)
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (market) REFERENCES count(market)
    );

    -- Shift templates table
    CREATE TABLE IF NOT EXISTS shift_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market TEXT NOT NULL, -- 3 letter code
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      capacity INTEGER DEFAULT 1 CHECK(capacity >= 1 AND capacity <= 20),
      FOREIGN KEY (market) REFERENCES count(market),
      UNIQUE(market, start_time, end_time)
    );

    -- Scheduled shifts table
    CREATE TABLE IF NOT EXISTS scheduled_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_id) REFERENCES Drivers(did),
      FOREIGN KEY (template_id) REFERENCES shift_templates(id),
      UNIQUE(driver_id, template_id, date)
    );

    -- Schedule settings table
    CREATE TABLE IF NOT EXISTS schedule_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base_schedule_days INTEGER DEFAULT 7,
      cancel_hours_before INTEGER DEFAULT 24,
      show_available_spots INTEGER DEFAULT 0,
      slack_webhook_url TEXT
    );

    -- Admins table
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Capacity overrides
    CREATE TABLE IF NOT EXISTS capacity_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
      capacity INTEGER NOT NULL CHECK(capacity >= 0 AND capacity <= 20),
      FOREIGN KEY (template_id) REFERENCES shift_templates(id) ON DELETE CASCADE,
      UNIQUE(template_id, day_of_week)
    );
  `);

  // MIGRATION EXECUTION DISABLED
  /*
  if (migrationNeeded) {
    console.log("Executing Data Migration...");
    db.transaction(() => {
      const marketMap: Record<string, string> = {
        'Asheville': 'avl', 'Chapel Hill': 'tto', 'Raleigh': 'rto',
        'Durham': 'dto', 'Wilmington': 'ilm', 'Greensboro': 'gso', 'Winston-Salem': 'int'
      };
  
      // 1. Markets -> count
      if (oldMarketsExist.count > 0) {
        console.log("Migrating 'markets_temp' -> 'count'...");
        const oldMarkets = db.prepare("SELECT * FROM markets_temp").all() as any[];
  
        const insertCount = db.prepare("INSERT OR IGNORE INTO count (market, defaultcity, status) VALUES (?, ?, ?)");
        for (const m of oldMarkets) {
          const code = marketMap[m.name] || m.name.substring(0, 3).toLowerCase();
          insertCount.run(code, m.name, m.active);
        }
  
        // Update shift_templates DATA (referencing codes now)
        // Note: shift_templates schema is newly created if it didn't exist, but here we assume it existed and we want to preserve data?
        // Wait, shift_templates wasn't renamed. So it matches check "CREATE TABLE IF NOT EXISTS".
        // If shift_templates existed, it uses old schema (market text). New schema uses market text too.
        // But FK matches? 
        // We should update DATA in place, then recreate schema to enforce FK.
  
        const templates = db.prepare("SELECT * FROM shift_templates").all() as any[];
        const updateTemplateMarket = db.prepare("UPDATE shift_templates SET market = ? WHERE id = ?");
        for (const t of templates) {
          const newMarket = marketMap[t.market] || t.market.substring(0, 3).toLowerCase();
          updateTemplateMarket.run(newMarket, t.id);
        }
  
        db.exec("DROP TABLE markets_temp");
  
        console.log("Recreating shift_templates schema...");
        // Check if shift_templates exists and needs migration
        const shiftTemplatesExists = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='shift_templates'").get() as { count: number };
  
        if (shiftTemplatesExists.count > 0) {
          db.exec("ALTER TABLE shift_templates RENAME TO shift_templates_old");
          // New schema was already defined in the big Exec block? No, IF NOT EXISTS skipped it if it existed.
          // So we need to CREATE it now.
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
          // Check if shift_templates_old actually exists before trying to copy from it
          const oldTableExists = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='shift_templates_old'").get() as { count: number };
          if (oldTableExists.count > 0) {
            db.exec("INSERT INTO shift_templates SELECT * FROM shift_templates_old");
            db.exec("DROP TABLE shift_templates_old");
          }
        }
      }
  
      // 2. Drivers -> Drivers
      if (oldDriversExist.count > 0) {
        console.log("Migrating 'drivers_temp' -> 'Drivers'...");
        const oldDrivers = db.prepare("SELECT * FROM drivers_temp").all() as any[];
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
  
        db.exec("DROP TABLE drivers_temp");
  
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
  }
  */

  // Ensure default settings exist
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM schedule_settings').get() as { count: number };
  if (settingsCount.count === 0) {
    db.prepare(`
    INSERT INTO schedule_settings (id, base_schedule_days, cancel_hours_before, show_available_spots)
    VALUES (1, 7, 24, 0)
  `).run();
  }
}

function seedDefaultData(db: Database.Database) {
  // Insert default markets (using new schema)
  const insertMarket = db.prepare('INSERT OR IGNORE INTO count (market, defaultcity, status) VALUES (?, ?, 1)');
  insertMarket.run('tto', 'Chapel Hill');
  insertMarket.run('avl', 'Asheville');

  // No explicit default drivers needed if valid seed data isn't provided, 
  // but could add some if 'Drivers' is empty.
}

// Helper functions for common queries

export function getMarkets(includeInactive = false) {
  const query = includeInactive
    ? 'SELECT * FROM count ORDER BY defaultcity'
    : 'SELECT * FROM count WHERE status = 1 ORDER BY defaultcity';
  return getDb().prepare(query).all().map((m: any) => ({
    id: m.id,
    name: m.defaultcity, // Map back to 'name' for frontend compatibility where possible
    market: m.market,
    active: m.status // Map back to 'active'
  }));
}

export function addMarket(name: string, code: string) {
  // Name = city name, Code = 3 letter code
  return getDb().prepare('INSERT INTO count (market, defaultcity, status) VALUES (?, ?, 1)').run(code, name);
}

export function updateMarketStatus(id: number, active: boolean) {
  return getDb().prepare('UPDATE count SET status = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function getDrivers() {
  const drivers = getDb().prepare('SELECT * FROM Drivers ORDER BY Owner_lname, Owner_fname').all() as any[];
  // Map to interface expected by app temporarily, or update app to use new fields
  return drivers.map(d => ({
    id: d.did,
    name: d.displayName || `${d.Owner_fname} ${d.Owner_lname}`,
    email: d.email,
    phone: d.phone,
    market: d.market,
    priority: d.schedule_priority,
    blocked: d.status === 0 ? 1 : 0 // Backwards compat for now if needed, but better to update app
  }));
}

export function getDriverById(id: number) {
  const d = getDb().prepare('SELECT * FROM Drivers WHERE did = ?').get(id) as any;
  if (!d) return undefined;
  return {
    id: d.did,
    name: d.displayName || `${d.Owner_fname} ${d.Owner_lname}`,
    email: d.email,
    phone: d.phone,
    market: d.market,
    priority: d.schedule_priority,
    blocked: d.status === 0 ? 1 : 0
  };
}

export function getDriverByEmail(email: string) {
  const d = getDb().prepare('SELECT * FROM Drivers WHERE email = ?').get(email) as any;
  if (!d) return undefined;
  return {
    id: d.did,
    name: d.displayName || `${d.Owner_fname} ${d.Owner_lname}`,
    email: d.email,
    phone: d.phone,
    market: d.market,
    priority: d.schedule_priority,
    blocked: d.status === 0 ? 1 : 0
  };
}

export function getShiftTemplates(market?: string) {
  if (market) {
    return getDb().prepare('SELECT * FROM shift_templates WHERE market = ? ORDER BY start_time').all(market);
  }
  return getDb().prepare('SELECT * FROM shift_templates ORDER BY market, start_time').all();
}

export function getScheduledShifts(options: { market?: string; date?: string; driverId?: number }) {
  let query = `
  SELECT 
    ss.id,
    ss.driver_id as driverId,
    d.displayName as driverName, -- Use displayName
    ss.template_id as templateId,
    st.market,
    ss.date,
    st.start_time as startTime,
    st.end_time as endTime,
    ss.created_at as createdAt
  FROM scheduled_shifts ss
  JOIN Drivers d ON ss.driver_id = d.did
  JOIN shift_templates st ON ss.template_id = st.id
  WHERE 1=1
`;
  const params: (string | number)[] = [];

  if (options.market) {
    query += ' AND st.market = ?';
    params.push(options.market);
  }
  if (options.date) {
    query += ' AND ss.date = ?';
    params.push(options.date);
  }
  if (options.driverId) {
    query += ' AND ss.driver_id = ?';
    params.push(options.driverId);
  }

  query += ' ORDER BY ss.date, st.start_time';
  return getDb().prepare(query).all(...params);
}

export function getScheduleSettings() {
  return getDb().prepare('SELECT * FROM schedule_settings WHERE id = 1').get();
}

export function updateScheduleSettings(settings: {
  baseScheduleDays?: number;
  cancelHoursBefore?: number;
  showAvailableSpots?: boolean;
  slackWebhookUrl?: string;
}) {
  const current = getScheduleSettings() as Record<string, unknown>;
  const db = getDb();

  db.prepare(`
  UPDATE schedule_settings SET
    base_schedule_days = ?,
    cancel_hours_before = ?,
    show_available_spots = ?,
    slack_webhook_url = ?
  WHERE id = 1
`).run(
    settings.baseScheduleDays ?? current.base_schedule_days,
    settings.cancelHoursBefore ?? current.cancel_hours_before,
    settings.showAvailableSpots !== undefined ? (settings.showAvailableSpots ? 1 : 0) : current.show_available_spots,
    settings.slackWebhookUrl ?? current.slack_webhook_url
  );
}

// Get capacity for a specific template and date, considering day-of-week overrides
export function getCapacityForDate(templateId: number, date: string): number {
  const db = getDb();

  // Get the day of week (0=Sunday, 6=Saturday)
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();

  // Check for day-specific override
  const override = db.prepare(`
  SELECT capacity FROM capacity_overrides 
  WHERE template_id = ? AND day_of_week = ?
`).get(templateId, dayOfWeek) as { capacity: number } | undefined;

  if (override) {
    return override.capacity;
  }

  // Fall back to default template capacity
  const template = db.prepare('SELECT capacity FROM shift_templates WHERE id = ?').get(templateId) as { capacity: number } | undefined;
  return template?.capacity ?? 0;
}

// Get all capacity overrides for a template
export function getCapacityOverrides(templateId: number) {
  const db = getDb();
  return db.prepare(`
  SELECT day_of_week as dayOfWeek, capacity 
  FROM capacity_overrides 
  WHERE template_id = ?
  ORDER BY day_of_week
`).all(templateId);
}

// Set capacity override for a specific day
export function setCapacityOverride(templateId: number, dayOfWeek: number, capacity: number) {
  const db = getDb();

  if (capacity === 0) {
    // Capacity of 0 means use default - remove override
    db.prepare('DELETE FROM capacity_overrides WHERE template_id = ? AND day_of_week = ?').run(templateId, dayOfWeek);
  } else {
    // Upsert the override
    db.prepare(`
    INSERT INTO capacity_overrides (template_id, day_of_week, capacity)
    VALUES (?, ?, ?)
    ON CONFLICT(template_id, day_of_week) DO UPDATE SET capacity = excluded.capacity
  `).run(templateId, dayOfWeek, capacity);
  }
}

// Delete all overrides for a template
export function deleteCapacityOverrides(templateId: number) {
  const db = getDb();
  db.prepare('DELETE FROM capacity_overrides WHERE template_id = ?').run(templateId);
}

