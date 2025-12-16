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
        const { name, email, phone, market, priority } = body;

        if (!name || !email || !market) {
            return NextResponse.json(
                { error: 'Name, email, and market are required' },
                { status: 400 }
            );
        }

        const db = getDb();

        try {
            const result = db.prepare(`
        INSERT INTO drivers (name, email, phone, market, priority, blocked)
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(name, email, phone || null, market, priority || 5);

            return NextResponse.json({
                success: true,
                driver: {
                    id: result.lastInsertRowid,
                    name,
                    email,
                    phone,
                    market,
                    priority: priority || 5,
                    blocked: false
                }
            });
        } catch (error) {
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
