import { NextRequest, NextResponse } from 'next/server';
import { getMarkets, addMarket } from '@/lib/db';

// GET /api/markets - List all markets (includeActive query param to filter?)
// For admin we want all, for user maybe just active?
// getMarkets() defaults to active only. getMarkets(true) gives all.
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const includeInactive = searchParams.get('includeInactive') === 'true';

        const markets = getMarkets(includeInactive);
        return NextResponse.json({ markets });
    } catch (error) {
        console.error('Error fetching markets:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/markets - Create new market
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, code } = body; // Expect name (City) and code (3 chars)

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Market name is required' }, { status: 400 });
        }

        // Basic code generation if not provided (fallback)
        const marketCode = code || name.substring(0, 3).toLowerCase();

        try {
            addMarket(name.trim(), marketCode);
            return NextResponse.json({ success: true, message: 'Market created' });
        } catch (e: any) {
            if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return NextResponse.json({ error: 'Market already exists' }, { status: 409 });
            }
            throw e;
        }
    } catch (error) {
        console.error('Error creating market:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
