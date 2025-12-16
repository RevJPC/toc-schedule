import { NextResponse } from 'next/server';
import { getMarkets } from '@/lib/db';

// GET /api/markets - List all active markets
export async function GET() {
    try {
        const markets = getMarkets();
        return NextResponse.json({ markets });
    } catch (error) {
        console.error('Error fetching markets:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
