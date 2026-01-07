# MySQL Migration to XAMPP

## Overview

The toc-schedule application has been migrated from SQLite to MySQL to work with XAMPP. This document explains the setup and configuration.

## Prerequisites

1. **XAMPP installed and running**
   - Apache service started
   - MySQL service started
   
2. **Database created in MySQL**
   - Run the SQL script: `database_mysql_setup.sql`
   - See `XAMPP_DATABASE_SETUP.md` for detailed instructions

## Configuration

### Environment Variables

Create a `.env.local` file in the project root with the following content:

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=toc_schedule
```

> **Note**: The `.env.local` file is gitignored and will not be committed to version control.

### Default XAMPP Settings

The default configuration above works with a standard XAMPP installation:
- **Host**: localhost
- **Port**: 3306 (MySQL default)
- **User**: root
- **Password**: (empty by default in XAMPP)
- **Database**: toc_schedule

## Running the Application

1. **Ensure XAMPP MySQL is running**
   ```powershell
   # Check in XAMPP Control Panel that MySQL shows "Running"
   ```

2. **Install dependencies** (if not already done)
   ```powershell
   npm install
   ```

3. **Start the development server**
   ```powershell
   npm run dev
   ```

4. **Access the application**
   - Open browser to `http://localhost:3000`

## Key Changes from SQLite

### Database Layer
- **Package**: Changed from `better-sqlite3` to `mysql2`
- **API**: All database calls are now async/await
- **Connection**: Uses connection pooling instead of single file

### Error Codes
SQLite error codes have been replaced with MySQL equivalents:
- `SQLITE_CONSTRAINT_UNIQUE` → `ER_DUP_ENTRY`
- `SQLITE_CONSTRAINT_FOREIGNKEY` → `ER_ROW_IS_REFERENCED_2`

### Query Syntax
- Table names wrapped in backticks: `` `count` ``, `` `Drivers` ``
- `lastInsertRowid` → `insertId`
- `changes` → `affectedRows`
- `date('now')` → `CURDATE()`
- Prepared statements use `execute()` with parameter arrays

## Troubleshooting

### "Cannot connect to database"
- Verify MySQL is running in XAMPP Control Panel
- Check `.env.local` file exists and has correct credentials
- Ensure `toc_schedule` database exists in phpMyAdmin

### "Table doesn't exist"
- Run the `database_mysql_setup.sql` script in phpMyAdmin
- Verify all tables were created successfully

### "Access denied for user"
- Check DB_USER and DB_PASSWORD in `.env.local`
- Default XAMPP has user `root` with no password

### Port already in use
- Another MySQL instance may be running
- Change DB_PORT in `.env.local` or stop other MySQL services

## Database Management

### phpMyAdmin Access
- URL: `http://localhost/phpmyadmin`
- Username: `root`
- Password: (leave empty)

### Backup Database
```sql
-- In phpMyAdmin, select toc_schedule database
-- Click "Export" tab
-- Choose "Quick" export method
-- Click "Export" button
```

### Reset Database
```sql
-- Run the database_mysql_setup.sql script again
-- This will DROP and recreate the database with fresh data
```

## Migration Notes

- All API routes have been updated to use async/await
- Connection pooling is configured with 10 max connections
- Foreign key constraints are enforced
- All original functionality is preserved
