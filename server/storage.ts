import { 
  users, timesheets, timesheetEmployees, workRecords, salaryRecords,
  type User, type InsertUser,
  type Timesheet, type InsertTimesheet,
  type TimesheetEmployee, type InsertTimesheetEmployee,
  type WorkRecord, type InsertWorkRecord,
  type SalaryRecord, type InsertSalaryRecord
} from "@shared/schema";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByWalletAddress(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Timesheet operations
  getTimesheets(): Promise<Timesheet[]>;
  getTimesheet(id: number): Promise<Timesheet | undefined>;
  createTimesheet(timesheet: InsertTimesheet): Promise<Timesheet>;
  updateTimesheetStatus(id: number, status: string, txHash?: string): Promise<void>;

  // Timesheet employee operations
  getTimesheetEmployees(timesheetId: number): Promise<TimesheetEmployee[]>;
  addEmployeeToTimesheet(employee: InsertTimesheetEmployee): Promise<TimesheetEmployee>;

  // Work record operations
  getWorkRecords(employeeAddress?: string, timesheetId?: number): Promise<WorkRecord[]>;
  createWorkRecord(record: InsertWorkRecord): Promise<WorkRecord>;
  updateWorkRecord(id: number, updates: Partial<WorkRecord>): Promise<void>;

  // Salary operations
  getSalaryRecords(employeeAddress?: string): Promise<SalaryRecord[]>;
  createSalaryRecord(record: InsertSalaryRecord): Promise<SalaryRecord>;
  updateSalaryStatus(id: number, status: string, txHash?: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private timesheets: Map<number, Timesheet>;
  private timesheetEmployees: Map<number, TimesheetEmployee>;
  private workRecords: Map<number, WorkRecord>;
  private salaryRecords: Map<number, SalaryRecord>;
  private currentUserId: number;
  private currentTimesheetId: number;
  private currentTimesheetEmployeeId: number;
  private currentWorkRecordId: number;
  private currentSalaryRecordId: number;

  constructor() {
    this.users = new Map();
    this.timesheets = new Map();
    this.timesheetEmployees = new Map();
    this.workRecords = new Map();
    this.salaryRecords = new Map();
    this.currentUserId = 1;
    this.currentTimesheetId = 1;
    this.currentTimesheetEmployeeId = 1;
    this.currentWorkRecordId = 1;
    this.currentSalaryRecordId = 1;
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.walletAddress === walletAddress);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Timesheet operations
  async getTimesheets(): Promise<Timesheet[]> {
    return Array.from(this.timesheets.values()).sort((a, b) => 
      new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
    );
  }

  async getTimesheet(id: number): Promise<Timesheet | undefined> {
    return this.timesheets.get(id);
  }

  async createTimesheet(insertTimesheet: InsertTimesheet): Promise<Timesheet> {
    const id = this.currentTimesheetId++;
    const timesheet: Timesheet = { 
      ...insertTimesheet, 
      id, 
      createdAt: new Date()
    };
    this.timesheets.set(id, timesheet);
    return timesheet;
  }

  async updateTimesheetStatus(id: number, status: string, txHash?: string): Promise<void> {
    const timesheet = this.timesheets.get(id);
    if (timesheet) {
      timesheet.status = status;
      if (txHash) {
        timesheet.txHash = txHash;
      }
      this.timesheets.set(id, timesheet);
    }
  }

  // Timesheet employee operations
  async getTimesheetEmployees(timesheetId: number): Promise<TimesheetEmployee[]> {
    return Array.from(this.timesheetEmployees.values())
      .filter(employee => employee.timesheetId === timesheetId);
  }

  async addEmployeeToTimesheet(insertEmployee: InsertTimesheetEmployee): Promise<TimesheetEmployee> {
    const id = this.currentTimesheetEmployeeId++;
    const employee: TimesheetEmployee = { 
      ...insertEmployee, 
      id, 
      addedAt: new Date()
    };
    this.timesheetEmployees.set(id, employee);
    return employee;
  }

  // Work record operations
  async getWorkRecords(employeeAddress?: string, timesheetId?: number): Promise<WorkRecord[]> {
    let records = Array.from(this.workRecords.values());
    
    if (employeeAddress) {
      records = records.filter(record => record.employeeAddress === employeeAddress);
    }
    
    if (timesheetId) {
      records = records.filter(record => record.timesheetId === timesheetId);
    }
    
    return records.sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime());
  }

  async createWorkRecord(insertRecord: InsertWorkRecord): Promise<WorkRecord> {
    const id = this.currentWorkRecordId++;
    const record: WorkRecord = { ...insertRecord, id };
    this.workRecords.set(id, record);
    return record;
  }

  async updateWorkRecord(id: number, updates: Partial<WorkRecord>): Promise<void> {
    const record = this.workRecords.get(id);
    if (record) {
      Object.assign(record, updates);
      this.workRecords.set(id, record);
    }
  }

  // Salary operations
  async getSalaryRecords(employeeAddress?: string): Promise<SalaryRecord[]> {
    let records = Array.from(this.salaryRecords.values());
    
    if (employeeAddress) {
      records = records.filter(record => record.employeeAddress === employeeAddress);
    }
    
    return records.sort((a, b) => 
      new Date(b.claimedAt || '').getTime() - new Date(a.claimedAt || '').getTime()
    );
  }

  async createSalaryRecord(insertRecord: InsertSalaryRecord): Promise<SalaryRecord> {
    const id = this.currentSalaryRecordId++;
    const record: SalaryRecord = { 
      ...insertRecord, 
      id, 
      claimedAt: new Date()
    };
    this.salaryRecords.set(id, record);
    return record;
  }

  async updateSalaryStatus(id: number, status: string, txHash?: string): Promise<void> {
    const record = this.salaryRecords.get(id);
    if (record) {
      record.status = status;
      if (txHash) {
        record.txHash = txHash;
      }
      this.salaryRecords.set(id, record);
    }
  }
}

export const storage = new MemStorage();
