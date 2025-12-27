import { NextRequest, NextResponse } from 'next/server';
import { getScheduledShifts, getScheduleSettings, getShiftTemplates, getMarkets } from '@/lib/db';

interface SlackBlock {
    type: string;
    text?: { type: string; text: string; emoji?: boolean };
    elements?: Array<{ type: string; text: string; emoji?: boolean }>;
}

// POST /api/slack/post-schedule - Post today's schedule to Slack
export async function POST(request: NextRequest) {
    try {
        // Get optional market filter from body (if provided)
        let market: string | null = null;
        try {
            const body = await request.json();
            market = body.market || null;
        } catch {
            // No body is fine, will post all markets
        }

        // Get the webhook URL from settings
        const settings = getScheduleSettings() as { slack_webhook_url?: string } | undefined;
        const webhookUrl = settings?.slack_webhook_url;

        if (!webhookUrl) {
            return NextResponse.json(
                { error: 'Slack webhook URL not configured. Go to Settings to add it.' },
                { status: 400 }
            );
        }

        // Get today's date
        const today = new Date().toISOString().split('T')[0];
        const todayFormatted = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        // Get markets to post (all if not specified)
        const markets = market
            ? [{ name: market }]
            : (getMarkets() as Array<{ name: string }>);

        // Build Slack message blocks
        const blocks: SlackBlock[] = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `📅 Today's Driver Schedule - ${todayFormatted}`,
                    emoji: true
                }
            }
        ];

        let hasAnyScheduled = false;

        for (const m of markets) {
            const scheduled = getScheduledShifts({ market: m.name, date: today }) as Array<{
                driverName: string;
                startTime: string;
                endTime: string;
            }>;

            if (scheduled.length === 0) continue;
            hasAnyScheduled = true;

            // Group by shift time
            const shiftGroups: Record<string, string[]> = {};
            for (const shift of scheduled) {
                const key = `${formatTime(shift.startTime)} - ${formatTime(shift.endTime)}`;
                if (!shiftGroups[key]) shiftGroups[key] = [];
                shiftGroups[key].push(shift.driverName);
            }

            let marketText = `*🏪 ${m.name}*\n`;
            for (const [time, drivers] of Object.entries(shiftGroups)) {
                marketText += `  ${time}: ${drivers.join(', ')}\n`;
            }

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: marketText
                }
            });
        }

        if (!hasAnyScheduled) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '_No drivers scheduled for today._'
                }
            });
        }

        // Add footer
        blocks.push({ type: 'divider' });
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `Posted from TOC Driver Schedule`
                }
            ]
        });

        // Send to Slack
        const slackResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocks })
        });

        if (!slackResponse.ok) {
            const errorText = await slackResponse.text();
            console.error('Slack webhook error:', errorText);
            return NextResponse.json(
                { error: 'Failed to post to Slack. Check your webhook URL.' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Schedule posted to Slack successfully'
        });
    } catch (error) {
        console.error('Error posting to Slack:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET endpoint for cron jobs to trigger auto-post
export async function GET(request: NextRequest) {
    // Verify cron secret for security (optional but recommended)
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    // You can set CRON_SECRET in environment variables for security
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && secret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call the POST handler
    return POST(request);
}

function formatTime(time: string): string {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes}${ampm}`;
}
