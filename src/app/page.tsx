'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Driver } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      const res = await fetch('/api/drivers');
      const data = await res.json();
      setDrivers(data.drivers || []);
    } catch (error) {
      console.error('Failed to fetch drivers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDriverLogin = () => {
    if (!selectedDriver) return;
    // Store driver ID in sessionStorage for demo purposes
    sessionStorage.setItem('driverId', selectedDriver);
    router.push('/dashboard');
  };

  const handleAdminLogin = () => {
    sessionStorage.setItem('isAdmin', 'true');
    router.push('/admin');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)'
    }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1f2937' }}>
          TOC Driver Schedule
        </h1>
        <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
          Select your login type to continue
        </p>

        {/* Driver Login Section */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
            Driver Login
          </h2>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
              <div className="spinner"></div>
            </div>
          ) : (
            <>
              <select
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                style={{ marginBottom: '1rem' }}
              >
                <option value="">Select a driver...</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} ({driver.market})
                  </option>
                ))}
              </select>

              <button
                className="btn btn-primary"
                onClick={handleDriverLogin}
                disabled={!selectedDriver}
                style={{ width: '100%' }}
              >
                Login as Driver
              </button>
            </>
          )}
        </div>

        <div style={{
          borderTop: '1px solid #e5e7eb',
          paddingTop: '1.5rem',
          marginTop: '1.5rem'
        }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
            Admin Access
          </h2>
          <button
            className="btn btn-secondary"
            onClick={handleAdminLogin}
            style={{ width: '100%' }}
          >
            Login as Admin
          </button>
        </div>

        <p style={{
          color: '#9ca3af',
          fontSize: '0.75rem',
          marginTop: '2rem'
        }}>
          Demo mode - Authentication will be added in production
        </p>
      </div>
    </div>
  );
}
