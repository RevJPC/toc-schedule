import { NextRequest, NextResponse } from 'next/server';
import { getDb, getShiftTemplates } from '@/lib/db';
import type { ResultSetHeader } from 'mysql2';

interface ShiftTemplate {
    id: number;
    market: string;
    start_time: string;
    end_time: string;
    capacity: number;
}

interface CountResult {
    count: number;
}

interface MySQLError extends Error {
    code?: string;
}

// GET /api/templates - Get shift templates
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const market = searchParams.get('market');

        const templates = await getShiftTemplates(market || undefined) as ShiftTemplate[];

        // Convert to camelCase
        const formatted = templates.map(t => ({
            id: t.id,
            market: t.market,
            startTime: t.start_time,
            endTime: t.end_time,
            capacity: t.capacity
        }));

        return NextResponse.json({ templates: formatted });
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Error fetching templates:', error);
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/templates - Create a new shift template
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { market, startTime, endTime, capacity } = body;

        if (!market || !startTime || !endTime) {
            return NextResponse.json(
                { error: 'Market, startTime, and endTime are required' },
                { status: 400 }
            );
        }

        // Validate time format (HH:MM)
        const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
            return NextResponse.json({ error: 'Invalid time format. Use HH:MM' }, { status: 400 });
        }

        // Validate capacity
        const cap = capacity || 1;
        if (cap < 1 || cap > 20) {
            return NextResponse.json({ error: 'Capacity must be 1-20' }, { status: 400 });
        }

        const db = getDb();

        try {
            const [result] = await db.execute(`
                INSERT INTO \`shift_templates\` (market, start_time, end_time, capacity)
                VALUES (?, ?, ?, ?)
            `, [market, startTime, endTime, cap]);

            const insertResult = result as ResultSetHeader;

            return NextResponse.json({
                success: true,
                template: {
                    id: insertResult.insertId,
                    market,
                    startTime,
                    endTime,
                    capacity: cap
                }
            });
        } catch (error) {
            if ((error as MySQLError).code === 'ER_DUP_ENTRY') {
                return NextResponse.json({ error: 'Template already exists for this market and time' }, { status: 400 });
            }
            throw error;
        }
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Error creating template:', error);
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
// DELETE /api/templates - Delete a shift template
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const db = getDb();
        const templateId = parseInt(id);

        // Check for dependencies (scheduled shifts)
        const [activeShiftsRows] = await db.execute(
            "SELECT COUNT(*) as count FROM \`scheduled_shifts\` WHERE template_id = ? AND date >= CURDATE()",
            [templateId]
        );
        const activeShifts = (activeShiftsRows as CountResult[])[0];

        if (activeShifts.count > 0) {
            return NextResponse.json({ error: 'Cannot delete template with active future shifts.' }, { status: 409 });
        }

        // Delete associated overrides first (if any)
        await db.execute('DELETE FROM \`capacity_overrides\` WHERE template_id = ?', [templateId]);

        // Delete the template
        const [result] = await db.execute('DELETE FROM \`shift_templates\` WHERE id = ?', [templateId]);
        const deleteResult = result as ResultSetHeader;

        if (deleteResult.affectedRows === 0) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        if ((error as MySQLError).code === 'ER_ROW_IS_REFERENCED_2') {
            return NextResponse.json({ error: 'Cannot delete: Template is in use by past shifts.' }, { status: 409 });
        }
        if (process.env.NODE_ENV !== 'production') {
            console.error('Error deleting template:', error);
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
