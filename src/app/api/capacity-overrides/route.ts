import { NextRequest, NextResponse } from 'next/server';
import { getDb, getCapacityOverrides, setCapacityOverride, deleteCapacityOverrides } from '@/lib/db';

// GET /api/capacity-overrides?templateId=X - Get all overrides for a template
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const templateId = searchParams.get('templateId');

        if (!templateId) {
            return NextResponse.json(
                { error: 'templateId is required' },
                { status: 400 }
            );
        }

        const overrides = getCapacityOverrides(parseInt(templateId));

        // Build a full week object with defaults for easier UI consumption
        const db = getDb();
        const template = db.prepare('SELECT capacity FROM shift_templates WHERE id = ?').get(parseInt(templateId)) as { capacity: number } | undefined;
        const defaultCapacity = template?.capacity ?? 0;

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const overrideMap = new Map((overrides as Array<{ dayOfWeek: number; capacity: number }>).map(o => [o.dayOfWeek, o.capacity]));

        const weekCapacities = dayNames.map((name, index) => ({
            dayOfWeek: index,
            dayName: name,
            capacity: overrideMap.get(index) ?? defaultCapacity,
            isOverride: overrideMap.has(index)
        }));

        return NextResponse.json({
            templateId: parseInt(templateId),
            defaultCapacity,
            overrides: weekCapacities
        });
    } catch (error) {
        console.error('Error fetching capacity overrides:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/capacity-overrides - Set capacity override for a specific day
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { templateId, dayOfWeek, capacity } = body;

        if (templateId === undefined || dayOfWeek === undefined || capacity === undefined) {
            return NextResponse.json(
                { error: 'templateId, dayOfWeek, and capacity are required' },
                { status: 400 }
            );
        }

        if (dayOfWeek < 0 || dayOfWeek > 6) {
            return NextResponse.json({ error: 'dayOfWeek must be 0-6' }, { status: 400 });
        }

        if (capacity < 0 || capacity > 20) {
            return NextResponse.json({ error: 'capacity must be 0-20 (0 uses default)' }, { status: 400 });
        }

        setCapacityOverride(templateId, dayOfWeek, capacity);

        return NextResponse.json({
            success: true,
            message: capacity === 0 ? 'Override removed, using default' : 'Capacity override set'
        });
    } catch (error) {
        console.error('Error setting capacity override:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/capacity-overrides?templateId=X - Reset all overrides to default
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const templateId = searchParams.get('templateId');

        if (!templateId) {
            return NextResponse.json(
                { error: 'templateId is required' },
                { status: 400 }
            );
        }

        deleteCapacityOverrides(parseInt(templateId));

        return NextResponse.json({
            success: true,
            message: 'All overrides cleared'
        });
    } catch (error) {
        console.error('Error deleting capacity overrides:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
