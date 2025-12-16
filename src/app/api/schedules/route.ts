import { NextRequest, NextResponse } from 'next/server';
import { getScheduledShifts } from '@/lib/db';

// GET /api/schedules - Get scheduled shifts with filters
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const market = searchParams.get('market') || undefined;
        const date = searchParams.get('date') || undefined;
        const driverId = searchParams.get('driverId');

        const shifts = getScheduledShifts({
            market,
            date,
            driverId: driverId ? parseInt(driverId) : undefined
        });

        return NextResponse.json({ shifts });
    } catch (error) {
        console.error('Error fetching schedules:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
