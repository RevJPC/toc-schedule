# API Routes MySQL Migration Status

## ✅ Completed Routes
- [x] `/api/drivers` - GET, POST updated
- [x] `/api/drivers/[id]` - GET, PATCH updated  
- [x] `/api/markets` - GET, POST updated
- [x] `/api/templates` - GET, POST, DELETE updated

## 🔄 Routes Requiring Manual Updates

The following routes contain complex SQLite-specific queries that need manual async conversion:

### `/api/shifts/route.ts`
**Lines to update:**
- Line 22: `getShiftTemplates(market)` → `await getShiftTemplates(market)`
- Line 31: `getScheduledShifts({ market, date })` → `await getScheduledShifts({ market, date })`
- Line 44: `getCapacityForDate(template.id, date)` → `await getCapacityForDate(template.id, date)`
- Line 83: `getScheduleSettings()` → `await getScheduleSettings()`
- Line 84: `getDriverById(driverId)` → `await getDriverById(driverId)`
- Line 95-101: Replace `db.prepare().get()` with `await db.execute()` and array destructuring
- Line 121: `getCapacityForDate(templateId, date)` → `await getCapacityForDate(templateId, date)`
- Line 122-125: Replace `db.prepare().get()` with `await db.execute()`
- Line 138: `getScheduledShifts({ driverId, date: prevDate })` → `await getScheduledShifts(...)`
- Line 164: `getScheduledShifts({ driverId, date })` → `await getScheduledShifts(...)`
- Line 197: `getScheduledShifts({ driverId, date: nextDate })` → `await getScheduledShifts(...)`
- Line 211-214: Replace `db.prepare().run()` with `await db.execute()`
- Line 220: `result.lastInsertRowid` → `result.insertId`
- Line 231: `SQLITE_CONSTRAINT_UNIQUE` → `ER_DUP_ENTRY`

### `/api/settings/route.ts`
**Lines to update:**
- Line 7: `getScheduleSettings()` → `await getScheduleSettings()`
- Line 45: `updateScheduleSettings(...)` → `await updateScheduleSettings(...)`
- Line 52: `getScheduleSettings()` → `await getScheduleSettings()`

### Other Routes (Lower Priority)
- `/api/shifts/[id]/route.ts` - DELETE handler
- `/api/templates/[id]/route.ts` - PATCH handler
- `/api/markets/[id]/route.ts` - PATCH handler
- `/api/capacity-overrides/route.ts` - GET, POST handlers
- `/api/schedules/route.ts` - GET, POST handlers
- `/api/slack/post-schedule/route.ts` - POST handler

## Quick Reference: Common Conversions

### SQLite → MySQL
```typescript
// OLD (SQLite)
const result = db.prepare('SELECT * FROM table WHERE id = ?').get(id);

// NEW (MySQL)
const [rows] = await db.execute('SELECT * FROM `table` WHERE id = ?', [id]);
const result = (rows as any[])[0];
```

```typescript
// OLD (SQLite)
const result = db.prepare('INSERT INTO table (col) VALUES (?)').run(value);
const id = result.lastInsertRowid;

// NEW (MySQL)
const [result] = await db.execute('INSERT INTO `table` (col) VALUES (?)', [value]) as any;
const id = result.insertId;
```

```typescript
// OLD (SQLite)
const result = db.prepare('DELETE FROM table WHERE id = ?').run(id);
if (result.changes === 0) { /* not found */ }

// NEW (MySQL)
const [result] = await db.execute('DELETE FROM `table` WHERE id = ?', [id]) as any;
if (result.affectedRows === 0) { /* not found */ }
```

## Testing Checklist

After updates:
- [ ] Start dev server: `npm run dev`
- [ ] Test driver CRUD operations
- [ ] Test market management
- [ ] Test shift template creation/deletion
- [ ] Test shift claiming/canceling
- [ ] Test settings updates
- [ ] Verify error handling (duplicates, foreign keys)
