import { NextRequest, NextResponse } from 'next/server';
import { updateMarketStatus, getDb } from '@/lib/db';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const marketId = parseInt(id);
        const body = await request.json();
        const { active } = body;

        if (isNaN(marketId)) {
            return NextResponse.json({ error: 'Invalid market ID' }, { status: 400 });
        }

        if (typeof active !== 'boolean') {
            return NextResponse.json({ error: 'Active status required (boolean)' }, { status: 400 });
        }

        updateMarketStatus(marketId, active);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating market:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const marketId = parseInt(id);

        if (isNaN(marketId)) {
            return NextResponse.json({ error: 'Invalid market ID' }, { status: 400 });
        }

        const db = getDb();

        // Check if market exists
        const market = db.prepare('SELECT * FROM count WHERE id = ?').get(marketId);
        if (!market) {
            return NextResponse.json({ error: 'Market not found' }, { status: 404 });
        }

        try {
            db.prepare('DELETE FROM count WHERE id = ?').run(marketId);
            return NextResponse.json({ success: true, message: 'Market deleted' });
        } catch (e: any) {
            if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
                return NextResponse.json({
                    error: 'Cannot delete market because it has associated drivers or templates. Please remove them first.'
                }, { status: 409 });
            }
            throw e;
        }

    } catch (error) {
        console.error('Error deleting market:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
