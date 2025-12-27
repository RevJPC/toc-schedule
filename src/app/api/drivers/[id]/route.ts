import { NextRequest, NextResponse } from 'next/server';
import { getDb, getDriverById } from '@/lib/db';

// GET /api/drivers/[id] - Get a single driver
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const driverId = parseInt(id);

        if (isNaN(driverId)) {
            return NextResponse.json({ error: 'Invalid driver ID' }, { status: 400 });
        }

        const driver = getDriverById(driverId);

        if (!driver) {
            return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
        }

        return NextResponse.json({ driver });
    } catch (error) {
        console.error('Error fetching driver:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/drivers/[id] - Update driver details (priority, blocked, etc.)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const driverId = parseInt(id);

        if (isNaN(driverId)) {
            return NextResponse.json({ error: 'Invalid driver ID' }, { status: 400 });
        }

        const body = await request.json();
        const { priority, blocked, market, name, phone } = body;

        const db = getDb();
        const driver = getDriverById(driverId);

        if (!driver) {
            return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
        }

        // Build dynamic update query
        const updates: string[] = [];
        const values: (string | number)[] = [];

        if (priority !== undefined) {
            if (priority < 1 || priority > 5) {
                return NextResponse.json({ error: 'Priority must be 1-5' }, { status: 400 });
            }
            updates.push('priority = ?');
            values.push(priority);
        }

        if (blocked !== undefined) {
            updates.push('blocked = ?');
            values.push(blocked ? 1 : 0);
        }

        if (market !== undefined) {
            updates.push('market = ?');
            values.push(market);
        }

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }

        if (phone !== undefined) {
            updates.push('phone = ?');
            values.push(phone || null);
        }

        if (updates.length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        // Map updates to new schema columns
        const schemaUpdates: string[] = [];
        updates.map((field, index) => {
            if (field === 'priority = ?') schemaUpdates.push('schedule_priority = ?');
            else if (field === 'blocked = ?') {
                schemaUpdates.push('status = ?');
                // Flip logic: blocked(true) -> status(0), blocked(false) -> status(1)
                values[index] = values[index] ? 0 : 1;
            }
            else schemaUpdates.push(field);
        });

        // Also handle explicit market update if passed as "market" (no name change needed)

        values.push(driverId);
        // Table is Drivers, ID is did
        db.prepare(`UPDATE Drivers SET ${schemaUpdates.join(', ')} WHERE did = ?`).run(...values);

        const updatedDriver = getDriverById(driverId);
        return NextResponse.json({
            success: true,
            driver: updatedDriver
        });
    } catch (error) {
        console.error('Error updating driver:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
