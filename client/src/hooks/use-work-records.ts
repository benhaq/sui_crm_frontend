import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';

export interface LocalWorkRecord {
  id: string;
  date: string;
  checkIn: string;
  checkOut: string | null;
  duration: string | null;
  status: 'in-progress' | 'completed';
}

export function useWorkRecords() {
  const { currentWalletAddress } = useAppStore();
  const [workRecords, setWorkRecords] = useState<LocalWorkRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<LocalWorkRecord | null>(null);

  const storageKey = `work-records-${currentWalletAddress || 'default'}`;

  useEffect(() => {
    loadWorkRecords();
  }, [currentWalletAddress]);

  const loadWorkRecords = () => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const records = JSON.parse(stored);
        setWorkRecords(records);
        
        // Find current in-progress record
        const current = records.find((r: LocalWorkRecord) => r.status === 'in-progress');
        setCurrentRecord(current || null);
      }
    } catch (error) {
      console.error('Failed to load work records:', error);
    }
  };

  const saveWorkRecords = (records: LocalWorkRecord[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(records));
      setWorkRecords(records);
    } catch (error) {
      console.error('Failed to save work records:', error);
      throw error;
    }
  };

  const checkIn = (): LocalWorkRecord => {
    const now = new Date();
    const dateString = now.toLocaleDateString();
    const timeString = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Check if already checked in today
    const todayRecord = workRecords.find(
      record => record.date === dateString && record.status === 'in-progress'
    );

    if (todayRecord) {
      throw new Error('Already checked in today');
    }

    const newRecord: LocalWorkRecord = {
      id: Date.now().toString(),
      date: dateString,
      checkIn: timeString,
      checkOut: null,
      duration: null,
      status: 'in-progress'
    };

    const updatedRecords = [newRecord, ...workRecords];
    saveWorkRecords(updatedRecords);
    setCurrentRecord(newRecord);
    
    return newRecord;
  };

  const checkOut = (): LocalWorkRecord => {
    if (!currentRecord) {
      throw new Error('No active check-in found');
    }

    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Calculate duration
    const checkInTime = new Date(`${currentRecord.date} ${currentRecord.checkIn}`);
    const checkOutTime = new Date(`${currentRecord.date} ${timeString}`);
    const durationMs = checkOutTime.getTime() - checkInTime.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const duration = `${hours}h ${minutes}m`;

    const updatedRecord: LocalWorkRecord = {
      ...currentRecord,
      checkOut: timeString,
      duration,
      status: 'completed'
    };

    const updatedRecords = workRecords.map(record =>
      record.id === currentRecord.id ? updatedRecord : record
    );

    saveWorkRecords(updatedRecords);
    setCurrentRecord(null);
    
    return updatedRecord;
  };

  const getTodaysHours = (): number => {
    const today = new Date().toLocaleDateString();
    const todayRecords = workRecords.filter(record => record.date === today);
    
    let totalMinutes = 0;
    todayRecords.forEach(record => {
      if (record.duration) {
        const match = record.duration.match(/(\d+)h (\d+)m/);
        if (match) {
          totalMinutes += parseInt(match[1]) * 60 + parseInt(match[2]);
        }
      } else if (record.status === 'in-progress') {
        // Calculate current duration for in-progress record
        const checkInTime = new Date(`${record.date} ${record.checkIn}`);
        const now = new Date();
        const durationMs = now.getTime() - checkInTime.getTime();
        totalMinutes += Math.floor(durationMs / (1000 * 60));
      }
    });

    return Math.round((totalMinutes / 60) * 10) / 10; // Round to 1 decimal place
  };

  const isCheckedIn = (): boolean => {
    return currentRecord !== null;
  };

  return {
    workRecords,
    currentRecord,
    checkIn,
    checkOut,
    getTodaysHours,
    isCheckedIn,
    loadWorkRecords,
  };
}
