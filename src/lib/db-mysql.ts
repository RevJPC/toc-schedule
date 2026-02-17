import mysql, { PoolOptions } from 'mysql2/promise';
import fs from 'fs';

// Singleton connection pool
let pool: mysql.Pool | null = null;

// Validate required environment variables
function validateEnvironment(): void {
  const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}. ` +
      'Please set these in your environment or .env file.'
    );
  }
}

// Build SSL configuration for AWS RDS or other secure connections
function getSSLConfig(): PoolOptions['ssl'] | undefined {
  const sslEnabled = process.env.DB_SSL === 'true';
  
  if (!sslEnabled) {
    return undefined;
  }
  
  // If a custom CA certificate is provided, use it
  if (process.env.DB_SSL_CA) {
    return {
      ca: fs.readFileSync(process.env.DB_SSL_CA),
      rejectUnauthorized: true
    };
  }
  
  // For AWS RDS, use the default SSL configuration
  // mysql2 will use the system's CA certificates
  return {
    rejectUnauthorized: true
  };
}

// Create connection pool with retry logic
async function createPoolWithRetry(maxRetries = 3, retryDelay = 2000): Promise<mysql.Pool> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const poolConfig: PoolOptions = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'toc_schedule',
        waitForConnections: true,
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
        queueLimit: 100, // Limit queue to prevent memory issues under high load
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000, // 10 seconds
        connectTimeout: 10000, // 10 second connection timeout
        ssl: getSSLConfig()
      };

      const newPool = mysql.createPool(poolConfig);
      
      // Test the connection
      const connection = await newPool.getConnection();
      connection.release();
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DB] MySQL connection pool created successfully');
      }
      
      return newPool;
    } catch (error) {
      lastError = error as Error;
      
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[DB] Connection attempt ${attempt}/${maxRetries} failed:`, error);
      }
      
      if (attempt < maxRetries) {
        // Wait before retrying with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(
    `Failed to connect to database after ${maxRetries} attempts. ` +
    `Last error: ${lastError?.message}`
  );
}

export function getDb(): mysql.Pool {
  if (!pool) {
    // Validate environment in production
    validateEnvironment();
    
    // Create pool synchronously for backward compatibility
    // Note: First query may fail if connection isn't ready
    const poolConfig: PoolOptions = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'toc_schedule',
      waitForConnections: true,
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
      queueLimit: 100,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 10000,
      ssl: getSSLConfig()
    };

    pool = mysql.createPool(poolConfig);
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DB] MySQL connection pool initialized');
    }
  }

  return pool;
}

// Initialize pool with retry (call this at app startup if needed)
export async function initializeDb(): Promise<mysql.Pool> {
  if (!pool) {
    validateEnvironment();
    pool = await createPoolWithRetry();
  }
  return pool;
}

// Health check function for monitoring
export async function checkDbHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const db = getDb();
    await db.execute('SELECT 1');
    return {
      healthy: true,
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: (error as Error).message
    };
  }
}

// Graceful shutdown
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DB] MySQL connection pool closed');
    }
  }
}

// Helper functions for common queries

export async function getMarkets(includeInactive = false) {
  const db = getDb();
  const query = includeInactive
    ? 'SELECT * FROM `count` ORDER BY defaultcity'
    : 'SELECT * FROM `count` WHERE status = 1 ORDER BY defaultcity';

  const [rows] = await db.execute(query);
  return (rows as Record<string, unknown>[]).map((m) => ({
    id: m.id as number,
    name: m.defaultcity as string,
    market: m.market as string,
    active: Boolean(m.status)
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

  return (rows as Record<string, unknown>[]).map((d) => ({
    id: d.did,
    name: (d.displayName as string) || `${d.Owner_fname} ${d.Owner_lname}`,
    email: d.email,
    phone: d.phone,
    market: d.market,
    priority: d.schedule_priority,
    blocked: d.status === 0
  }));
}

export async function getDriverById(id: number) {
  const db = getDb();
  const [rows] = await db.execute(
    'SELECT * FROM `Drivers` WHERE did = ?',
    [id]
  );

  const d = (rows as Record<string, unknown>[])[0];
  if (!d) return undefined;

  return {
    id: d.did,
    name: (d.displayName as string) || `${d.Owner_fname} ${d.Owner_lname}`,
    email: d.email,
    phone: d.phone,
    market: d.market,
    priority: d.schedule_priority,
    blocked: d.status === 0
  };
}

export async function getDriverByEmail(email: string) {
  const db = getDb();
  const [rows] = await db.execute(
    'SELECT * FROM `Drivers` WHERE email = ?',
    [email]
  );

  const d = (rows as Record<string, unknown>[])[0];
  if (!d) return undefined;

  return {
    id: d.did,
    name: (d.displayName as string) || `${d.Owner_fname} ${d.Owner_lname}`,
    email: d.email,
    phone: d.phone,
    market: d.market,
    priority: d.schedule_priority,
    blocked: d.status === 0
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

interface ScheduledShiftRow {
  id: number;
  driverId: number;
  driverName: string;
  templateId: number;
  market: string;
  date: Date | string;
  startTime: string;
  endTime: string;
  createdAt: Date | string;
}

export async function getScheduledShifts(options: { market?: string; date?: string; driverId?: number }): Promise<Array<Omit<ScheduledShiftRow, 'date'> & { date: string }>> {
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
  return (rows as ScheduledShiftRow[]).map((row) => ({
    id: row.id,
    driverId: row.driverId,
    driverName: row.driverName,
    templateId: row.templateId,
    market: row.market,
    date: row.date instanceof Date
      ? row.date.toISOString().split('T')[0]
      : row.date as string,
    startTime: row.startTime,
    endTime: row.endTime,
    createdAt: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : row.createdAt as string
  }));
}

export async function getScheduleSettings() {
  const db = getDb();
  const [rows] = await db.execute(
    'SELECT * FROM `schedule_settings` WHERE id = 1'
  );
  return (rows as Record<string, unknown>[])[0];
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
    settings.baseScheduleDays ?? current?.base_schedule_days,
    settings.cancelHoursBefore ?? current?.cancel_hours_before,
    settings.showAvailableSpots !== undefined ? (settings.showAvailableSpots ? 1 : 0) : current?.show_available_spots,
    settings.slackWebhookUrl ?? current?.slack_webhook_url
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

  const override = (overrideRows as { capacity: number }[])[0];
  if (override) {
    return override.capacity;
  }

  // Fall back to default template capacity
  const [templateRows] = await db.execute(
    'SELECT capacity FROM `shift_templates` WHERE id = ?',
    [templateId]
  );

  const template = (templateRows as { capacity: number }[])[0];
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
