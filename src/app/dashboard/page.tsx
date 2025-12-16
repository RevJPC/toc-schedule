'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Clock, X, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';

interface Driver {
    id: number;
    name: string;
    email: string;
    market: string;
    priority: 1 | 2 | 3 | 4 | 5;
    blocked: boolean;
}

interface Market {
    id: number;
    name: string;
}

interface Settings {
    baseScheduleDays: number;
    cancelHoursBefore: number;
    showAvailableSpots: boolean;
}

interface Shift {
    id: number;
    market: string;
    startTime: string;
    endTime: string;
    capacity: number;
    scheduled: number;
    available: number;
    drivers: Array<{ id: number; name: string; shiftId: number }>;
}

interface ScheduledShift {
    id: number;
    driverId: number;
    driverName: string;
    market: string;
    date: string;
    startTime: string;
    endTime: string;
}

export default function DriverDashboard() {
    const router = useRouter();
    const [driver, setDriver] = useState<Driver | null>(null);
    const [markets, setMarkets] = useState<Market[]>([]);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [selectedMarket, setSelectedMarket] = useState<string>('');
    const [myShifts, setMyShifts] = useState<ScheduledShift[]>([]);
    const [availableShifts, setAvailableShifts] = useState<Record<string, Shift[]>>({});
    const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
    const [weekOffset, setWeekOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [showMarketConfirm, setShowMarketConfirm] = useState(false);
    const [pendingMarket, setPendingMarket] = useState('');

    // Calculate scheduling window based on priority
    const getSchedulingWindow = useCallback((priority: number) => {
        if (!settings) return 7;
        const bonus = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };
        return settings.baseScheduleDays + (bonus[priority as keyof typeof bonus] || 0);
    }, [settings]);

    // Generate dates for scheduling window
    const generateDates = useCallback((days: number) => {
        const dates: string[] = [];
        const today = new Date();
        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            dates.push(date.toISOString().split('T')[0]);
        }
        return dates;
    }, []);

    // Get week dates for weekly view
    const getWeekDates = useCallback((offset: number, allDates: string[]) => {
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
    }, []);

    useEffect(() => {
        const driverId = sessionStorage.getItem('driverId');
        if (!driverId) {
            router.push('/');
            return;
        }

        fetchInitialData(parseInt(driverId));
    }, [router]);

    const fetchInitialData = async (driverId: number) => {
        try {
            const [driverRes, marketsRes, settingsRes] = await Promise.all([
                fetch(`/api/drivers/${driverId}`),
                fetch('/api/markets'),
                fetch('/api/settings')
            ]);

            const driverData = await driverRes.json();
            const marketsData = await marketsRes.json();
            const settingsData = await settingsRes.json();

            if (!driverData.driver) {
                router.push('/');
                return;
            }

            setDriver(driverData.driver);
            setMarkets(marketsData.markets || []);
            setSettings(settingsData.settings);
            setSelectedMarket(driverData.driver.market);

            // Fetch driver's shifts
            const shiftsRes = await fetch(`/api/schedules?driverId=${driverId}`);
            const shiftsData = await shiftsRes.json();
            setMyShifts(shiftsData.shifts || []);
        } catch (error) {
            console.error('Failed to fetch data:', error);
            showNotification('Failed to load data', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Fetch available shifts when market or dates change
    useEffect(() => {
        if (!driver || !selectedMarket || !settings) return;

        const dates = generateDates(getSchedulingWindow(driver.priority));
        fetchAvailableShifts(selectedMarket, dates);
    }, [driver, selectedMarket, settings, generateDates, getSchedulingWindow]);

    const fetchAvailableShifts = async (market: string, dates: string[]) => {
        try {
            const shiftsByDate: Record<string, Shift[]> = {};

            // Fetch in parallel (batch for performance)
            const promises = dates.map(async (date) => {
                const res = await fetch(`/api/shifts?market=${encodeURIComponent(market)}&date=${date}`);
                const data = await res.json();
                return { date, shifts: data.shifts || [] };
            });

            const results = await Promise.all(promises);
            results.forEach(({ date, shifts }) => {
                shiftsByDate[date] = shifts;
            });

            setAvailableShifts(shiftsByDate);
        } catch (error) {
            console.error('Failed to fetch shifts:', error);
        }
    };

    const handleMarketChange = (newMarket: string) => {
        if (newMarket === driver?.market) {
            setSelectedMarket(newMarket);
        } else {
            setPendingMarket(newMarket);
            setShowMarketConfirm(true);
        }
    };

    const confirmMarketSwitch = () => {
        setSelectedMarket(pendingMarket);
        setShowMarketConfirm(false);
        showNotification(`Switched to ${pendingMarket}`, 'success');
    };

    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const canClaimShift = (date: string, startTime: string, endTime: string): { allowed: boolean; reason?: string } => {
        // Check for overlapping shifts on same day (any market)
        const dayShifts = myShifts.filter(s => s.date === date);
        for (const shift of dayShifts) {
            if (checkTimeOverlap(startTime, endTime, shift.startTime, shift.endTime)) {
                return { allowed: false, reason: 'Overlaps with existing shift' };
            }
        }

        return { allowed: true };
    };

    const checkTimeOverlap = (start1: string, end1: string, start2: string, end2: string): boolean => {
        const toMinutes = (time: string) => {
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
        };
        const s1 = toMinutes(start1);
        const e1 = toMinutes(end1);
        const s2 = toMinutes(start2);
        const e2 = toMinutes(end2);
        return s1 < e2 && e1 > s2;
    };

    const claimShift = async (templateId: number, date: string) => {
        if (!driver) return;

        try {
            const res = await fetch('/api/shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driverId: driver.id,
                    templateId,
                    date
                })
            });

            const data = await res.json();

            if (!res.ok) {
                showNotification(data.error || 'Failed to claim shift', 'error');
                return;
            }

            showNotification('Shift claimed successfully!', 'success');

            // Refresh shifts
            const shiftsRes = await fetch(`/api/schedules?driverId=${driver.id}`);
            const shiftsData = await shiftsRes.json();
            setMyShifts(shiftsData.shifts || []);

            // Refresh available shifts
            const dates = generateDates(getSchedulingWindow(driver.priority));
            fetchAvailableShifts(selectedMarket, dates);
        } catch (error) {
            console.error('Failed to claim shift:', error);
            showNotification('Failed to claim shift', 'error');
        }
    };

    const cancelShift = async (shiftId: number) => {
        try {
            const res = await fetch(`/api/shifts/${shiftId}`, {
                method: 'DELETE'
            });

            const data = await res.json();

            if (!res.ok) {
                showNotification(data.error || 'Failed to cancel shift', 'error');
                return;
            }

            showNotification('Shift cancelled', 'success');
            setMyShifts(myShifts.filter(s => s.id !== shiftId));

            // Refresh available shifts
            if (driver) {
                const dates = generateDates(getSchedulingWindow(driver.priority));
                fetchAvailableShifts(selectedMarket, dates);
            }
        } catch (error) {
            console.error('Failed to cancel shift:', error);
            showNotification('Failed to cancel shift', 'error');
        }
    };

    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:${minutes}${ampm}`;
    };

    const handleLogout = () => {
        sessionStorage.removeItem('driverId');
        router.push('/');
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    if (!driver) return null;

    const allDates = generateDates(getSchedulingWindow(driver.priority));
    const weekDates = getWeekDates(weekOffset, allDates);
    const canGoNextWeek = getWeekDates(weekOffset + 1, allDates).length > 0;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-gray-50)', paddingBottom: '2rem' }}>
            {/* Notification */}
            {notification && (
                <div className={`notification notification-${notification.type}`}>
                    {notification.message}
                </div>
            )}

            {/* Market Switch Confirmation Modal */}
            {showMarketConfirm && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
                            Confirm Market Switch
                        </h3>
                        <p style={{ color: 'var(--color-gray-600)', marginBottom: '1.5rem' }}>
                            Are you sure you want to switch to {pendingMarket}? You usually work in {driver.market}.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowMarketConfirm(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={confirmMarketSwitch}
                            >
                                Switch Market
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="container" style={{ paddingTop: '1.5rem' }}>
                {/* Header */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                Welcome, {driver.name}
                            </h1>
                            <p style={{ color: 'var(--color-gray-600)', fontSize: '0.875rem' }}>
                                Priority {driver.priority} • Can schedule {getSchedulingWindow(driver.priority)} days ahead
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                                value={selectedMarket}
                                onChange={(e) => handleMarketChange(e.target.value)}
                                style={{ minWidth: '150px' }}
                            >
                                {markets.map(m => (
                                    <option key={m.id} value={m.name}>{m.name}</option>
                                ))}
                            </select>
                            <button className="btn btn-secondary" onClick={handleLogout}>
                                <LogOut size={18} style={{ marginRight: '0.5rem' }} />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>

                {/* My Schedule */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar size={20} />
                        My Schedule
                    </h2>
                    {myShifts.length === 0 ? (
                        <p style={{ color: 'var(--color-gray-500)' }}>No shifts scheduled</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {myShifts.map(shift => (
                                <div
                                    key={shift.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '1rem',
                                        border: '1px solid var(--color-gray-200)',
                                        borderRadius: '0.5rem'
                                    }}
                                >
                                    <div>
                                        <p style={{ fontWeight: '500' }}>{shift.market}</p>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--color-gray-600)' }}>
                                            {new Date(shift.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                            {' • '}
                                            {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                                        </p>
                                    </div>
                                    <button
                                        className="btn btn-danger"
                                        onClick={() => cancelShift(shift.id)}
                                        style={{ padding: '0.5rem' }}
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Available Shifts */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={20} />
                            Available Shifts - {selectedMarket}
                        </h2>
                        <div className="tabs">
                            <button
                                className={`tab ${viewMode === 'daily' ? 'active' : ''}`}
                                onClick={() => setViewMode('daily')}
                            >
                                Daily
                            </button>
                            <button
                                className={`tab ${viewMode === 'weekly' ? 'active' : ''}`}
                                onClick={() => setViewMode('weekly')}
                            >
                                Weekly
                            </button>
                        </div>
                    </div>

                    {viewMode === 'daily' ? (
                        // Daily View
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {allDates.map(date => {
                                const shifts = availableShifts[date] || [];
                                const dateObj = new Date(date + 'T00:00:00');

                                return (
                                    <div key={date} style={{ borderBottom: '1px solid var(--color-gray-200)', paddingBottom: '1rem' }}>
                                        <h3 style={{ fontWeight: '500', marginBottom: '0.75rem' }}>
                                            {dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {shifts.map(shift => {
                                                const check = canClaimShift(date, shift.startTime, shift.endTime);
                                                const isFull = shift.available === 0;
                                                const isDisabled = !check.allowed || isFull;

                                                return (
                                                    <div
                                                        key={shift.id}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '0.75rem 1rem',
                                                            borderRadius: '0.5rem',
                                                            border: `1px solid ${isDisabled ? 'var(--color-gray-200)' : 'var(--color-gray-300)'}`,
                                                            background: isDisabled ? 'var(--color-gray-50)' : 'white'
                                                        }}
                                                    >
                                                        <div>
                                                            <p style={{ fontWeight: '500', color: isDisabled ? 'var(--color-gray-400)' : 'inherit' }}>
                                                                {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                                                            </p>
                                                            {settings?.showAvailableSpots && (
                                                                <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                                                                    {shift.available} spots available
                                                                </p>
                                                            )}
                                                            {!check.allowed && !isFull && (
                                                                <p style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>{check.reason}</p>
                                                            )}
                                                        </div>
                                                        <button
                                                            className={`btn ${isDisabled ? 'btn-secondary' : 'btn-primary'}`}
                                                            onClick={() => claimShift(shift.id, date)}
                                                            disabled={isDisabled}
                                                        >
                                                            {isFull ? 'Full' : 'Claim'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // Weekly View
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setWeekOffset(weekOffset - 1)}
                                    disabled={weekOffset === 0}
                                    style={{ padding: '0.5rem' }}
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <span style={{ fontWeight: '500' }}>
                                    {weekDates.length > 0 && (
                                        <>
                                            {new Date(weekDates[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            {' - '}
                                            {new Date(weekDates[weekDates.length - 1] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </>
                                    )}
                                </span>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setWeekOffset(weekOffset + 1)}
                                    disabled={!canGoNextWeek}
                                    style={{ padding: '0.5rem' }}
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>

                            {weekDates.length === 0 ? (
                                <p style={{ textAlign: 'center', color: 'var(--color-gray-500)', padding: '2rem' }}>
                                    No dates available in this week
                                </p>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th style={{ position: 'sticky', left: 0, background: 'var(--color-gray-100)', zIndex: 1 }}>
                                                    Shift Time
                                                </th>
                                                {weekDates.map(date => {
                                                    const dateObj = new Date(date + 'T00:00:00');
                                                    return (
                                                        <th key={date} style={{ textAlign: 'center', minWidth: '120px' }}>
                                                            <div>{dateObj.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-600)', fontWeight: 'normal' }}>
                                                                {dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                                                            </div>
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Get unique shifts from first available date */}
                                            {Object.values(availableShifts)[0]?.map(templateShift => (
                                                <tr key={templateShift.id}>
                                                    <td style={{ fontWeight: '500', position: 'sticky', left: 0, background: 'var(--color-gray-50)', zIndex: 1 }}>
                                                        {formatTime(templateShift.startTime)} - {formatTime(templateShift.endTime)}
                                                    </td>
                                                    {weekDates.map(date => {
                                                        const shifts = availableShifts[date] || [];
                                                        const shift = shifts.find(s => s.startTime === templateShift.startTime && s.endTime === templateShift.endTime);

                                                        if (!shift) {
                                                            return <td key={date} style={{ background: 'var(--color-gray-50)' }}></td>;
                                                        }

                                                        const check = canClaimShift(date, shift.startTime, shift.endTime);
                                                        const isFull = shift.available === 0;
                                                        const isDisabled = !check.allowed || isFull;

                                                        return (
                                                            <td key={date} style={{ textAlign: 'center', verticalAlign: 'top', background: isDisabled ? 'var(--color-gray-50)' : 'white' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                                    {settings?.showAvailableSpots && (
                                                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                                                                            {shift.available} spots
                                                                        </span>
                                                                    )}
                                                                    <button
                                                                        className={`btn ${isDisabled ? 'btn-secondary' : 'btn-primary'}`}
                                                                        onClick={() => claimShift(shift.id, date)}
                                                                        disabled={isDisabled}
                                                                        style={{ width: '100%', padding: '0.25rem 0.5rem', fontSize: '0.75rem', minHeight: '36px' }}
                                                                    >
                                                                        {isFull ? 'Full' : 'Claim'}
                                                                    </button>
                                                                    {!check.allowed && !isFull && (
                                                                        <span style={{ fontSize: '0.625rem', color: 'var(--color-error)', textAlign: 'center' }}>
                                                                            {check.reason}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
