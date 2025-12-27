import { NextRequest, NextResponse } from 'next/server';
import { getDb, getDrivers } from '@/lib/db';

// GET /api/drivers - List all drivers
export async function GET() {
    try {
        const drivers = getDrivers();
        return NextResponse.json({ drivers });
    } catch (error) {
        console.error('Error fetching drivers:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/drivers - Create a new driver
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        // Allow flexible input: 'name' (full string) or 'firstName'/'lastName'
        let { name, firstName, lastName, email, phone, market, priority } = body;

        if ((!name && (!firstName || !lastName)) || !email || !market) {
            return NextResponse.json(
                { error: 'Name, email, and market are required' },
                { status: 400 }
            );
        }

        // normalize name
        if (!firstName) {
            const parts = name.trim().split(' ');
            firstName = parts[0];
            lastName = parts.slice(1).join(' ') || '';
        }

        let displayName = name;
        if (!displayName) {
            displayName = `${firstName} ${lastName}`.trim();
        }

        // normalize phone (remove dashes)
        const cleanPhone = phone ? phone.replace(/-/g, '') : null;

        // normalize market (should be 3 chars ideally, but if name passed, we might need logic. 
        // For now assume frontend sends code or we truncate, but db migration handled strict codes.)
        // Ideally frontend is updated to send code. 

        const db = getDb();

        try {
            const result = db.prepare(`
        INSERT INTO Drivers (Owner_fname, Owner_lname, displayName, email, phone, market, schedule_priority, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(firstName, lastName, displayName, email, cleanPhone, market, priority || 5);

            return NextResponse.json({
                success: true,
                driver: {
                    id: result.lastInsertRowid,
                    name: displayName,
                    email,
                    phone: cleanPhone,
                    market,
                    priority: priority || 5,
                    blocked: false // Legacy compat
                }
            });
        } catch (error) {
            // ... existing error handling ...
            if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
            }
            throw error;
        }
    } catch (error) {
        console.error('Error creating driver:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
