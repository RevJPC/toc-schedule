import { NextRequest, NextResponse } from 'next/server';
import { getDb, getShiftTemplates } from '@/lib/db';

// GET /api/templates - Get shift templates
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const market = searchParams.get('market');

        const templates = getShiftTemplates(market || undefined) as Array<{
            id: number;
            market: string;
            start_time: string;
            end_time: string;
            capacity: number;
        }>;

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
        console.error('Error fetching templates:', error);
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
            const result = db.prepare(`
        INSERT INTO shift_templates (market, start_time, end_time, capacity)
        VALUES (?, ?, ?, ?)
      `).run(market, startTime, endTime, cap);

            return NextResponse.json({
                success: true,
                template: {
                    id: result.lastInsertRowid,
                    market,
                    startTime,
                    endTime,
                    capacity: cap
                }
            });
        } catch (error) {
            if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return NextResponse.json({ error: 'Template already exists for this market and time' }, { status: 400 });
            }
            throw error;
        }
    } catch (error) {
        console.error('Error creating template:', error);
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
        // We could CASCADE, but safer to block if shifts exist, or just delete future shifts?
        // Let's block if there are future shifts to be safe.
        const activeShifts = db.prepare("SELECT COUNT(*) as count FROM scheduled_shifts WHERE template_id = ? AND date >= date('now')").get(templateId) as { count: number };

        if (activeShifts.count > 0) {
            return NextResponse.json({ error: 'Cannot delete template with active future shifts.' }, { status: 409 });
        }

        // It's effectively safe to delete historical shifts mapping if we want, or we can leave them orphaned (but then history breaks).
        // Actually, if we delete the template, `scheduled_shifts` foreign key `template_id` might restrict us or cascade.
        // Let's check schema. Assuming we can delete if no active shifts.

        // Delete associated overrides first (if any)
        db.prepare('DELETE FROM capacity_overrides WHERE template_id = ?').run(templateId);

        // Delete the template
        const result = db.prepare('DELETE FROM shift_templates WHERE id = ?').run(templateId);

        if (result.changes === 0) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        const fs = require('fs');
        const logPath = process.cwd() + '/template_debug.log';
        fs.appendFileSync(logPath, `[ERROR] ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\n`);

        if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
            return NextResponse.json({ error: 'Cannot delete: Template is in use by past shifts.' }, { status: 409 });
        }
        console.error('Error deleting template:', error);
        return NextResponse.json({ error: 'Internal server error: ' + (error as Error).message }, { status: 500 });
    }
}
