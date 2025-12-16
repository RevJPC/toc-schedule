import React, { useState } from 'react';
import { Calendar, Clock, Users, Settings, LogOut, Plus, X, Check, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const DriverSchedulingSystem = () => {
  const [userRole, setUserRole] = useState('driver'); // 'driver' or 'admin'
  const [currentUser, setCurrentUser] = useState({
    id: 1,
    name: 'John Driver',
    market: 'Chapel Hill',
    priority: 3
  });

  // Admin settings
  const [adminSettings, setAdminSettings] = useState({
    baseScheduleDays: 7,
    cancelHoursBefore: 24,
    showAvailableSpots: false
  });

  // Markets
  const [markets] = useState(['Chapel Hill', 'Raleigh', 'Asheville', 'Durham']);

  // Shift templates
  const [shiftTemplates, setShiftTemplates] = useState({
    'Chapel Hill': [
      { id: 1, start: '08:00', end: '10:00', capacity: 2 },
      { id: 2, start: '10:00', end: '14:00', capacity: 3 },
      { id: 3, start: '11:00', end: '16:00', capacity: 2 },
      { id: 4, start: '14:00', end: '21:00', capacity: 4 },
      { id: 5, start: '16:00', end: '21:00', capacity: 3 }
    ],
    'Raleigh': [
      { id: 6, start: '10:00', end: '14:00', capacity: 4 },
      { id: 7, start: '11:00', end: '16:00', capacity: 3 },
      { id: 8, start: '16:00', end: '21:00', capacity: 5 }
    ],
    'Asheville': [
      { id: 9, start: '10:00', end: '14:00', capacity: 2 },
      { id: 10, start: '14:00', end: '21:00', capacity: 3 }
    ],
    'Durham': [
      { id: 11, start: '11:00', end: '16:00', capacity: 3 },
      { id: 12, start: '16:00', end: '21:00', capacity: 4 }
    ]
  });

  // Scheduled shifts
  const [scheduledShifts, setScheduledShifts] = useState([
    { id: 1, driverId: 1, driverName: 'John Driver', market: 'Chapel Hill', date: '2024-12-20', start: '10:00', end: '14:00' },
    { id: 2, driverId: 2, driverName: 'Jane Smith', market: 'Chapel Hill', date: '2024-12-20', start: '16:00', end: '21:00' },
    { id: 3, driverId: 1, driverName: 'John Driver', market: 'Chapel Hill', date: '2024-12-21', start: '14:00', end: '21:00' }
  ]);

  // Drivers list (for admin)
  const [drivers] = useState([
    { id: 1, name: 'John Driver', market: 'Chapel Hill', priority: 3, blocked: false },
    { id: 2, name: 'Jane Smith', market: 'Chapel Hill', priority: 1, blocked: false },
    { id: 3, name: 'Bob Johnson', market: 'Raleigh', priority: 2, blocked: false },
    { id: 4, name: 'Alice Williams', market: 'Asheville', priority: 5, blocked: false }
  ]);

  const [selectedMarket, setSelectedMarket] = useState(currentUser.market);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showMarketSwitchConfirm, setShowMarketSwitchConfirm] = useState(false);
  const [pendingMarket, setPendingMarket] = useState('');
  const [adminView, setAdminView] = useState('schedule'); // 'schedule', 'templates', 'settings'
  const [notification, setNotification] = useState(null);

  // Calculate scheduling window based on priority
  const getSchedulingWindow = (priority) => {
    const bonusDays = {
      1: 5,
      2: 4,
      3: 3,
      4: 2,
      5: 1
    };
    return adminSettings.baseScheduleDays + (bonusDays[priority] || 0);
  };

  // Check if date is within scheduling window
  const isDateInWindow = (date, priority) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((checkDate - today) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= getSchedulingWindow(priority);
  };

  // Check for overlapping shifts
  const hasOverlap = (shift1Start, shift1End, shift2Start, shift2End) => {
    const start1 = shift1Start.replace(':', '');
    const end1 = shift1End.replace(':', '');
    const start2 = shift2Start.replace(':', '');
    const end2 = shift2End.replace(':', '');
    
    return (start1 < end2 && end1 > start2);
  };

  // Check if driver can claim shift
  const canClaimShift = (market, date, start, end) => {
    // Check if within scheduling window
    if (!isDateInWindow(date, currentUser.priority)) {
      return { allowed: false, reason: 'Outside your scheduling window' };
    }

    // Check for overlaps in ANY market
    const driverShifts = scheduledShifts.filter(s => 
      s.driverId === currentUser.id && s.date === date
    );

    for (let shift of driverShifts) {
      if (hasOverlap(start, end, shift.start, shift.end)) {
        return { allowed: false, reason: 'Overlaps with existing shift' };
      }
    }

    // Check if already scheduled in same market that day
    const sameMarketShift = driverShifts.find(s => s.market === market);
    if (sameMarketShift) {
      return { allowed: false, reason: 'Already scheduled in this market today' };
    }

    // Check capacity
    const template = shiftTemplates[market].find(t => t.start === start && t.end === end);
    const currentCount = scheduledShifts.filter(s => 
      s.market === market && s.date === date && s.start === start && s.end === end
    ).length;

    if (currentCount >= template.capacity) {
      return { allowed: false, reason: 'Shift is full' };
    }

    return { allowed: true };
  };

  // Check if driver can cancel shift
  const canCancelShift = (date, start) => {
    const shiftDateTime = new Date(`${date}T${start}`);
    const now = new Date();
    const hoursUntilShift = (shiftDateTime - now) / (1000 * 60 * 60);
    return hoursUntilShift >= adminSettings.cancelHoursBefore;
  };

  // Handle shift claim
  const claimShift = (market, date, start, end) => {
    const check = canClaimShift(market, date, start, end);
    if (!check.allowed) {
      showNotification(check.reason, 'error');
      return;
    }

    const newShift = {
      id: scheduledShifts.length + 1,
      driverId: currentUser.id,
      driverName: currentUser.name,
      market,
      date,
      start,
      end
    };

    setScheduledShifts([...scheduledShifts, newShift]);
    showNotification('Shift claimed successfully!', 'success');
  };

  // Handle shift cancellation
  const cancelShift = (shiftId) => {
    const shift = scheduledShifts.find(s => s.id === shiftId);
    if (!shift) return;

    if (!canCancelShift(shift.date, shift.start)) {
      showNotification(`Cannot cancel within ${adminSettings.cancelHoursBefore} hours. Please email admin.`, 'error');
      return;
    }

    setScheduledShifts(scheduledShifts.filter(s => s.id !== shiftId));
    showNotification('Shift cancelled', 'success');
  };

  // Handle market switch
  const requestMarketSwitch = (newMarket) => {
    if (newMarket === currentUser.market) {
      setPendingMarket(newMarket);
      setSelectedMarket(newMarket);
    } else {
      setPendingMarket(newMarket);
      setShowMarketSwitchConfirm(true);
    }
  };

  const confirmMarketSwitch = () => {
    setSelectedMarket(pendingMarket);
    setShowMarketSwitchConfirm(false);
    showNotification(`Switched to ${pendingMarket}`, 'success');
  };

  // Show notification
  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Get available shifts for a date
  const getAvailableShifts = (market, date) => {
    if (!shiftTemplates[market]) return [];
    
    return shiftTemplates[market].map(template => {
      const scheduled = scheduledShifts.filter(s => 
        s.market === market && s.date === date && s.start === template.start && s.end === template.end
      );
      
      return {
        ...template,
        scheduled: scheduled.length,
        available: template.capacity - scheduled.length,
        drivers: scheduled
      };
    });
  };

  // Format time
  const formatTime = (time) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes}${ampm}`;
  };

  // Generate dates for next X days
  const generateDates = (days) => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  };

  // Weekly Driver View Component
  const WeeklyDriverView = ({ dates, selectedMarket, getAvailableShifts, canClaimShift, claimShift, formatTime, adminSettings }) => {
    const [weekOffset, setWeekOffset] = useState(0);

    const getWeekDates = (offset) => {
      const result = [];
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + (offset * 7)); // Start on Sunday
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        // Only include dates within the driver's scheduling window
        if (dates.includes(dateStr)) {
          result.push(dateStr);
        }
      }
      return result;
    };

    const weekDates = getWeekDates(weekOffset);
    const canGoNext = getWeekDates(weekOffset + 1).length > 0;

    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            disabled={weekOffset === 0}
            className="p-2 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-medium">
            {weekDates.length > 0 && (
              <>
                {new Date(weekDates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(weekDates[weekDates.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </>
            )}
          </span>
          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            disabled={!canGoNext}
            className="p-2 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {weekDates.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No dates available in this week</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left font-medium sticky left-0 bg-gray-100 z-10">Shift Time</th>
                  {weekDates.map(date => {
                    const dateObj = new Date(date);
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                    const monthDay = dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                    return (
                      <th key={date} className="border border-gray-300 p-2 text-center font-medium min-w-32">
                        <div>{dayName}</div>
                        <div className="text-xs text-gray-600">{monthDay}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shiftTemplates[selectedMarket] && shiftTemplates[selectedMarket].map(template => (
                  <tr key={template.id}>
                    <td className="border border-gray-300 p-2 font-medium bg-gray-50 sticky left-0 z-10">
                      {formatTime(template.start)} - {formatTime(template.end)}
                    </td>
                    {weekDates.map(date => {
                      const shifts = getAvailableShifts(selectedMarket, date);
                      const shift = shifts.find(s => s.start === template.start && s.end === template.end);
                      
                      if (!shift) {
                        return <td key={date} className="border border-gray-300 p-2 bg-gray-50"></td>;
                      }

                      const check = canClaimShift(selectedMarket, date, shift.start, shift.end);
                      const isFull = shift.available === 0;
                      const isDisabled = !check.allowed || isFull;
                      
                      return (
                        <td key={date} className={`border border-gray-300 p-2 align-top ${isDisabled ? 'bg-gray-50' : 'bg-white'}`}>
                          <div className="flex flex-col items-center space-y-2">
                            {adminSettings.showAvailableSpots && (
                              <div className="text-xs text-gray-600">{shift.available} spots</div>
                            )}
                            <button
                              onClick={() => claimShift(selectedMarket, date, shift.start, shift.end)}
                              disabled={isDisabled}
                              className={`w-full px-2 py-1 rounded text-sm font-medium ${
                                isDisabled
                                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              {isFull ? 'Full' : 'Claim'}
                            </button>
                            {!check.allowed && !isFull && (
                              <div className="text-xs text-red-600 text-center">{check.reason}</div>
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
    );
  };

  // Driver View
  const DriverView = () => {
    const myShifts = scheduledShifts.filter(s => s.driverId === currentUser.id);
    const dates = generateDates(getSchedulingWindow(currentUser.priority));
    const [driverViewMode, setDriverViewMode] = useState('daily'); // 'daily' or 'weekly'

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Welcome, {currentUser.name}</h2>
              <p className="text-gray-600">Priority Level {currentUser.priority} - Can schedule {getSchedulingWindow(currentUser.priority)} days ahead</p>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={selectedMarket}
                onChange={(e) => requestMarketSwitch(e.target.value)}
                className="border border-gray-300 rounded-md px-4 py-2"
              >
                {markets.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button onClick={() => setUserRole('admin')} className="text-sm text-blue-600 hover:text-blue-700">
                Switch to Admin View
              </button>
            </div>
          </div>
        </div>

        {/* My Schedule */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">My Schedule</h3>
          {myShifts.length === 0 ? (
            <p className="text-gray-500">No shifts scheduled</p>
          ) : (
            <div className="space-y-3">
              {myShifts.map(shift => (
                <div key={shift.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                  <div>
                    <p className="font-medium">{shift.market}</p>
                    <p className="text-sm text-gray-600">{shift.date} • {formatTime(shift.start)} - {formatTime(shift.end)}</p>
                  </div>
                  <button
                    onClick={() => cancelShift(shift.id)}
                    className="text-red-600 hover:bg-red-50 p-2 rounded"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Shifts */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Available Shifts - {selectedMarket}</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setDriverViewMode('daily')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  driverViewMode === 'daily' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                Daily View
              </button>
              <button
                onClick={() => setDriverViewMode('weekly')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  driverViewMode === 'weekly' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                Weekly View
              </button>
            </div>
          </div>

          {driverViewMode === 'daily' ? (
            <div className="space-y-6">
              {dates.map(date => {
                const shifts = getAvailableShifts(selectedMarket, date);
                const dateObj = new Date(date);
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                return (
                  <div key={date} className="border-b border-gray-200 pb-4">
                    <h4 className="font-medium text-gray-900 mb-3">{dayName}, {monthDay}</h4>
                    <div className="space-y-2">
                      {shifts.map(shift => {
                        const check = canClaimShift(selectedMarket, date, shift.start, shift.end);
                        const isFull = shift.available === 0;
                        const isDisabled = !check.allowed || isFull;
                        
                        return (
                          <div
                            key={shift.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              isDisabled ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300 hover:border-blue-400'
                            }`}
                          >
                            <div className="flex-1">
                              <p className={`font-medium ${isDisabled ? 'text-gray-400' : 'text-gray-900'}`}>
                                {formatTime(shift.start)} - {formatTime(shift.end)}
                              </p>
                              {adminSettings.showAvailableSpots && (
                                <p className="text-sm text-gray-500">{shift.available} spots available</p>
                              )}
                              {!check.allowed && !isFull && (
                                <p className="text-xs text-red-600">{check.reason}</p>
                              )}
                            </div>
                            <button
                              onClick={() => claimShift(selectedMarket, date, shift.start, shift.end)}
                              disabled={isDisabled}
                              className={`px-4 py-2 rounded-lg font-medium ${
                                isDisabled
                                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
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
            <WeeklyDriverView 
              dates={dates}
              selectedMarket={selectedMarket}
              getAvailableShifts={getAvailableShifts}
              canClaimShift={canClaimShift}
              claimShift={claimShift}
              formatTime={formatTime}
              adminSettings={adminSettings}
            />
          )}
        </div>
      </div>
    );
  };

  // Admin View
  const AdminView = () => {
    const [adminWeekStart, setAdminWeekStart] = useState(new Date().toISOString().split('T')[0]);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
            <button onClick={() => setUserRole('driver')} className="text-sm text-blue-600 hover:text-blue-700">
              Switch to Driver View
            </button>
          </div>
          <div className="flex space-x-4 mt-4">
            <button
              onClick={() => setAdminView('schedule')}
              className={`px-4 py-2 rounded-lg font-medium ${
                adminView === 'schedule' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              Schedule
            </button>
            <button
              onClick={() => setAdminView('templates')}
              className={`px-4 py-2 rounded-lg font-medium ${
                adminView === 'templates' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              Shift Templates
            </button>
            <button
              onClick={() => setAdminView('settings')}
              className={`px-4 py-2 rounded-lg font-medium ${
                adminView === 'settings' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              Settings
            </button>
          </div>
        </div>

        {adminView === 'schedule' && <AdminScheduleView weekStart={adminWeekStart} setWeekStart={setAdminWeekStart} />}
        {adminView === 'templates' && <AdminTemplatesView />}
        {adminView === 'settings' && <AdminSettingsView />}
      </div>
    );
  };

  // Admin Schedule View
  const AdminScheduleView = ({ weekStart, setWeekStart }) => {
    const getWeekDates = (startDate) => {
      const dates = [];
      const start = new Date(startDate);
      start.setDate(start.getDate() - start.getDay()); // Go to Sunday
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
      }
      return dates;
    };

    const weekDates = getWeekDates(weekStart);

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
    
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Weekly Schedule</h3>
          <div className="flex items-center space-x-4">
            <button
              onClick={goToPreviousWeek}
              className="p-2 hover:bg-gray-100 rounded"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goToCurrentWeek}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              This Week
            </button>
            <span className="font-medium">
              {new Date(weekDates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(weekDates[6]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button
              onClick={goToNextWeek}
              className="p-2 hover:bg-gray-100 rounded"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        {markets.map(market => (
          <div key={market} className="mb-8">
            <h4 className="font-medium text-gray-900 mb-4 text-lg bg-gray-50 p-3 rounded">{market}</h4>
            
            {/* Get all unique shift times for this market */}
            {shiftTemplates[market] && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 p-2 text-left font-medium">Shift Time</th>
                      {weekDates.map(date => {
                        const dateObj = new Date(date);
                        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                        const monthDay = dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                        return (
                          <th key={date} className="border border-gray-300 p-2 text-center font-medium">
                            <div>{dayName}</div>
                            <div className="text-xs text-gray-600">{monthDay}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {shiftTemplates[market].map(template => (
                      <tr key={template.id}>
                        <td className="border border-gray-300 p-2 font-medium bg-gray-50">
                          {formatTime(template.start)} - {formatTime(template.end)}
                        </td>
                        {weekDates.map(date => {
                          const shifts = getAvailableShifts(market, date);
                          const shift = shifts.find(s => s.start === template.start && s.end === template.end);
                          
                          return (
                            <td key={date} className="border border-gray-300 p-2 align-top">
                              {shift && (
                                <div className="space-y-1">
                                  <div className={`text-xs font-medium ${shift.available > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {shift.scheduled}/{shift.capacity}
                                  </div>
                                  {shift.drivers.map(driver => (
                                    <div key={driver.id} className="text-xs bg-blue-50 p-1 rounded flex justify-between items-center">
                                      <span className="truncate">{driver.driverName}</span>
                                      <button
                                        onClick={() => {
                                          setScheduledShifts(scheduledShifts.filter(s => s.id !== driver.id));
                                          showNotification('Driver removed', 'success');
                                        }}
                                        className="ml-1 text-red-600 hover:bg-red-100 rounded"
                                      >
                                        <X className="h-3 w-3" />
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
        ))}
      </div>
    );
  };

  // Admin Templates View
  const AdminTemplatesView = () => {
    const [editingMarket, setEditingMarket] = useState('Chapel Hill');
    
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Shift Templates</h3>
        
        <select
          value={editingMarket}
          onChange={(e) => setEditingMarket(e.target.value)}
          className="border border-gray-300 rounded-md px-4 py-2 mb-4"
        >
          {markets.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <div className="space-y-3">
          {shiftTemplates[editingMarket]?.map(template => (
            <div key={template.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
              <div className="flex-1">
                <p className="font-medium">{formatTime(template.start)} - {formatTime(template.end)}</p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-600">Capacity:</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={template.capacity}
                    onChange={(e) => {
                      const newCapacity = parseInt(e.target.value);
                      setShiftTemplates({
                        ...shiftTemplates,
                        [editingMarket]: shiftTemplates[editingMarket].map(t =>
                          t.id === template.id ? { ...t, capacity: newCapacity } : t
                        )
                      });
                      showNotification('Capacity updated', 'success');
                    }}
                    className="border border-gray-300 rounded px-3 py-1 w-20"
                  />
                </div>
                <button
                  onClick={() => {
                    setShiftTemplates({
                      ...shiftTemplates,
                      [editingMarket]: shiftTemplates[editingMarket].filter(t => t.id !== template.id)
                    });
                    showNotification('Shift template removed', 'success');
                  }}
                  className="text-red-600 hover:bg-red-50 p-2 rounded"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Add New Shift Template
        </button>
      </div>
    );
  };

  // Admin Settings View
  const AdminSettingsView = () => {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6">System Settings</h3>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Base Scheduling Days (all drivers)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={adminSettings.baseScheduleDays}
              onChange={(e) => setAdminSettings({ ...adminSettings, baseScheduleDays: parseInt(e.target.value) })}
              className="border border-gray-300 rounded-md px-4 py-2 w-32"
            />
            <p className="text-sm text-gray-500 mt-1">Priority drivers get bonus days on top of this</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Cancellation Hours
            </label>
            <input
              type="number"
              min="1"
              max="72"
              value={adminSettings.cancelHoursBefore}
              onChange={(e) => setAdminSettings({ ...adminSettings, cancelHoursBefore: parseInt(e.target.value) })}
              className="border border-gray-300 rounded-md px-4 py-2 w-32"
            />
            <p className="text-sm text-gray-500 mt-1">Drivers must cancel this many hours before shift</p>
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={adminSettings.showAvailableSpots}
                onChange={(e) => setAdminSettings({ ...adminSettings, showAvailableSpots: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm font-medium text-gray-700">Show available spots to drivers</span>
            </label>
          </div>

          <div className="border-t pt-6 mt-6">
            <h4 className="font-medium text-gray-900 mb-4">Driver Management</h4>
            <div className="space-y-3">
              {drivers.map(driver => (
                <div key={driver.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                  <div>
                    <p className="font-medium">{driver.name}</p>
                    <p className="text-sm text-gray-600">{driver.market} • Priority {driver.priority}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <select
                      value={driver.priority}
                      className="border border-gray-300 rounded px-3 py-1 text-sm"
                    >
                      <option value="1">Priority 1</option>
                      <option value="2">Priority 2</option>
                      <option value="3">Priority 3</option>
                      <option value="4">Priority 4</option>
                      <option value="5">Priority 5</option>
                    </select>
                    <button
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        driver.blocked ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {driver.blocked ? 'Blocked' : 'Active'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white`}>
          {notification.message}
        </div>
      )}

      {/* Market Switch Confirmation */}
      {showMarketSwitchConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md">
            <h3 className="text-lg font-semibold mb-4">Confirm Market Switch</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to switch to {pendingMarket}? You usually work in {currentUser.market}.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowMarketSwitchConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmMarketSwitch}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Switch Market
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        {userRole === 'driver' ? <DriverView /> : <AdminView />}
      </div>
    </div>
  );
};

export default DriverSchedulingSystem;