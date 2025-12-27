'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Settings as SettingsIcon, Users, Clock, ChevronLeft, ChevronRight, X, Plus, LogOut, Edit } from 'lucide-react';
import type { Market, Driver, Template, ShiftWithDrivers, Settings } from '@/types';
import { formatTimeWithSpace } from '@/lib/utils';

export default function AdminDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('schedule');
    const [markets, setMarkets] = useState<Market[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [settings, setSettings] = useState<Settings>({ baseScheduleDays: 7, cancelHoursBefore: 24, showAvailableSpots: true });
    const [loading, setLoading] = useState(true);
    const [selectedTemplateMarket, setSelectedTemplateMarket] = useState('');
    const [scheduleData, setScheduleData] = useState<Record<string, Record<string, ShiftWithDrivers[]>>>({});
    const [weekStart, setWeekStart] = useState(new Date().toISOString().split('T')[0]);
    const [showAddTemplate, setShowAddTemplate] = useState(false);
    const [newTemplate, setNewTemplate] = useState({ startTime: '09:00', endTime: '17:00', capacity: 1 });
    const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
    const [slackPosting, setSlackPosting] = useState(false);

    const getWeekDates = (startDateStr: string) => {
        const start = new Date(startDateStr);
        // Adjust to Monday if needed
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(start.setDate(diff));

        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        return dates;
    };

    const formatTime = formatTimeWithSpace;

    const goToPreviousWeek = () => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() - 7);
        setWeekStart(d.toISOString().split('T')[0]);
    };

    const goToNextWeek = () => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + 7);
        setWeekStart(d.toISOString().split('T')[0]);
    };

    const goToCurrentWeek = () => {
        setWeekStart(new Date().toISOString().split('T')[0]);
    };

    const showNotification = (message: string, type: 'success' | 'error') => {
        // Simple alert for now, or could implement a toast
        alert(message);
    };

    const fetchInitialData = async () => {
        try {
            const [marketsRes, driversRes, templatesRes, settingsRes] = await Promise.all([
                fetch('/api/markets?includeInactive=true', { cache: 'no-store' }),
                fetch('/api/drivers', { cache: 'no-store' }),
                fetch('/api/templates', { cache: 'no-store' }),
                fetch('/api/settings', { cache: 'no-store' })
            ]);

            const marketsData = await marketsRes.json();
            const driversData = await driversRes.json();
            const templatesData = await templatesRes.json();
            const settingsData = await settingsRes.json();

            const mappedMarkets = (marketsData.markets || []).map((m: any) => ({
                id: m.id,
                name: m.name,
                market: m.market,
                active: m.active
            }));

            setMarkets(mappedMarkets);
            setDrivers(driversData.drivers || []);
            setTemplates(templatesData.templates || []);
            setSettings(settingsData.settings);

            const activeMarkets = mappedMarkets.filter((m: Market) => m.active);
            if (activeMarkets.length > 0) {
                setSelectedTemplateMarket(activeMarkets[0].market);
            } else if (mappedMarkets.length > 0) {
                setSelectedTemplateMarket(mappedMarkets[0].market);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
            showNotification('Failed to load data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchScheduleData = useCallback(async () => {
        const weekDates = getWeekDates(weekStart);
        const data: Record<string, Record<string, ShiftWithDrivers[]>> = {};

        try {
            for (const market of markets) {
                // Use CODE for query
                data[market.market] = {};
                for (const date of weekDates) {
                    const res = await fetch(`/api/shifts?market=${encodeURIComponent(market.market)}&date=${date}&t=${new Date().getTime()}`, { cache: 'no-store' });
                    const result = await res.json();
                    data[market.market][date] = result.shifts || [];
                }
            }
            setScheduleData(data);
        } catch (error) {
            console.error('Failed to fetch schedule:', error);
        }
    }, [markets, weekStart]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (markets.length > 0) {
            fetchScheduleData();
        }
    }, [weekStart, markets, fetchScheduleData]);

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
            if (res.ok) {
                const updatedTemplates = await fetch('/api/templates').then(r => r.json());
                setTemplates(updatedTemplates.templates || []);
                setShowAddTemplate(false);
                showNotification('Template created', 'success');
            } else {
                showNotification('Failed to create template', 'error');
            }
        } catch (e) {
            showNotification('Error creating template', 'error');
        }
    };

    const deleteTemplate = async (id: number) => {
        if (!confirm('Are you sure you want to delete this template?')) return;
        try {
            const res = await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete');
            }
            const updatedTemplates = templates.filter(t => t.id !== id);
            setTemplates(updatedTemplates);
        } catch (e) {
            showNotification((e as Error).message || 'Failed to delete', 'error');
        }
    };

    const [showCapacityModal, setShowCapacityModal] = useState(false);
    const [editingCapacityTemplateId, setEditingCapacityTemplateId] = useState<number | null>(null);
    const [capacityOverrides, setCapacityOverrides] = useState<any[]>([]);
    const [capacityDefault, setCapacityDefault] = useState(0);

    const openCapacityEditor = async (id: number) => {
        setEditingCapacityTemplateId(id);
        setShowCapacityModal(true);
        try {
            const res = await fetch(`/api/capacity-overrides?templateId=${id}`);
            const data = await res.json();
            setCapacityOverrides(data.overrides || []);
            setCapacityDefault(data.defaultCapacity || 0);
        } catch (error) {
            console.error('Failed to fetch overrides:', error);
            showNotification('Failed to load capacity settings', 'error');
        }
    };

    const saveCapacityOverride = async (dayOfWeek: number, capacity: number) => {
        if (editingCapacityTemplateId === null) return;
        try {
            const res = await fetch('/api/capacity-overrides', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: editingCapacityTemplateId,
                    dayOfWeek,
                    capacity
                })
            });

            if (res.ok) {
                // Refresh local state for the modal
                const updatedRes = await fetch(`/api/capacity-overrides?templateId=${editingCapacityTemplateId}`);
                const data = await updatedRes.json();
                setCapacityOverrides(data.overrides || []);
                showNotification(`Capacity for ${getDayName(dayOfWeek)} updated`, 'success');
                // Refresh main schedule view if needed contextually, but main view fetch depends on week selection
                if (markets.length > 0) fetchScheduleData();
            } else {
                showNotification('Failed to update capacity', 'error');
            }
        } catch (error) {
            console.error(error);
            showNotification('Error saving capacity', 'error');
        }
    };

    const getDayName = (day: number) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];

    const removeDriverFromShift = async (shiftId: number) => {
        if (!confirm('Are you sure you want to remove this driver from the shift? This action cannot be undone.')) return;

        try {
            const res = await fetch(`/api/shifts/${shiftId}`, {
                method: 'DELETE',
                headers: {
                    'x-admin-override': 'true'
                }
            });

            if (res.ok) {
                showNotification('Driver removed from shift', 'success');
                fetchScheduleData(); // Refresh the schedule view
            } else {
                const data = await res.json();
                showNotification(data.error || 'Failed to remove driver', 'error');
            }
        } catch (error) {
            console.error('Error removing driver:', error);
            showNotification('Failed to remove driver', 'error');
        }
    };

    const addMarket = async (name: string) => {
        if (!name.trim()) return;
        const code = name.substring(0, 3).toLowerCase();
        try {
            const res = await fetch('/api/markets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, code })
            });
            if (res.ok) {
                fetchInitialData();
                showNotification('Market added', 'success');
            }
        } catch (e) {
            showNotification('Failed to add market', 'error');
        }
    };

    const toggleMarketStatus = async (id: number, active: boolean) => {
        try {
            await fetch(`/api/markets/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active })
            });
            fetchInitialData();
        } catch (e) {
            showNotification('Failed to update market', 'error');
        }
    };

    const deleteMarket = async (id: number) => {
        if (!confirm('Are you sure you want to delete this market?')) return;
        try {
            const res = await fetch(`/api/markets/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchInitialData();
                showNotification('Market deleted', 'success');
            } else {
                const data = await res.json();
                showNotification(data.error || 'Failed to delete market', 'error');
            }
        } catch (e) {
            showNotification('Error deleting market', 'error');
        }
    };

    const updateSettings = async (newSettings: Partial<Settings>) => {
        const updated = { ...settings, ...newSettings };
        setSettings(updated);
        // Persist to API
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });
        } catch (e) { console.error(e); }
    };

    const updateDriverPriority = async (id: number, priority: number) => {
        try {
            const res = await fetch(`/api/drivers/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priority })
            });
            if (res.ok) {
                showNotification('Driver priority updated', 'success');
                fetchInitialData(); // Refresh list
            } else {
                showNotification('Failed to update priority', 'error');
            }
        } catch (e) {
            console.error(e);
            showNotification('Error updating priority', 'error');
        }
    };

    const toggleDriverBlocked = async (id: number, blocked: boolean) => {
        try {
            const res = await fetch(`/api/drivers/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocked })
            });
            if (res.ok) {
                showNotification(`Driver ${blocked ? 'blocked' : 'activated'}`, 'success');
                fetchInitialData();
            } else {
                showNotification('Failed to update status', 'error');
            }
        } catch (e) {
            console.error(e);
            showNotification('Error updating status', 'error');
        }
    };

    const updateDriverMarket = async (id: number, market: string) => {
        try {
            const res = await fetch(`/api/drivers/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ market })
            });
            if (res.ok) {
                showNotification('Driver market updated', 'success');
                fetchInitialData();
            } else {
                showNotification('Failed to update market', 'error');
            }
        } catch (e) {
            console.error(e);
            showNotification('Error updating market', 'error');
        }
    };

    const weekDates = getWeekDates(weekStart);

    const handleLogout = () => {
        sessionStorage.removeItem('isAdmin');
        router.push('/');
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading dashboard...</div>;
    }

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
            {/* Context Modals */}
            {showCapacityModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }}>
                    <div style={{ background: 'white', padding: '2rem', borderRadius: '0.5rem', width: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Manage Capacity Overrides</h2>
                            <button onClick={() => setShowCapacityModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
                        </div>

                        <p style={{ marginBottom: '1rem', color: 'var(--color-gray-600)' }}>
                            Default Template Capacity: <strong>{capacityDefault}</strong>
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {capacityOverrides.map((day) => (
                                <div key={day.dayOfWeek} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '0.75rem', border: '1px solid var(--color-gray-200)', borderRadius: '0.25rem',
                                    backgroundColor: day.isOverride ? 'var(--color-blue-50)' : 'transparent'
                                }}>
                                    <span style={{ fontWeight: '500' }}>{day.dayName}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            max="20"
                                            value={day.capacity}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!isNaN(val)) saveCapacityOverride(day.dayOfWeek, val);
                                            }}
                                            style={{ width: '60px', padding: '0.25rem' }}
                                        />
                                        {day.isOverride && (
                                            <button
                                                onClick={() => saveCapacityOverride(day.dayOfWeek, 0)} // 0 resets to default logic in API
                                                title="Reset to default"
                                                style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                            <button className="btn btn-primary" onClick={() => setShowCapacityModal(false)}>Done</button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>TOC Schedule Admin</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className={`btn ${activeTab === 'schedule' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('schedule')}
                    >
                        <Calendar size={18} style={{ marginRight: '0.5rem' }} />
                        Schedule
                    </button>
                    <button
                        className={`btn ${activeTab === 'templates' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('templates')}
                    >
                        <Clock size={18} style={{ marginRight: '0.5rem' }} />
                        Templates
                    </button>
                    <button
                        className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        <SettingsIcon size={18} style={{ marginRight: '0.5rem' }} />
                        Settings
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={handleLogout}
                        style={{ marginLeft: '1rem', color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                        title="Logout"
                    >
                        <LogOut size={18} />
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

                    {markets.filter(m => m.active).map(market => {
                        const marketTemplatesForView = templates.filter(t => t.market === market.market);

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
                                                            const shifts = scheduleData[market.market]?.[date] || [];
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
                                                                            {shift.drivers.map(driver => {
                                                                                // Check if shift is past
                                                                                const shiftStart = new Date(`${date}T${template.startTime}`);
                                                                                const shiftEnd = new Date(`${date}T${template.endTime}`);
                                                                                if (shiftEnd < shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);
                                                                                const isPast = shiftEnd < new Date();

                                                                                return (
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
                                                                                        {!isPast && (
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
                                                                                        )}
                                                                                    </div>
                                                                                )
                                                                            })}
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
                        {markets.filter(m => m.active).map(m => (
                            <option key={m.id} value={m.market}>{m.name}</option>
                        ))}
                    </select>
                    <button className="btn btn-primary" onClick={() => setShowAddTemplate(true)} style={{ marginLeft: '1rem' }}>
                        <Plus size={18} style={{ marginRight: '0.5rem' }} />
                        Add Template
                    </button>

                    {showAddTemplate && (
                        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f3f4f6', borderRadius: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                                <div>
                                    <label>Start Time</label>
                                    <input type="time" value={newTemplate.startTime} onChange={e => setNewTemplate({ ...newTemplate, startTime: e.target.value })} />
                                </div>
                                <div>
                                    <label>End Time</label>
                                    <input type="time" value={newTemplate.endTime} onChange={e => setNewTemplate({ ...newTemplate, endTime: e.target.value })} />
                                </div>
                                <div>
                                    <label>Capacity</label>
                                    <input type="number" min="1" value={newTemplate.capacity} onChange={e => setNewTemplate({ ...newTemplate, capacity: parseInt(e.target.value) })} />
                                </div>
                                <button className="btn btn-success" onClick={createTemplate}>Save</button>
                                <button className="btn btn-secondary" onClick={() => setShowAddTemplate(false)}>Cancel</button>
                            </div>
                        </div>
                    )}

                    <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Capacity</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>

                            <tbody>
                                {templates.filter(t => t.market === selectedTemplateMarket).map(template => (
                                    <tr key={template.id}>
                                        <td> {formatTime(template.startTime)} - {formatTime(template.endTime)} </td>
                                        <td> {template.capacity} </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem' }}
                                                    onClick={() => openCapacityEditor(template.id)}
                                                    title="Edit Day Capacity"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', color: 'var(--color-error)' }}
                                                    onClick={() => deleteTemplate(template.id)}
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {templates.filter(t => t.market === selectedTemplateMarket).length === 0 && (
                                    <tr>
                                        <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-gray-600)' }}>
                                            No templates found for this market.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && settings && (
                <div className="card">
                    <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1.5rem' }}>System Settings</h2>

                    {/* Market Management Section */}
                    <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid var(--color-gray-200)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>Market Management</h3>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Market Name (City)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Charlotte"
                                    id="newMarketName"
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Code (3 letters)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. clt"
                                    id="newMarketCode"
                                    maxLength={3}
                                />
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    const nameInput = document.getElementById('newMarketName') as HTMLInputElement;
                                    const codeInput = document.getElementById('newMarketCode') as HTMLInputElement;
                                    addMarket(nameInput.value);
                                    nameInput.value = '';
                                    if (codeInput) codeInput.value = '';
                                }}
                            >
                                Add Market
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                            {markets.map(market => (
                                <div key={market.id} style={{
                                    padding: '0.75rem',
                                    border: '1px solid var(--color-gray-200)',
                                    borderRadius: '0.5rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    opacity: market.active ? 1 : 0.6
                                }}>
                                    <div>
                                        <div style={{ fontWeight: '500' }}>{market.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-600)' }}>{market.market.toUpperCase()}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <label className="toggle">
                                            <input
                                                type="checkbox"
                                                checked={!!market.active}
                                                onChange={(e) => toggleMarketStatus(market.id, e.target.checked)}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                        <button
                                            className="btn btn-danger"
                                            onClick={() => deleteMarket(market.id)}
                                            style={{ padding: '0.25rem 0.5rem' }}
                                            title="Delete Market"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
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

                    <div style={{ marginTop: '1rem' }}>
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
                                            {driver.email}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <select
                                            value={driver.market}
                                            onChange={(e) => updateDriverMarket(driver.id, e.target.value)}
                                            style={{ width: '100px' }}
                                        >
                                            {markets.map(m => (
                                                <option key={m.market} value={m.market}>{m.market.toUpperCase()}</option>
                                            ))}
                                        </select>
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
    );

}
