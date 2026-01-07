# TOC Schedule Database Setup with XAMPP

This guide will help you recreate the database using XAMPP's MySQL server.

## Prerequisites

- XAMPP installed on your Windows machine
- XAMPP Control Panel running

## Step 1: Start XAMPP Services

1. Open **XAMPP Control Panel**
2. Click **Start** for both:
   - Apache (for phpMyAdmin)
   - MySQL (for the database)
3. Wait until both services show "Running" status

## Step 2: Access phpMyAdmin

1. Open your web browser
2. Navigate to: `http://localhost/phpmyadmin`
3. You should see the phpMyAdmin interface

## Step 3: Import the Database

### Option A: Using phpMyAdmin (Recommended)

1. In phpMyAdmin, click on the **Import** tab at the top
2. Click **Choose File** button
3. Navigate to and select: `c:\Users\jamie\Programming\toc-schedule\database_mysql_setup.sql`
4. Scroll down and click **Import** button
5. Wait for the success message

### Option B: Using MySQL Command Line

1. Open Command Prompt or PowerShell
2. Navigate to XAMPP's MySQL bin directory:
   ```powershell
   cd C:\xampp\mysql\bin
   ```
3. Run the following command:
   ```powershell
   .\mysql.exe -u root -p < "c:\Users\jamie\Programming\toc-schedule\database_mysql_setup.sql"
   ```
4. Press Enter when prompted for password (default XAMPP has no password, just press Enter)

## Step 4: Verify Database Creation

1. In phpMyAdmin, click **Refresh** in the left sidebar
2. You should see a new database called **toc_schedule**
3. Click on **toc_schedule** to expand it
4. You should see the following tables:
   - `admins`
   - `capacity_overrides`
   - `count` (markets)
   - `Drivers`
   - `scheduled_shifts`
   - `schedule_settings`
   - `shift_templates`

## Step 5: Review Sample Data

The database includes:
- **7 default markets** (Chapel Hill, Asheville, Raleigh, Durham, Wilmington, Greensboro, Winston-Salem)
- **1 test driver** (test@example.com)
- **4 sample shift templates**
- **Default schedule settings**
- **1 admin user** (admin@example.com)

## Database Connection Details

Use these credentials to connect your application to the database:

```
Host: localhost
Port: 3306
Database: toc_schedule
Username: root
Password: (empty by default in XAMPP)
```

## Important Notes

### Security Warning
⚠️ **IMPORTANT**: The default admin password in the SQL file is a placeholder. You should:
1. Generate a proper bcrypt hash for your desired password
2. Update the admin user's password_hash in the database

### Schema Differences from SQLite

The MySQL version has been optimized with:
- Proper indexes for better performance
- Foreign key constraints with CASCADE options
- VARCHAR types instead of TEXT for better performance
- TIME type for shift times instead of TEXT
- DATE type for shift dates instead of TEXT
- TIMESTAMP for created_at fields

### Migrating Existing Data

If you have existing SQLite data you want to migrate:
1. Export data from SQLite using the scripts in the `/scripts` folder
2. Convert the data to MySQL INSERT statements
3. Import after running this setup script

## Troubleshooting

### "Table already exists" Error
If you get this error, the database already exists. Either:
- Drop the database first: `DROP DATABASE toc_schedule;`
- Or modify the SQL file to remove the DROP DATABASE line

### Connection Refused
- Make sure MySQL service is running in XAMPP Control Panel
- Check that port 3306 is not blocked by firewall
- Verify no other MySQL instance is running on port 3306

### phpMyAdmin Access Denied
- Default XAMPP username is `root` with no password
- If you've changed it, use your custom credentials

## Next Steps

After setting up the database:
1. Update your application's database configuration to use MySQL instead of SQLite
2. Test the connection
3. Verify all CRUD operations work correctly
4. Update any SQLite-specific queries to MySQL syntax if needed

## Database Schema Overview

```
count (markets)
├── id (PK)
├── market (3-letter code, UNIQUE)
├── defaultcity (full name)
└── status (active/inactive)

Drivers
├── did (PK)
├── Owner_fname, Owner_lname
├── displayName
├── email (UNIQUE)
├── phone
├── market (FK → count.market)
├── schedule_priority (1-5)
├── status
└── created_at

shift_templates
├── id (PK)
├── market (FK → count.market)
├── start_time, end_time
└── capacity (1-20)

scheduled_shifts
├── id (PK)
├── driver_id (FK → Drivers.did)
├── template_id (FK → shift_templates.id)
├── date
└── created_at

capacity_overrides
├── id (PK)
├── template_id (FK → shift_templates.id)
├── day_of_week (0-6)
└── capacity

schedule_settings
├── id (always 1)
├── base_schedule_days
├── cancel_hours_before
├── show_available_spots
└── slack_webhook_url

admins
├── id (PK)
├── email (UNIQUE)
├── password_hash
├── name
└── created_at
```
