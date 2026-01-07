import { NextRequest, NextResponse } from 'next/server';
import { getDb, getDrivers } from '@/lib/db';

// GET /api/drivers - List all drivers
export async function GET() {
    try {
        const drivers = await getDrivers();
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
            const [result] = await db.execute(`
                INSERT INTO \`Drivers\` (Owner_fname, Owner_lname, displayName, email, phone, market, schedule_priority, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `, [firstName, lastName, displayName, email, cleanPhone, market, priority || 5]) as any;

            return NextResponse.json({
                success: true,
                driver: {
                    id: result.insertId,
                    name: displayName,
                    email,
                    phone: cleanPhone,
                    market,
                    priority: priority || 5,
                    blocked: false
                }
            });
        } catch (error) {
            // MySQL duplicate key error
            if ((error as any).code === 'ER_DUP_ENTRY') {
                return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
            }
            throw error;
        }
    } catch (error) {
        console.error('Error creating driver:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
