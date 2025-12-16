import { NextRequest, NextResponse } from 'next/server';
import { getDb, getShiftTemplates, getScheduledShifts, getAdminSettings, getDriverById, getCapacityForDate } from '@/lib/db';

// GET /api/shifts - Get available shifts for a market/date
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const market = searchParams.get('market');
        const date = searchParams.get('date');

        if (!market || !date) {
            return NextResponse.json(
                { error: 'Market and date are required' },
                { status: 400 }
            );
        }

        // Get shift templates for the market
        const templates = getShiftTemplates(market) as Array<{
            id: number;
            market: string;
            start_time: string;
            end_time: string;
            capacity: number;
        }>;

        // Get scheduled shifts for that date/market
        const scheduled = getScheduledShifts({ market, date }) as Array<{
            id: number;
            driverId: number;
            driverName: string;
            templateId: number;
            startTime: string;
            endTime: string;
        }>;

        // Build availability info for each template
        const shifts = templates.map(template => {
            const scheduledForTemplate = scheduled.filter(s => s.templateId === template.id);
            // Get capacity for this specific date (may be overridden by day-of-week)
            const capacityForDate = getCapacityForDate(template.id, date);
            return {
                id: template.id,
                market: template.market,
                startTime: template.start_time,
                endTime: template.end_time,
                capacity: capacityForDate,
                defaultCapacity: template.capacity, // Original template capacity
                scheduled: scheduledForTemplate.length,
                available: capacityForDate - scheduledForTemplate.length,
                drivers: scheduledForTemplate.map(s => ({
                    id: s.driverId,
                    name: s.driverName,
                    shiftId: s.id
                }))
            };
        });

        return NextResponse.json({ shifts });
    } catch (error) {
        console.error('Error fetching shifts:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/shifts - Claim a shift
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { driverId, templateId, date } = body;

        if (!driverId || !templateId || !date) {
            return NextResponse.json(
                { error: 'driverId, templateId, and date are required' },
                { status: 400 }
            );
        }

        const db = getDb();
        const settings = getAdminSettings() as { base_schedule_days: number; cancel_hours_before: number };
        const driver = getDriverById(driverId) as { id: number; priority: number; blocked: number; market: string } | undefined;

        if (!driver) {
            return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
        }

        if (driver.blocked) {
            return NextResponse.json({ error: 'You are blocked from scheduling' }, { status: 403 });
        }

        // Get the template
        const template = db.prepare('SELECT * FROM shift_templates WHERE id = ?').get(templateId) as {
            id: number;
            market: string;
            start_time: string;
            end_time: string;
            capacity: number;
        } | undefined;

        if (!template) {
            return NextResponse.json({ error: 'Shift template not found' }, { status: 404 });
        }

        // Check scheduling window
        const priorityBonus = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };
        const maxDays = settings.base_schedule_days + (priorityBonus[driver.priority as keyof typeof priorityBonus] || 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const shiftDate = new Date(date);
        shiftDate.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((shiftDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0 || diffDays > maxDays) {
            return NextResponse.json({ error: 'Outside your scheduling window' }, { status: 400 });
        }

        // Check capacity (using day-of-week override if set)
        const capacityForDate = getCapacityForDate(templateId, date);
        const currentCount = db.prepare(`
      SELECT COUNT(*) as count FROM scheduled_shifts 
      WHERE template_id = ? AND date = ?
    `).get(templateId, date) as { count: number };

        if (currentCount.count >= capacityForDate) {
            return NextResponse.json({ error: 'Shift is full' }, { status: 400 });
        }

        // Check for overlapping shifts (any market)
        const driverShifts = getScheduledShifts({ driverId, date }) as Array<{
            startTime: string;
            endTime: string;
            market: string;
        }>;

        // Check time overlaps with any existing shift
        for (const shift of driverShifts) {
            const hasOverlap = checkTimeOverlap(
                template.start_time,
                template.end_time,
                shift.startTime,
                shift.endTime
            );
            if (hasOverlap) {
                return NextResponse.json({ error: 'Overlaps with existing shift' }, { status: 400 });
            }
        }

        // All checks passed - claim the shift
        const result = db.prepare(`
      INSERT INTO scheduled_shifts (driver_id, template_id, date)
      VALUES (?, ?, ?)
    `).run(driverId, templateId, date);

        return NextResponse.json({
            success: true,
            message: 'Shift claimed successfully',
            shift: {
                id: result.lastInsertRowid,
                driverId,
                templateId,
                date,
                startTime: template.start_time,
                endTime: template.end_time,
                market: template.market
            }
        });
    } catch (error) {
        console.error('Error claiming shift:', error);
        if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return NextResponse.json({ error: 'Already scheduled for this shift' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

function checkTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    // Convert HH:MM to minutes for comparison
    const toMinutes = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };
    const s1 = toMinutes(start1);
    const e1 = toMinutes(end1);
    const s2 = toMinutes(start2);
    const e2 = toMinutes(end2);

    // Overlap if start1 < end2 AND end1 > start2
    return s1 < e2 && e1 > s2;
}
