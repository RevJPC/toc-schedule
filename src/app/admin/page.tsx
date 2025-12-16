'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Settings, Users, Clock, ChevronLeft, ChevronRight, X, Plus, LogOut, Edit } from 'lucide-react';

interface Market {
    id: number;
    name: string;
}

interface AdminSettings {
    baseScheduleDays: number;
    cancelHoursBefore: number;
    showAvailableSpots: boolean;
    slackWebhookUrl?: string;
}

interface Driver {
    id: number;
    name: string;
    email: string;
    phone?: string;
    market: string;
    priority: number;
    blocked: number;
}

interface ShiftTemplate {
    id: number;
    market: string;
    startTime: string;
    endTime: string;
    capacity: number;
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

interface ShiftWithDrivers {
    id: number;
    startTime: string;
    endTime: string;
    capacity: number;
    scheduled: number;
    available: number;
    drivers: Array<{ id: number; name: string; shiftId: number }>;
}

interface DayCapacity {
    dayOfWeek: number;
    dayName: string;
    capacity: number;
    isOverride: boolean;
}

export default function AdminDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'schedule' | 'templates' | 'settings'>('schedule');
    const [markets, setMarkets] = useState<Market[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
    const [settings, setSettings] = useState<AdminSettings | null>(null);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [loading, setLoading] = useState(true);

    // Schedule view state
    const [weekStart, setWeekStart] = useState(new Date().toISOString().split('T')[0]);
    const [scheduleData, setScheduleData] = useState<Record<string, Record<string, ShiftWithDrivers[]>>>({});

    // Template view state
    const [selectedTemplateMarket, setSelectedTemplateMarket] = useState<string>('');
    const [showAddTemplate, setShowAddTemplate] = useState(false);
    const [newTemplate, setNewTemplate] = useState({ startTime: '10:00', endTime: '14:00', capacity: 2 });

    // Day-of-week capacity editor state
    const [showCapacityEditor, setShowCapacityEditor] = useState(false);
    const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
    const [dayCapacities, setDayCapacities] = useState<DayCapacity[]>([]);
    const [defaultCapacity, setDefaultCapacity] = useState(0);

    // Slack integration state
    const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
    const [slackPosting, setSlackPosting] = useState(false);

    useEffect(() => {
        const isAdmin = sessionStorage.getItem('isAdmin');
        if (!isAdmin) {
            router.push('/');
            return;
        }

        fetchInitialData();
    }, [router]);

    const fetchInitialData = async () => {
        try {
            const [marketsRes, driversRes, templatesRes, settingsRes] = await Promise.all([
                fetch('/api/markets'),
                fetch('/api/drivers'),
                fetch('/api/templates'),
                fetch('/api/settings')
            ]);

            const marketsData = await marketsRes.json();
            const driversData = await driversRes.json();
            const templatesData = await templatesRes.json();
            const settingsData = await settingsRes.json();

            setMarkets(marketsData.markets || []);
            setDrivers(driversData.drivers || []);
            setTemplates(templatesData.templates || []);
            setSettings(settingsData.settings);

            if (marketsData.markets?.length > 0) {
                setSelectedTemplateMarket(marketsData.markets[0].name);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
            showNotification('Failed to load data', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Fetch schedule data when week changes
    useEffect(() => {
        if (markets.length > 0) {
            fetchScheduleData();
        }
    }, [weekStart, markets]);

    const getWeekDates = useCallback((startDate: string) => {
        const dates: string[] = [];
        const start = new Date(startDate);
        start.setDate(start.getDate() - start.getDay()); // Go to Sunday

        for (let i = 0; i < 7; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            dates.push(date.toISOString().split('T')[0]);
        }
        return dates;
    }, []);

    const fetchScheduleData = async () => {
        const weekDates = getWeekDates(weekStart);
        const data: Record<string, Record<string, ShiftWithDrivers[]>> = {};

        try {
            for (const market of markets) {
                data[market.name] = {};
                for (const date of weekDates) {
                    const res = await fetch(`/api/shifts?market=${encodeURIComponent(market.name)}&date=${date}`);
                    const result = await res.json();
                    data[market.name][date] = result.shifts || [];
                }
            }
            setScheduleData(data);
        } catch (error) {
            console.error('Failed to fetch schedule:', error);
        }
    };

    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:${minutes}${ampm}`;
    };

    const goToPreviousWeek = () => {
        const newStart = new Date(weekStart);
        newStart.setDate(newStart.getDate() - 7);
        setWeekStart(newStart.toISOString().split('T')[0]);
    };

    const goToNextWeek = () => {
        const newStart = new Date(weekStart);
        newStart.setDate(newStart.getDate() + 7);
        setWeekStart(newStart.toISOString().split('T')[0]);
    };

    const goToCurrentWeek = () => {
        setWeekStart(new Date().toISOString().split('T')[0]);
    };

    const removeDriverFromShift = async (shiftId: number) => {
        try {
            const res = await fetch(`/api/shifts/${shiftId}`, {
                method: 'DELETE',
                headers: { 'X-Admin-Override': 'true' }
            });

            if (!res.ok) {
                const data = await res.json();
                showNotification(data.error || 'Failed to remove driver', 'error');
                return;
            }

            showNotification('Driver removed', 'success');
            fetchScheduleData();
        } catch (error) {
            console.error('Failed to remove driver:', error);
            showNotification('Failed to remove driver', 'error');
        }
    };

    const updateTemplateCapacity = async (templateId: number, capacity: number) => {
        try {
            const res = await fetch(`/api/templates/${templateId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ capacity })
            });

            if (!res.ok) {
                const data = await res.json();
                showNotification(data.error || 'Failed to update capacity', 'error');
                return;
            }

            showNotification('Capacity updated', 'success');

            // Update local state
            setTemplates(templates.map(t =>
                t.id === templateId ? { ...t, capacity } : t
            ));
        } catch (error) {
            console.error('Failed to update capacity:', error);
            showNotification('Failed to update capacity', 'error');
        }
    };

    const deleteTemplate = async (templateId: number) => {
        try {
            const res = await fetch(`/api/templates/${templateId}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const data = await res.json();
                showNotification(data.error || 'Failed to delete template', 'error');
                return;
            }

            showNotification('Template deleted', 'success');
            setTemplates(templates.filter(t => t.id !== templateId));
        } catch (error) {
            console.error('Failed to delete template:', error);
            showNotification('Failed to delete template', 'error');
        }
    };

    const createTemplate = async () => {
        try {
            const res = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    market: selectedTemplateMarket,
                    startTime: newTemplate.startTime,
                    endTime: newTemplate.endTime,
                    capacity: newTemplate.capacity
                })
            });

            const data = await res.json();

            if (!res.ok) {
                showNotification(data.error || 'Failed to create template', 'error');
                return;
            }

            showNotification('Template created', 'success');
            // Add new template and sort by start time
            const updatedTemplates = [...templates, data.template].sort((a, b) =>
                a.startTime.localeCompare(b.startTime)
            );
            setTemplates(updatedTemplates);
            setShowAddTemplate(false);
            setNewTemplate({ startTime: '10:00', endTime: '14:00', capacity: 2 });
        } catch (error) {
            console.error('Failed to create template:', error);
            showNotification('Failed to create template', 'error');
        }
    };

    // Open capacity editor for a template
    const openCapacityEditor = async (templateId: number) => {
        try {
            const res = await fetch(`/api/capacity-overrides?templateId=${templateId}`);
            const data = await res.json();

            setEditingTemplateId(templateId);
            setDayCapacities(data.overrides);
            setDefaultCapacity(data.defaultCapacity);
            setShowCapacityEditor(true);
        } catch (error) {
            console.error('Failed to load capacity overrides:', error);
            showNotification('Failed to load capacity settings', 'error');
        }
    };

    // Save a single day capacity override
    const saveDayCapacity = async (dayOfWeek: number, capacity: number) => {
        if (!editingTemplateId) return;

        try {
            const res = await fetch('/api/capacity-overrides', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: editingTemplateId,
                    dayOfWeek,
                    capacity: capacity === defaultCapacity ? 0 : capacity
                })
            });

            if (!res.ok) {
                const data = await res.json();
                showNotification(data.error || 'Failed to save', 'error');
                return;
            }

            setDayCapacities(dayCapacities.map(d =>
                d.dayOfWeek === dayOfWeek
                    ? { ...d, capacity, isOverride: capacity !== defaultCapacity }
                    : d
            ));
            showNotification('Capacity saved', 'success');
        } catch (error) {
            console.error('Failed to save capacity:', error);
            showNotification('Failed to save', 'error');
        }
    };

    // Reset all overrides to default
    const resetToDefaults = async () => {
        if (!editingTemplateId) return;

        try {
            await fetch(`/api/capacity-overrides?templateId=${editingTemplateId}`, {
                method: 'DELETE'
            });

            setDayCapacities(dayCapacities.map(d => ({
                ...d,
                capacity: defaultCapacity,
                isOverride: false
            })));
            showNotification('Reset to defaults', 'success');
        } catch (error) {
            console.error('Failed to reset:', error);
            showNotification('Failed to reset', 'error');
        }
    };

    const updateSettings = async (updates: Partial<AdminSettings>) => {
        try {
            const res = await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            const data = await res.json();

            if (!res.ok) {
                showNotification(data.error || 'Failed to update settings', 'error');
                return;
            }

            setSettings(data.settings);
            showNotification('Settings updated', 'success');
        } catch (error) {
            console.error('Failed to update settings:', error);
            showNotification('Failed to update settings', 'error');
        }
    };

    const updateDriverPriority = async (driverId: number, priority: number) => {
        try {
            const res = await fetch(`/api/drivers/${driverId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priority })
            });

            if (!res.ok) {
                const data = await res.json();
                showNotification(data.error || 'Failed to update driver', 'error');
                return;
            }

            setDrivers(drivers.map(d =>
                d.id === driverId ? { ...d, priority } : d
            ));
            showNotification('Priority updated', 'success');
        } catch (error) {
            console.error('Failed to update driver:', error);
            showNotification('Failed to update driver', 'error');
        }
    };

    const toggleDriverBlocked = async (driverId: number, blocked: boolean) => {
        try {
            const res = await fetch(`/api/drivers/${driverId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocked })
            });

            if (!res.ok) {
                const data = await res.json();
                showNotification(data.error || 'Failed to update driver', 'error');
                return;
            }

            setDrivers(drivers.map(d =>
                d.id === driverId ? { ...d, blocked: blocked ? 1 : 0 } : d
            ));
            showNotification(blocked ? 'Driver blocked' : 'Driver unblocked', 'success');
        } catch (error) {
            console.error('Failed to update driver:', error);
            showNotification('Failed to update driver', 'error');
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('isAdmin');
        router.push('/');
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    const weekDates = getWeekDates(weekStart);
    const marketTemplates = templates.filter(t => t.market === selectedTemplateMarket);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-gray-50)', paddingBottom: '2rem' }}>
            {/* Notification */}
            {notification && (
                <div className={`notification notification-${notification.type}`}>
                    {notification.message}
                </div>
            )}

            {/* Add Template Modal */}
            {showAddTemplate && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
                            Add Shift Template - {selectedTemplateMarket}
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label>Start Time</label>
                                <input
                                    type="time"
                                    value={newTemplate.startTime}
                                    onChange={(e) => setNewTemplate({ ...newTemplate, startTime: e.target.value })}
                                />
                            </div>
                            <div>
                                <label>End Time</label>
                                <input
                                    type="time"
                                    value={newTemplate.endTime}
                                    onChange={(e) => setNewTemplate({ ...newTemplate, endTime: e.target.value })}
                                />
                            </div>
                            <div>
                                <label>Capacity (1-20)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={newTemplate.capacity}
                                    onChange={(e) => setNewTemplate({ ...newTemplate, capacity: parseInt(e.target.value) || 1 })}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => setShowAddTemplate(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={createTemplate}>
                                Create Template
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Day-of-Week Capacity Editor Modal */}
            {showCapacityEditor && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '500px' }}>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
                            Edit Capacity by Day of Week
                        </h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-gray-600)', marginBottom: '1.5rem' }}>
                            Default capacity: {defaultCapacity}. Set different values for specific days.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {dayCapacities.map(day => (
                                <div
                                    key={day.dayOfWeek}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.75rem 1rem',
                                        background: day.isOverride ? '#eff6ff' : 'var(--color-gray-50)',
                                        borderRadius: '0.5rem',
                                        border: day.isOverride ? '1px solid #3b82f6' : '1px solid var(--color-gray-200)'
                                    }}
                                >
                                    <span style={{ fontWeight: '500' }}>
                                        {day.dayName}
                                        {day.isOverride && (
                                            <span style={{ fontSize: '0.75rem', color: '#3b82f6', marginLeft: '0.5rem' }}>
                                                (custom)
                                            </span>
                                        )}
                                    </span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="20"
                                        value={day.capacity}
                                        onChange={(e) => {
                                            // Update local state immediately for responsive UI
                                            const val = parseInt(e.target.value) || 0;
                                            setDayCapacities(dayCapacities.map(d =>
                                                d.dayOfWeek === day.dayOfWeek
                                                    ? { ...d, capacity: val }
                                                    : d
                                            ));
                                        }}
                                        onBlur={(e) => {
                                            // Save to API on blur
                                            const val = parseInt(e.target.value) || 0;
                                            if (val >= 0 && val <= 20) {
                                                saveDayCapacity(day.dayOfWeek, val);
                                            }
                                        }}
                                        style={{ width: '70px', minHeight: '38px', textAlign: 'center' }}
                                    />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', marginTop: '1.5rem' }}>
                            <button className="btn btn-secondary" onClick={resetToDefaults}>
                                Reset All to Default
                            </button>
                            <button className="btn btn-primary" onClick={() => setShowCapacityEditor(false)}>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="container" style={{ paddingTop: '1.5rem' }}>
                {/* Header */}
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Admin Dashboard</h1>
                        <button className="btn btn-secondary" onClick={handleLogout}>
                            <LogOut size={18} style={{ marginRight: '0.5rem' }} />
                            Logout
                        </button>
                    </div>
                    <div className="tabs" style={{ marginTop: '1rem' }}>
                        <button
                            className={`tab ${activeTab === 'schedule' ? 'active' : ''}`}
                            onClick={() => setActiveTab('schedule')}
                        >
                            <Calendar size={18} style={{ marginRight: '0.5rem' }} />
                            Schedule
                        </button>
                        <button
                            className={`tab ${activeTab === 'templates' ? 'active' : ''}`}
                            onClick={() => setActiveTab('templates')}
                        >
                            <Clock size={18} style={{ marginRight: '0.5rem' }} />
                            Shift Templates
                        </button>
                        <button
                            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
                            onClick={() => setActiveTab('settings')}
                        >
                            <Settings size={18} style={{ marginRight: '0.5rem' }} />
                            Settings
                        </button>
                    </div>
                </div>

                {/* Schedule Tab */}
                {activeTab === 'schedule' && (
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <h2 style={{ fontSize: '1.125rem', fontWeight: '600' }}>Weekly Schedule</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <button className="btn btn-secondary" onClick={goToPreviousWeek} style={{ padding: '0.5rem' }}>
                                    <ChevronLeft size={20} />
                                </button>
                                <button className="btn btn-secondary" onClick={goToCurrentWeek}>
                                    This Week
                                </button>
                                <span style={{ fontWeight: '500' }}>
                                    {new Date(weekDates[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {' - '}
                                    {new Date(weekDates[6] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                <button className="btn btn-secondary" onClick={goToNextWeek} style={{ padding: '0.5rem' }}>
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>

                        {markets.map(market => {
                            const marketTemplatesForView = templates.filter(t => t.market === market.name);

                            return (
                                <div key={market.id} style={{ marginBottom: '2rem' }}>
                                    <h3 style={{ fontWeight: '500', padding: '0.75rem', background: 'var(--color-gray-100)', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                                        {market.name}
                                    </h3>

                                    {marketTemplatesForView.length > 0 && (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th style={{ minWidth: '140px' }}>Shift Time</th>
                                                        {weekDates.map(date => {
                                                            const dateObj = new Date(date + 'T00:00:00');
                                                            return (
                                                                <th key={date} style={{ textAlign: 'center', minWidth: '140px' }}>
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
                                                    {marketTemplatesForView.map(template => (
                                                        <tr key={template.id}>
                                                            <td style={{ fontWeight: '500', background: 'var(--color-gray-50)' }}>
                                                                {formatTime(template.startTime)} - {formatTime(template.endTime)}
                                                            </td>
                                                            {weekDates.map(date => {
                                                                const shifts = scheduleData[market.name]?.[date] || [];
                                                                const shift = shifts.find(s => s.startTime === template.startTime && s.endTime === template.endTime);

                                                                return (
                                                                    <td key={date} style={{ verticalAlign: 'top' }}>
                                                                        {shift && (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                                <div style={{
                                                                                    fontSize: '0.75rem',
                                                                                    fontWeight: '500',
                                                                                    color: shift.available > 0 ? 'var(--color-success)' : 'var(--color-error)'
                                                                                }}>
                                                                                    {shift.scheduled}/{shift.capacity}
                                                                                </div>
                                                                                {shift.drivers.map(driver => (
                                                                                    <div
                                                                                        key={driver.shiftId}
                                                                                        style={{
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            justifyContent: 'space-between',
                                                                                            fontSize: '0.75rem',
                                                                                            background: '#dbeafe',
                                                                                            padding: '0.25rem 0.5rem',
                                                                                            borderRadius: '0.25rem'
                                                                                        }}
                                                                                    >
                                                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                            {driver.name}
                                                                                        </span>
                                                                                        <button
                                                                                            onClick={() => removeDriverFromShift(driver.shiftId)}
                                                                                            style={{
                                                                                                background: 'none',
                                                                                                border: 'none',
                                                                                                color: 'var(--color-error)',
                                                                                                cursor: 'pointer',
                                                                                                padding: '2px'
                                                                                            }}
                                                                                        >
                                                                                            <X size={14} />
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
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
                            );
                        })}
                    </div>
                )}

                {/* Templates Tab */}
                {activeTab === 'templates' && (
                    <div className="card">
                        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>Shift Templates</h2>

                        <select
                            value={selectedTemplateMarket}
                            onChange={(e) => setSelectedTemplateMarket(e.target.value)}
                            style={{ marginBottom: '1.5rem', maxWidth: '300px' }}
                        >
                            {markets.map(m => (
                                <option key={m.id} value={m.name}>{m.name}</option>
                            ))}
                        </select>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {marketTemplates.map(template => (
                                <div
                                    key={template.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '1rem',
                                        border: '1px solid var(--color-gray-200)',
                                        borderRadius: '0.5rem',
                                        flexWrap: 'wrap',
                                        gap: '1rem'
                                    }}
                                >
                                    <p style={{ fontWeight: '500' }}>
                                        {formatTime(template.startTime)} - {formatTime(template.endTime)}
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <label style={{ margin: 0, fontSize: '0.875rem' }}>Default:</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="20"
                                                value={template.capacity}
                                                onChange={(e) => {
                                                    const newCapacity = parseInt(e.target.value);
                                                    if (newCapacity >= 1 && newCapacity <= 20) {
                                                        updateTemplateCapacity(template.id, newCapacity);
                                                    }
                                                }}
                                                style={{ width: '70px', minHeight: '38px' }}
                                            />
                                        </div>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => openCapacityEditor(template.id)}
                                            style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}
                                        >
                                            <Edit size={14} style={{ marginRight: '0.25rem' }} />
                                            Days
                                        </button>
                                        <button
                                            className="btn btn-danger"
                                            onClick={() => deleteTemplate(template.id)}
                                            style={{ padding: '0.5rem' }}
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            className="btn btn-primary"
                            onClick={() => setShowAddTemplate(true)}
                            style={{ marginTop: '1.5rem' }}
                        >
                            <Plus size={18} style={{ marginRight: '0.5rem' }} />
                            Add New Shift Template
                        </button>
                    </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && settings && (
                    <div className="card">
                        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1.5rem' }}>System Settings</h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '400px' }}>
                            <div>
                                <label>Base Scheduling Days (all drivers)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    value={settings.baseScheduleDays}
                                    onChange={(e) => updateSettings({ baseScheduleDays: parseInt(e.target.value) })}
                                />
                                <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '0.25rem' }}>
                                    Priority drivers get bonus days on top of this
                                </p>
                            </div>

                            <div>
                                <label>Minimum Cancellation Hours</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="72"
                                    value={settings.cancelHoursBefore}
                                    onChange={(e) => updateSettings({ cancelHoursBefore: parseInt(e.target.value) })}
                                />
                                <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '0.25rem' }}>
                                    Drivers must cancel this many hours before shift
                                </p>
                            </div>

                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={settings.showAvailableSpots}
                                        onChange={(e) => updateSettings({ showAvailableSpots: e.target.checked })}
                                        style={{ width: 'auto', minHeight: 'auto' }}
                                    />
                                    Show available spots to drivers
                                </label>
                            </div>
                        </div>

                        {/* Slack Integration Section */}
                        <div style={{ borderTop: '1px solid var(--color-gray-200)', marginTop: '2rem', paddingTop: '2rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                📢 Slack Integration
                            </h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '500px' }}>
                                <div>
                                    <label>Slack Webhook URL</label>
                                    <input
                                        type="url"
                                        placeholder="https://hooks.slack.com/services/..."
                                        value={slackWebhookUrl || settings.slackWebhookUrl || ''}
                                        onChange={(e) => setSlackWebhookUrl(e.target.value)}
                                        onBlur={(e) => {
                                            if (e.target.value !== settings.slackWebhookUrl) {
                                                updateSettings({ slackWebhookUrl: e.target.value });
                                            }
                                        }}
                                    />
                                    <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '0.25rem' }}>
                                        Create an incoming webhook in your Slack workspace settings
                                    </p>
                                </div>

                                <div style={{ background: 'var(--color-gray-100)', padding: '1rem', borderRadius: '0.5rem' }}>
                                    <p style={{ fontWeight: '500', marginBottom: '0.75rem' }}>Post Today&apos;s Schedule</p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-600)', marginBottom: '1rem' }}>
                                        Posts the schedule for today ({new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}) to Slack.
                                        <br />
                                        <strong>Auto-post:</strong> This will automatically post at 8:00 AM daily when deployed.
                                    </p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={async () => {
                                            if (!settings.slackWebhookUrl && !slackWebhookUrl) {
                                                showNotification('Please enter a Slack webhook URL first', 'error');
                                                return;
                                            }
                                            setSlackPosting(true);
                                            try {
                                                const res = await fetch('/api/slack/post-schedule', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({})
                                                });
                                                const data = await res.json();
                                                if (!res.ok) {
                                                    showNotification(data.error || 'Failed to post to Slack', 'error');
                                                } else {
                                                    showNotification('Today\'s schedule posted to Slack!', 'success');
                                                }
                                            } catch (error) {
                                                showNotification('Failed to post to Slack', 'error');
                                            } finally {
                                                setSlackPosting(false);
                                            }
                                        }}
                                        disabled={slackPosting}
                                        style={{ width: '100%' }}
                                    >
                                        {slackPosting ? 'Posting...' : '📢 Post Today\'s Schedule to Slack'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--color-gray-200)', marginTop: '2rem', paddingTop: '2rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Users size={18} />
                                Driver Management
                            </h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {drivers.map(driver => (
                                    <div
                                        key={driver.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '1rem',
                                            border: '1px solid var(--color-gray-200)',
                                            borderRadius: '0.5rem',
                                            flexWrap: 'wrap',
                                            gap: '1rem'
                                        }}
                                    >
                                        <div>
                                            <p style={{ fontWeight: '500' }}>{driver.name}</p>
                                            <p style={{ fontSize: '0.875rem', color: 'var(--color-gray-600)' }}>
                                                {driver.market} • {driver.email}
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <select
                                                value={driver.priority}
                                                onChange={(e) => updateDriverPriority(driver.id, parseInt(e.target.value))}
                                                style={{ width: '120px' }}
                                            >
                                                <option value="1">Priority 1</option>
                                                <option value="2">Priority 2</option>
                                                <option value="3">Priority 3</option>
                                                <option value="4">Priority 4</option>
                                                <option value="5">Priority 5</option>
                                            </select>
                                            <button
                                                className={`btn ${driver.blocked ? 'btn-danger' : 'btn-secondary'}`}
                                                onClick={() => toggleDriverBlocked(driver.id, !driver.blocked)}
                                            >
                                                {driver.blocked ? 'Blocked' : 'Active'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
