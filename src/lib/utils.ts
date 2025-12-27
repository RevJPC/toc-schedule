// Shared utility functions for the TOC Schedule application

/**
 * Formats a 24-hour time string to 12-hour format with AM/PM
 * @param time - Time string in HH:MM format
 * @returns Formatted time string (e.g., "9:00AM" or "5:30PM")
 */
export function formatTime(time: string): string {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes}${ampm}`;
}

/**
 * Formats a 24-hour time string to 12-hour format with space before AM/PM
 * @param time - Time string in HH:MM format
 * @returns Formatted time string (e.g., "9:00 AM" or "5:30 PM")
 */
export function formatTimeWithSpace(time: string): string {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

/**
 * Generates an array of date strings for a given number of days starting from today
 * @param days - Number of days to generate
 * @returns Array of date strings in YYYY-MM-DD format
 */
export function generateDates(days: number): string[] {
    const dates: string[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
}

/**
 * Gets the dates for a week starting from a given offset
 * @param offset - Week offset (0 = current week, 1 = next week, -1 = previous week)
 * @param allDates - Array of all available dates to filter from
 * @returns Array of date strings for the week
 */
export function getWeekDates(offset: number, allDates: string[]): string[] {
    const result: string[] = [];
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + (offset * 7));

    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        if (allDates.includes(dateStr)) {
            result.push(dateStr);
        }
    }
    return result;
}

/**
 * Converts a time string to minutes since midnight
 * @param time - Time string in HH:MM format
 * @returns Number of minutes since midnight
 */
export function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Checks if two time ranges overlap (handles overnight shifts)
 * @param start1 - Start time of first range
 * @param end1 - End time of first range
 * @param start2 - Start time of second range
 * @param end2 - End time of second range
 * @returns True if the time ranges overlap
 */
export function checkTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const toMinutes = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };
    const s1 = toMinutes(start1);
    let e1 = toMinutes(end1);
    const s2 = toMinutes(start2);
    let e2 = toMinutes(end2);

    if (e1 < s1) e1 += 1440;
    if (e2 < s2) e2 += 1440;

    return s1 < e2 && e1 > s2;
}
