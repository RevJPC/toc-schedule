import mysql from 'mysql2/promise';

// Singleton connection pool
let pool: mysql.Pool | null = null;

export function getDb(): mysql.Pool {
  if (!pool) {
    console.log('[DB] Initializing MySQL connection pool...');

    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'toc_schedule',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    console.log('[DB] MySQL connection pool created');
  }

  return pool;
}

// Helper functions for common queries

export async function getMarkets(includeInactive = false) {
  const db = getDb();
  const query = includeInactive
    ? 'SELECT * FROM `count` ORDER BY defaultcity'
    : 'SELECT * FROM `count` WHERE status = 1 ORDER BY defaultcity';

  const [rows] = await db.execute(query);
  return (rows as any[]).map((m: any) => ({
    id: m.id,
    name: m.defaultcity,
    market: m.market,
    active: m.status
  }));
}

export async function addMarket(name: string, code: string) {
  const db = getDb();
  const [result] = await db.execute(
    'INSERT INTO `count` (market, defaultcity, status) VALUES (?, ?, 1)',
    [code, name]
  );
  return result;
}

export async function updateMarketStatus(id: number, active: boolean) {
  const db = getDb();
  const [result] = await db.execute(
    'UPDATE `count` SET status = ? WHERE id = ?',
    [active ? 1 : 0, id]
  );
  return result;
}

export async function getDrivers() {
  const db = getDb();
  const [rows] = await db.execute(
    'SELECT * FROM `Drivers` ORDER BY Owner_lname, Owner_fname'
  );

  return (rows as any[]).map((d: any) => ({
    id: d.did,
    name: d.displayName || `${d.Owner_fname} ${d.Owner_lname}`,
    email: d.email,
    phone: d.phone,
    market: d.market,
    priority: d.schedule_priority,
    blocked: d.status === 0 ? 1 : 0
  }));
}

export async function getDriverById(id: number) {
  const db = getDb();
  const [rows] = await db.execute(
    'SELECT * FROM `Drivers` WHERE did = ?',
    [id]
  );

  const d = (rows as any[])[0];
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

export async function getDriverByEmail(email: string) {
  const db = getDb();
  const [rows] = await db.execute(
    'SELECT * FROM `Drivers` WHERE email = ?',
    [email]
  );

  const d = (rows as any[])[0];
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

export async function getShiftTemplates(market?: string) {
  const db = getDb();

  if (market) {
    const [rows] = await db.execute(
      'SELECT * FROM `shift_templates` WHERE market = ? ORDER BY start_time',
      [market]
    );
    return rows;
  }

  const [rows] = await db.execute(
    'SELECT * FROM `shift_templates` ORDER BY market, start_time'
  );
  return rows;
}

export async function getScheduledShifts(options: { market?: string; date?: string; driverId?: number }) {
  const db = getDb();

  let query = `
    SELECT 
      ss.id,
      ss.driver_id as driverId,
      d.displayName as driverName,
      ss.template_id as templateId,
      st.market,
      ss.date,
      st.start_time as startTime,
      st.end_time as endTime,
      ss.created_at as createdAt
    FROM \`scheduled_shifts\` ss
    JOIN \`Drivers\` d ON ss.driver_id = d.did
    JOIN \`shift_templates\` st ON ss.template_id = st.id
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

  const [rows] = await db.execute(query, params);

  // Format dates to YYYY-MM-DD strings (MySQL returns Date objects)
  return (rows as any[]).map((row: any) => ({
    ...row,
    date: row.date instanceof Date
      ? row.date.toISOString().split('T')[0]
      : row.date
  }));
}

export async function getScheduleSettings() {
  const db = getDb();
  const [rows] = await db.execute(
    'SELECT * FROM `schedule_settings` WHERE id = 1'
  );
  return (rows as any[])[0];
}

export async function updateScheduleSettings(settings: {
  baseScheduleDays?: number;
  cancelHoursBefore?: number;
  showAvailableSpots?: boolean;
  slackWebhookUrl?: string;
}) {
  const db = getDb();
  const current = await getScheduleSettings();

  await db.execute(`
    UPDATE \`schedule_settings\` SET
      base_schedule_days = ?,
      cancel_hours_before = ?,
      show_available_spots = ?,
      slack_webhook_url = ?
    WHERE id = 1
  `, [
    settings.baseScheduleDays ?? current.base_schedule_days,
    settings.cancelHoursBefore ?? current.cancel_hours_before,
    settings.showAvailableSpots !== undefined ? (settings.showAvailableSpots ? 1 : 0) : current.show_available_spots,
    settings.slackWebhookUrl ?? current.slack_webhook_url
  ]);
}

// Get capacity for a specific template and date, considering day-of-week overrides
export async function getCapacityForDate(templateId: number, date: string): Promise<number> {
  const db = getDb();

  // Get the day of week (0=Sunday, 6=Saturday)
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();

  // Check for day-specific override
  const [overrideRows] = await db.execute(`
    SELECT capacity FROM \`capacity_overrides\` 
    WHERE template_id = ? AND day_of_week = ?
  `, [templateId, dayOfWeek]);

  const override = (overrideRows as any[])[0];
  if (override) {
    return override.capacity;
  }

  // Fall back to default template capacity
  const [templateRows] = await db.execute(
    'SELECT capacity FROM `shift_templates` WHERE id = ?',
    [templateId]
  );

  const template = (templateRows as any[])[0];
  return template?.capacity ?? 0;
}

// Get all capacity overrides for a template
export async function getCapacityOverrides(templateId: number) {
  const db = getDb();
  const [rows] = await db.execute(`
    SELECT day_of_week as dayOfWeek, capacity 
    FROM \`capacity_overrides\` 
    WHERE template_id = ?
    ORDER BY day_of_week
  `, [templateId]);

  return rows;
}

// Set capacity override for a specific day
export async function setCapacityOverride(templateId: number, dayOfWeek: number, capacity: number) {
  const db = getDb();

  if (capacity === 0) {
    // Capacity of 0 means use default - remove override
    await db.execute(
      'DELETE FROM `capacity_overrides` WHERE template_id = ? AND day_of_week = ?',
      [templateId, dayOfWeek]
    );
  } else {
    // Upsert the override
    await db.execute(`
      INSERT INTO \`capacity_overrides\` (template_id, day_of_week, capacity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE capacity = VALUES(capacity)
    `, [templateId, dayOfWeek, capacity]);
  }
}

// Delete all overrides for a template
export async function deleteCapacityOverrides(templateId: number) {
  const db = getDb();
  await db.execute(
    'DELETE FROM `capacity_overrides` WHERE template_id = ?',
    [templateId]
  );
}
