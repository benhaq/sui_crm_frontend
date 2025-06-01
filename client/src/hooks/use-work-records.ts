import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/lib/store";

export interface LocalWorkRecord {
  id: string;
  timesheetId: string;
  date: string;
  checkIn: string;
  checkOut: string | null;
  duration: string | null;
  status: "in-progress" | "completed";
}

export function useWorkRecords(timesheetId: string | null | undefined) {
  const { currentWalletAddress } = useAppStore();
  const [workRecords, setWorkRecords] = useState<LocalWorkRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<LocalWorkRecord | null>(
    null
  );

  const storageKey = `work-records-${currentWalletAddress || "default"}-${
    timesheetId || "no-timesheet"
  }`;

  const loadWorkRecords = useCallback(() => {
    if (!currentWalletAddress || !timesheetId) {
      setWorkRecords([]);
      setCurrentRecord(null);
      return;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const records: LocalWorkRecord[] = JSON.parse(stored);
        const filteredRecords = records.filter(
          (r) => r.timesheetId === timesheetId
        );
        setWorkRecords(filteredRecords);

        const current = filteredRecords.find((r) => r.status === "in-progress");
        setCurrentRecord(current || null);
      } else {
        setWorkRecords([]);
        setCurrentRecord(null);
      }
    } catch (error) {
      console.error(`Failed to load work records for ${storageKey}:`, error);
      setWorkRecords([]);
      setCurrentRecord(null);
    }
  }, [storageKey, currentWalletAddress, timesheetId]);

  useEffect(() => {
    loadWorkRecords();
  }, [loadWorkRecords]);

  const saveWorkRecords = (recordsToSave: LocalWorkRecord[]) => {
    if (!currentWalletAddress || !timesheetId) return;
    try {
      const validatedRecords = recordsToSave.map((r) => ({
        ...r,
        timesheetId,
      }));
      localStorage.setItem(storageKey, JSON.stringify(validatedRecords));
      setWorkRecords(validatedRecords);
    } catch (error) {
      console.error(`Failed to save work records for ${storageKey}:`, error);
    }
  };

  const checkIn = (): LocalWorkRecord => {
    if (!currentWalletAddress || !timesheetId) {
      throw new Error(
        "Cannot check in: Missing wallet address or timesheet ID."
      );
    }
    if (currentRecord) {
      throw new Error(
        "Already checked in for the current timesheet. Please check out first."
      );
    }

    const now = new Date();
    const dateString = now.toLocaleDateString();
    const timeString = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const newRecord: LocalWorkRecord = {
      id: Date.now().toString(),
      timesheetId: timesheetId,
      date: dateString,
      checkIn: timeString,
      checkOut: null,
      duration: null,
      status: "in-progress",
    };

    const updatedRecords = [newRecord, ...workRecords];
    saveWorkRecords(updatedRecords);
    setCurrentRecord(newRecord);

    return newRecord;
  };

  const checkOut = (): LocalWorkRecord => {
    if (!currentWalletAddress || !timesheetId) {
      throw new Error(
        "Cannot check out: Missing wallet address or timesheet ID."
      );
    }
    if (!currentRecord || currentRecord.timesheetId !== timesheetId) {
      throw new Error("No active check-in found for the current timesheet.");
    }

    const now = new Date();
    const timeString = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const checkInTime = new Date(
      `${currentRecord.date} ${currentRecord.checkIn}`
    );
    const checkOutTime = new Date(`${currentRecord.date} ${timeString}`);
    let durationMs = checkOutTime.getTime() - checkInTime.getTime();

    if (durationMs < 0) {
      const nextDayCheckOutTime = new Date(checkOutTime);
      nextDayCheckOutTime.setDate(nextDayCheckOutTime.getDate() + 1);
      durationMs = nextDayCheckOutTime.getTime() - checkInTime.getTime();
    }

    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const duration = `${hours}h ${minutes}m`;

    const updatedRecord: LocalWorkRecord = {
      ...currentRecord,
      checkOut: timeString,
      duration,
      status: "completed",
    };

    const updatedRecords = workRecords.map((record) =>
      record.id === currentRecord.id ? updatedRecord : record
    );

    saveWorkRecords(updatedRecords);
    setCurrentRecord(null);

    return updatedRecord;
  };

  const getTodaysHours = (): number => {
    if (!timesheetId) return 0;
    const today = new Date().toLocaleDateString();
    const todayRecordsForTimesheet = workRecords.filter(
      (record) => record.date === today
    );

    let totalMinutes = 0;
    todayRecordsForTimesheet.forEach((record) => {
      if (record.duration) {
        const match = record.duration.match(/(\d+)h (\d+)m/);
        if (match) {
          totalMinutes += parseInt(match[1]) * 60 + parseInt(match[2]);
        }
      } else if (
        record.status === "in-progress" &&
        record.timesheetId === timesheetId
      ) {
        const checkInTime = new Date(`${record.date} ${record.checkIn}`);
        const now = new Date();
        const durationMs = now.getTime() - checkInTime.getTime();
        totalMinutes += Math.floor(durationMs / (1000 * 60));
      }
    });

    return Math.round((totalMinutes / 60) * 10) / 10;
  };

  const isCheckedIn = (): boolean => {
    return currentRecord !== null && currentRecord.status === "in-progress";
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
