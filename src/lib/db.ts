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

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: Database.Database) {
  // Create tables if they don't exist
  db.exec(`
    -- Markets table
    CREATE TABLE IF NOT EXISTS markets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER DEFAULT 1
    );

    -- Drivers table
    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      market TEXT NOT NULL,
      priority INTEGER DEFAULT 5 CHECK(priority >= 1 AND priority <= 5),
      blocked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (market) REFERENCES markets(name)
    );

    -- Shift templates table
    CREATE TABLE IF NOT EXISTS shift_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      capacity INTEGER DEFAULT 1 CHECK(capacity >= 1 AND capacity <= 20),
      FOREIGN KEY (market) REFERENCES markets(name),
      UNIQUE(market, start_time, end_time)
    );

    -- Scheduled shifts table
    CREATE TABLE IF NOT EXISTS scheduled_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_id) REFERENCES drivers(id),
      FOREIGN KEY (template_id) REFERENCES shift_templates(id),
      UNIQUE(driver_id, template_id, date)
    );

    -- Admin settings table (single row)
    CREATE TABLE IF NOT EXISTS admin_settings (
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

    -- Capacity overrides by day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
    CREATE TABLE IF NOT EXISTS capacity_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
      capacity INTEGER NOT NULL CHECK(capacity >= 0 AND capacity <= 20),
      FOREIGN KEY (template_id) REFERENCES shift_templates(id) ON DELETE CASCADE,
      UNIQUE(template_id, day_of_week)
    );
  `);

  // Seed default data if tables are empty
  const marketCount = db.prepare('SELECT COUNT(*) as count FROM markets').get() as { count: number };
  if (marketCount.count === 0) {
    seedDefaultData(db);
  }
}

function seedDefaultData(db: Database.Database) {
  // Insert default markets
  const insertMarket = db.prepare('INSERT INTO markets (name) VALUES (?)');
  const markets = ['Chapel Hill', 'Asheville'];
  markets.forEach(m => insertMarket.run(m));

  // Insert default admin settings
  db.prepare(`
    INSERT OR IGNORE INTO admin_settings (id, base_schedule_days, cancel_hours_before, show_available_spots)
    VALUES (1, 7, 24, 0)
  `).run();

  // Insert sample drivers
  const insertDriver = db.prepare(`
    INSERT INTO drivers (name, email, phone, market, priority, blocked)
    VALUES (?, ?, ?, ?, ?, 0)
  `);

  const sampleDrivers = [
    { name: 'John Driver', email: 'john@example.com', phone: '919-555-0101', market: 'Chapel Hill', priority: 3 },
    { name: 'Jane Smith', email: 'jane@example.com', phone: '919-555-0102', market: 'Chapel Hill', priority: 1 },
    { name: 'Alice Williams', email: 'alice@example.com', phone: '828-555-0104', market: 'Asheville', priority: 2 },
    { name: 'Mike Turner', email: 'mike@example.com', phone: '828-555-0105', market: 'Asheville', priority: 3 },
  ];

  sampleDrivers.forEach(d => insertDriver.run(d.name, d.email, d.phone, d.market, d.priority));

  // Insert sample shift templates
  const insertTemplate = db.prepare(`
    INSERT INTO shift_templates (market, start_time, end_time, capacity)
    VALUES (?, ?, ?, ?)
  `);

  const templates = [
    // Chapel Hill
    { market: 'Chapel Hill', start: '08:00', end: '10:00', capacity: 2 },
    { market: 'Chapel Hill', start: '10:00', end: '14:00', capacity: 3 },
    { market: 'Chapel Hill', start: '11:00', end: '16:00', capacity: 2 },
    { market: 'Chapel Hill', start: '14:00', end: '21:00', capacity: 4 },
    { market: 'Chapel Hill', start: '16:00', end: '21:00', capacity: 3 },
    // Asheville
    { market: 'Asheville', start: '10:00', end: '14:00', capacity: 2 },
    { market: 'Asheville', start: '11:00', end: '16:00', capacity: 2 },
    { market: 'Asheville', start: '14:00', end: '21:00', capacity: 3 },
    { market: 'Asheville', start: '16:00', end: '21:00', capacity: 2 },
  ];

  templates.forEach(t => insertTemplate.run(t.market, t.start, t.end, t.capacity));

  // Insert sample scheduled shifts for demo
  const insertScheduledShift = db.prepare(`
    INSERT INTO scheduled_shifts (driver_id, template_id, date)
    VALUES (?, ?, ?)
  `);

  // Generate dates for today and the next 6 days
  const today = new Date();
  const getDateString = (daysFromNow: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().split('T')[0];
  };

  // Sample scheduled shifts - drivers scheduled for various days
  // Template IDs: CH: 1-5, AVL: 6-9
  const sampleShifts = [
    // Today - Chapel Hill
    { driverId: 1, templateId: 2, date: getDateString(0) },  // John - 10:00-14:00
    { driverId: 2, templateId: 4, date: getDateString(0) },  // Jane - 14:00-21:00
    // Today - Asheville
    { driverId: 3, templateId: 6, date: getDateString(0) },  // Alice - 10:00-14:00
    // Tomorrow
    { driverId: 1, templateId: 3, date: getDateString(1) },  // John - 11:00-16:00
    { driverId: 2, templateId: 2, date: getDateString(1) },  // Jane - 10:00-14:00
    { driverId: 3, templateId: 8, date: getDateString(1) },  // Alice - 14:00-21:00
    { driverId: 4, templateId: 7, date: getDateString(1) },  // Mike - 11:00-16:00
    // Day after tomorrow
    { driverId: 1, templateId: 5, date: getDateString(2) },  // John - 16:00-21:00
    { driverId: 2, templateId: 1, date: getDateString(2) },  // Jane - 08:00-10:00
    { driverId: 2, templateId: 4, date: getDateString(2) },  // Jane - 14:00-21:00
    { driverId: 4, templateId: 9, date: getDateString(2) },  // Mike - 16:00-21:00
    // 3 days out
    { driverId: 3, templateId: 6, date: getDateString(3) },  // Alice - 10:00-14:00
    { driverId: 1, templateId: 2, date: getDateString(3) },  // John - 10:00-14:00
    // 4 days out
    { driverId: 3, templateId: 8, date: getDateString(4) },  // Alice - 14:00-21:00
    { driverId: 2, templateId: 3, date: getDateString(4) },  // Jane - 11:00-16:00
    // 5 days out
    { driverId: 1, templateId: 4, date: getDateString(5) },  // John - 14:00-21:00
    { driverId: 4, templateId: 8, date: getDateString(5) },  // Mike - 14:00-21:00
  ];

  sampleShifts.forEach(s => {
    try {
      insertScheduledShift.run(s.driverId, s.templateId, s.date);
    } catch (e) {
      // Ignore duplicate key errors
    }
  });

  console.log('Database seeded with default data and sample shifts');
}

// Helper functions for common queries
export function getMarkets() {
  return getDb().prepare('SELECT * FROM markets WHERE active = 1 ORDER BY name').all();
}

export function getDrivers() {
  return getDb().prepare('SELECT * FROM drivers ORDER BY name').all();
}

export function getDriverById(id: number) {
  return getDb().prepare('SELECT * FROM drivers WHERE id = ?').get(id);
}

export function getDriverByEmail(email: string) {
  return getDb().prepare('SELECT * FROM drivers WHERE email = ?').get(email);
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
      d.name as driverName,
      ss.template_id as templateId,
      st.market,
      ss.date,
      st.start_time as startTime,
      st.end_time as endTime,
      ss.created_at as createdAt
    FROM scheduled_shifts ss
    JOIN drivers d ON ss.driver_id = d.id
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

export function getAdminSettings() {
  return getDb().prepare('SELECT * FROM admin_settings WHERE id = 1').get();
}

export function updateAdminSettings(settings: {
  baseScheduleDays?: number;
  cancelHoursBefore?: number;
  showAvailableSpots?: boolean;
  slackWebhookUrl?: string;
}) {
  const current = getAdminSettings() as Record<string, unknown>;
  const db = getDb();

  db.prepare(`
    UPDATE admin_settings SET
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

