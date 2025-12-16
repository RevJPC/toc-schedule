import { NextRequest, NextResponse } from 'next/server';
import { getDb, getAdminSettings } from '@/lib/db';

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
        const settings = getAdminSettings() as { cancel_hours_before: number };

        // Get the shift with template info
        const shift = db.prepare(`
      SELECT ss.*, st.start_time, st.end_time, st.market
      FROM scheduled_shifts ss
      JOIN shift_templates st ON ss.template_id = st.id
      WHERE ss.id = ?
    `).get(shiftId) as {
            id: number;
            driver_id: number;
            date: string;
            start_time: string;
            end_time: string;
        } | undefined;

        if (!shift) {
            return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
        }

        // Check if within cancellation window
        const shiftDateTime = new Date(`${shift.date}T${shift.start_time}`);
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

        // Delete the shift
        db.prepare('DELETE FROM scheduled_shifts WHERE id = ?').run(shiftId);

        return NextResponse.json({
            success: true,
            message: 'Shift cancelled successfully'
        });
    } catch (error) {
        console.error('Error cancelling shift:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
