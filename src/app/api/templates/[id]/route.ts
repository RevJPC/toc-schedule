import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// PATCH /api/templates/[id] - Update a shift template
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const templateId = parseInt(id);

        if (isNaN(templateId)) {
            return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
        }

        const body = await request.json();
        const { capacity, startTime, endTime } = body;

        const db = getDb();
        const template = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(templateId);

        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        // Build update query
        const updates: string[] = [];
        const values: (string | number)[] = [];

        if (capacity !== undefined) {
            if (capacity < 1 || capacity > 20) {
                return NextResponse.json({ error: 'Capacity must be 1-20' }, { status: 400 });
            }

            // Check if reducing capacity below current scheduled count
            const currentScheduled = db.prepare(`
        SELECT COUNT(*) as count FROM scheduled_shifts 
        WHERE template_id = ? AND date >= date('now')
      `).get(templateId) as { count: number };

            if (capacity < currentScheduled.count) {
                return NextResponse.json(
                    { error: `Cannot reduce capacity below ${currentScheduled.count} (currently scheduled)` },
                    { status: 400 }
                );
            }

            updates.push('capacity = ?');
            values.push(capacity);
        }

        if (startTime !== undefined) {
            const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
            if (!timePattern.test(startTime)) {
                return NextResponse.json({ error: 'Invalid time format. Use HH:MM' }, { status: 400 });
            }
            updates.push('start_time = ?');
            values.push(startTime);
        }

        if (endTime !== undefined) {
            const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
            if (!timePattern.test(endTime)) {
                return NextResponse.json({ error: 'Invalid time format. Use HH:MM' }, { status: 400 });
            }
            updates.push('end_time = ?');
            values.push(endTime);
        }

        if (updates.length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        values.push(templateId);
        db.prepare(`UPDATE shift_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        const updated = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(templateId) as {
            id: number;
            market: string;
            start_time: string;
            end_time: string;
            capacity: number;
        };

        return NextResponse.json({
            success: true,
            template: {
                id: updated.id,
                market: updated.market,
                startTime: updated.start_time,
                endTime: updated.end_time,
                capacity: updated.capacity
            }
        });
    } catch (error) {
        console.error('Error updating template:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/templates/[id] - Delete a shift template
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const templateId = parseInt(id);

        if (isNaN(templateId)) {
            return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
        }

        const db = getDb();

        // Check if any future shifts are scheduled
        const scheduled = db.prepare(`
      SELECT COUNT(*) as count FROM scheduled_shifts 
      WHERE template_id = ? AND date >= date('now')
    `).get(templateId) as { count: number };

        if (scheduled.count > 0) {
            return NextResponse.json(
                { error: `Cannot delete template with ${scheduled.count} scheduled shifts` },
                { status: 400 }
            );
        }

        db.prepare('DELETE FROM shift_templates WHERE id = ?').run(templateId);

        return NextResponse.json({
            success: true,
            message: 'Template deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting template:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
