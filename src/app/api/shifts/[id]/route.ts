import { NextRequest, NextResponse } from 'next/server';
import { getDb, getScheduleSettings } from '@/lib/db';
import type { ResultSetHeader } from 'mysql2';

interface ShiftRow {
    id: number;
    driver_id: number;
    date: Date | string;
    start_time: string;
    end_time: string;
}

// DELETE /api/shifts/[id] - Cancel a shift
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const shiftId = parseInt(id);

        if (isNaN(shiftId)) {
            return NextResponse.json({ error: 'Invalid shift ID' }, { status: 400 });
        }

        const db = getDb();
        const settings = await getScheduleSettings() as { cancel_hours_before: number };

        // Get the shift with template info
        const [shiftRows] = await db.execute(`
            SELECT ss.*, st.start_time, st.end_time, st.market
            FROM \`scheduled_shifts\` ss
            JOIN \`shift_templates\` st ON ss.template_id = st.id
            WHERE ss.id = ?
        `, [shiftId]);

        const shift = (shiftRows as ShiftRow[])[0];

        if (!shift) {
            return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
        }

        // Convert MySQL Date object to YYYY-MM-DD string if needed
        const dateStr = shift.date instanceof Date
            ? shift.date.toISOString().split('T')[0]
            : shift.date;

        // Check if within cancellation window
        const shiftDateTime = new Date(`${dateStr}T${shift.start_time}`);
        const now = new Date();
        const hoursUntilShift = (shiftDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Check if this is an admin request (header check - in production would use proper auth)
        const isAdmin = request.headers.get('x-admin-override') === 'true';

        if (!isAdmin && hoursUntilShift < settings.cancel_hours_before) {
            return NextResponse.json(
                { error: `Cannot cancel within ${settings.cancel_hours_before} hours. Please email admin.` },
                { status: 400 }
            );
        }

        // Prevent deleting past shifts (history preservation)
        const shiftEndDateTime = new Date(`${dateStr}T${shift.end_time}`);
        // Handle midnight wrapping for end date check
        if (shift.end_time < shift.start_time) {
            shiftEndDateTime.setDate(shiftEndDateTime.getDate() + 1);
        }

        if (shiftEndDateTime < now) {
            return NextResponse.json(
                { error: 'Cannot delete past shifts.' },
                { status: 400 }
            );
        }

        // Delete the shift
        const [result] = await db.execute('DELETE FROM \`scheduled_shifts\` WHERE id = ?', [shiftId]);
        const deleteResult = result as ResultSetHeader;

        if (deleteResult.affectedRows === 0) {
            console.error(`[DELETE] Failed: No rows deleted for ID ${shiftId}`);
            return NextResponse.json({ error: 'Failed to delete shift (not found during delete execution)' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Shift cancelled successfully'
        });
    } catch (error) {
        console.error('Error cancelling shift:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
