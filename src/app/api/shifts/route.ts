import { NextRequest, NextResponse } from 'next/server';
import { getDb, getShiftTemplates, getScheduledShifts, getScheduleSettings, getDriverById, getCapacityForDate } from '@/lib/db';
import type { ResultSetHeader } from 'mysql2';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
        const templates = await getShiftTemplates(market) as ShiftTemplate[];

        // Get scheduled shifts for that date/market
        const scheduled = await getScheduledShifts({ market, date });

        // Build availability info for each template
        const shifts = await Promise.all(templates.map(async template => {
            const scheduledForTemplate = scheduled.filter(s => s.templateId === template.id);
            // Get capacity for this specific date (may be overridden by day-of-week)
            const capacityForDate = await getCapacityForDate(template.id, date);
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
        }));

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
        const settings = await getScheduleSettings() as { base_schedule_days: number; cancel_hours_before: number };
        const driver = await getDriverById(driverId) as { id: number; priority: number; blocked: boolean; market: string } | undefined;

        if (!driver) {
            return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
        }

        if (driver.blocked) {
            return NextResponse.json({ error: 'You are blocked from scheduling' }, { status: 403 });
        }

        // Get the template
        const [templateRows] = await db.execute('SELECT * FROM `shift_templates` WHERE id = ?', [templateId]);
        const template = (templateRows as ShiftTemplate[])[0];

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
        const capacityForDate = await getCapacityForDate(templateId, date);
        const [countRows] = await db.execute(`
            SELECT COUNT(*) as count FROM \`scheduled_shifts\` 
            WHERE template_id = ? AND date = ?
        `, [templateId, date]);
        const currentCount = (countRows as CountResult[])[0];

        if (currentCount.count >= capacityForDate) {
            return NextResponse.json({ error: 'Shift is full' }, { status: 400 });
        }

        // --- OVERLAP VALIDATION ---

        // 1. Check Previous Day's Wrapping Shifts
        const prevDateObj = new Date(shiftDate);
        prevDateObj.setDate(prevDateObj.getDate() - 1);
        const prevDate = prevDateObj.toISOString().split('T')[0];

        const prevShifts = await getScheduledShifts({ driverId, date: prevDate });

        // "toMinutes" helper
        const toMinutes = (time: string) => {
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
        };

        const myStart = toMinutes(template.start_time);

        for (const s of prevShifts) {
            const sStart = toMinutes(s.startTime);
            const sEnd = toMinutes(s.endTime);

            // If previous shift wraps (End < Start), it spills into 'Today' until sEnd minutes
            if (sEnd < sStart) {
                if (myStart < sEnd) {
                    return NextResponse.json({ error: 'Overlaps with a shift from yesterday' }, { status: 400 });
                }
            }
        }

        // 2. Check Same Day Overlaps
        const driverShifts = await getScheduledShifts({ driverId, date });

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

        // 3. Check Next Day (if I wrap)
        // (Optional strictness: if *I* wrap into tomorrow, do I overlap with tomorrow's early shifts?
        // Implementation plan didn't explicitly demand this, but good for completeness. 
        // For now, let's stick to the Plan: preventing "I claim a shift that overlaps EXISTING", 
        // assuming typical usage flow (booking in order).
        // However, if tomorrow has a 01:00 start and I book 22:00-03:00 today...
        // Let's add it for safety.)

        const myEnd = toMinutes(template.end_time);

        if (myEnd < myStart) { // I wrap
            const nextDateObj = new Date(shiftDate);
            nextDateObj.setDate(nextDateObj.getDate() + 1);
            const nextDate = nextDateObj.toISOString().split('T')[0];

            const nextShifts = await getScheduledShifts({ driverId, date: nextDate });

            for (const s of nextShifts) {
                const sStart = toMinutes(s.startTime);
                if (sStart < myEnd) {
                    return NextResponse.json({ error: 'Overlaps with a shift tomorrow' }, { status: 400 });
                }
            }
        }

        // All checks passed - claim the shift
        const [result] = await db.execute(`
            INSERT INTO \`scheduled_shifts\` (driver_id, template_id, date)
            VALUES (?, ?, ?)
        `, [driverId, templateId, date]);

        const insertResult = result as ResultSetHeader;

        return NextResponse.json({
            success: true,
            message: 'Shift claimed successfully',
            shift: {
                id: insertResult.insertId,
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
        if ((error as MySQLError).code === 'ER_DUP_ENTRY') {
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
    let e1 = toMinutes(end1);
    const s2 = toMinutes(start2);
    let e2 = toMinutes(end2);

    // Handle Wrapping: if end < start, it implies end is next day (add 24h = 1440m)
    if (e1 < s1) e1 += 1440;
    if (e2 < s2) e2 += 1440;

    // Overlap if start1 < end2 AND end1 > start2
    return s1 < e2 && e1 > s2;
}
