// Core types for the Driver Scheduling System

export interface Driver {
    id: number;
    name: string;
    email: string;
    phone?: string;
    market: string;
    priority: 1 | 2 | 3 | 4 | 5;
    blocked: boolean;
    createdAt?: string;
}

export interface Market {
    id: number;
    name: string;
    market: string; // 3-letter code
    active: boolean;
}

export interface ShiftTemplate {
    id: number;
    market: string; // Market code from the database
    startTime: string; // "HH:MM" format
    endTime: string;   // "HH:MM" format
    capacity: number;
}

export interface ScheduledShift {
    id: number;
    driverId: number;
    driverName?: string; // Joined from drivers table
    templateId: number;
    market?: string;
    date: string; // "YYYY-MM-DD" format
    startTime: string;
    endTime: string;
    createdAt: string;
}

export interface AdminSettings {
    id: number;
    baseScheduleDays: number;
    cancelHoursBefore: number;
    showAvailableSpots: boolean;
    slackWebhookUrl?: string;
}

// Settings interface for client-side usage
export interface Settings {
    baseScheduleDays: number;
    cancelHoursBefore: number;
    showAvailableSpots: boolean;
    slackWebhookUrl?: string;
}

// Shift interface with availability info
export interface Shift {
    id: number;
    market: string;
    startTime: string;
    endTime: string;
    capacity: number;
    scheduled: number;
    available: number;
    drivers: Array<{ id: number; name: string; shiftId: number }>;
}

// Template interface for admin
export interface Template {
    id: number;
    market: string;
    startTime: string;
    endTime: string;
    capacity: number;
}

// Shift with drivers for admin schedule view
export interface ShiftWithDrivers {
    id: number;
    startTime: string;
    endTime: string;
    capacity: number;
    scheduled: number;
    available: number;
    drivers: { shiftId: number; name: string }[];
}

// API Response types
export interface ShiftWithAvailability extends ShiftTemplate {
    scheduled: number;
    available: number;
    drivers: Array<{
        id: number;
        name: string;
        shiftId: number;
    }>;
}

export interface ClaimResult {
    success: boolean;
    message: string;
    shift?: ScheduledShift;
}

// User session types
export interface User {
    id: number;
    name: string;
    email: string;
    role: 'driver' | 'admin';
    market?: string;
    priority?: 1 | 2 | 3 | 4 | 5;
}

// Database row types (for internal use)
export interface DbDriver {
    did: number;
    displayName?: string;
    Owner_fname: string;
    Owner_lname: string;
    email: string;
    phone?: string;
    market: string;
    schedule_priority: 1 | 2 | 3 | 4 | 5;
    status: number; // 1 = active, 0 = blocked
}

export interface DbMarket {
    id: number;
    market: string;
    defaultcity: string;
    status: number; // 1 = active, 0 = inactive
}

export interface DbShiftTemplate {
    id: number;
    market: string;
    start_time: string;
    end_time: string;
    capacity: number;
}

export interface DbScheduleSettings {
    id: number;
    base_schedule_days: number;
    cancel_hours_before: number;
    show_available_spots: number; // 1 or 0
    slack_webhook_url?: string;
}

// MySQL error type
export interface MySQLError extends Error {
    code?: string;
    errno?: number;
    sqlState?: string;
    sqlMessage?: string;
}
