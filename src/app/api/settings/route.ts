import { NextRequest, NextResponse } from 'next/server';
import { getAdminSettings, updateAdminSettings } from '@/lib/db';

// GET /api/settings - Get admin settings
export async function GET() {
    try {
        const settings = getAdminSettings() as {
            id: number;
            base_schedule_days: number;
            cancel_hours_before: number;
            show_available_spots: number;
            slack_webhook_url: string | null;
        };

        // Convert to camelCase for frontend
        return NextResponse.json({
            settings: {
                baseScheduleDays: settings.base_schedule_days,
                cancelHoursBefore: settings.cancel_hours_before,
                showAvailableSpots: settings.show_available_spots === 1,
                slackWebhookUrl: settings.slack_webhook_url
            }
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/settings - Update admin settings
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { baseScheduleDays, cancelHoursBefore, showAvailableSpots, slackWebhookUrl } = body;

        // Validate inputs
        if (baseScheduleDays !== undefined && (baseScheduleDays < 1 || baseScheduleDays > 30)) {
            return NextResponse.json({ error: 'baseScheduleDays must be 1-30' }, { status: 400 });
        }

        if (cancelHoursBefore !== undefined && (cancelHoursBefore < 1 || cancelHoursBefore > 72)) {
            return NextResponse.json({ error: 'cancelHoursBefore must be 1-72' }, { status: 400 });
        }

        updateAdminSettings({
            baseScheduleDays,
            cancelHoursBefore,
            showAvailableSpots,
            slackWebhookUrl
        });

        const settings = getAdminSettings() as {
            base_schedule_days: number;
            cancel_hours_before: number;
            show_available_spots: number;
            slack_webhook_url: string | null;
        };

        return NextResponse.json({
            success: true,
            settings: {
                baseScheduleDays: settings.base_schedule_days,
                cancelHoursBefore: settings.cancel_hours_before,
                showAvailableSpots: settings.show_available_spots === 1,
                slackWebhookUrl: settings.slack_webhook_url
            }
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
