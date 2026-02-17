import { NextRequest, NextResponse } from 'next/server';
import { updateMarketStatus, getDb } from '@/lib/db';

interface MySQLError extends Error {
    code?: string;
    errno?: number;
}

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

        await updateMarketStatus(marketId, active);

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
        const [rows] = await db.execute('SELECT * FROM `count` WHERE id = ?', [marketId]);
        const market = (rows as Record<string, unknown>[])[0];
        
        if (!market) {
            return NextResponse.json({ error: 'Market not found' }, { status: 404 });
        }

        try {
            await db.execute('DELETE FROM `count` WHERE id = ?', [marketId]);
            return NextResponse.json({ success: true, message: 'Market deleted' });
        } catch (e) {
            const mysqlError = e as MySQLError;
            // MySQL foreign key constraint error code is ER_ROW_IS_REFERENCED_2 (errno 1451)
            if (mysqlError.errno === 1451 || mysqlError.code === 'ER_ROW_IS_REFERENCED_2') {
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
