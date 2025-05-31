import { pgTable, text, serial, integer, boolean, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("employee"), // 'admin' or 'employee'
  walletAddress: text("wallet_address").unique(),
});

export const timesheets = pgTable("timesheets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  period: text("period").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'confirmed'
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
});

export const timesheetEmployees = pgTable("timesheet_employees", {
  id: serial("id").primaryKey(),
  timesheetId: integer("timesheet_id").references(() => timesheets.id).notNull(),
  employeeAddress: text("employee_address").notNull(),
  employeeName: text("employee_name"),
  hourlyRate: decimal("hourly_rate", { precision: 18, scale: 8 }),
  addedAt: timestamp("added_at").defaultNow(),
});

export const workRecords = pgTable("work_records", {
  id: serial("id").primaryKey(),
  employeeAddress: text("employee_address").notNull(),
  timesheetId: integer("timesheet_id").references(() => timesheets.id),
  checkIn: timestamp("check_in").notNull(),
  checkOut: timestamp("check_out"),
  date: text("date").notNull(),
  totalHours: decimal("total_hours", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("in-progress"), // 'in-progress', 'completed'
});

export const salaryRecords = pgTable("salary_records", {
  id: serial("id").primaryKey(),
  employeeAddress: text("employee_address").notNull(),
  timesheetId: integer("timesheet_id").references(() => timesheets.id),
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
  period: text("period").notNull(),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("pending"), // 'pending', 'confirmed'
  claimedAt: timestamp("claimed_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

export const insertTimesheetSchema = createInsertSchema(timesheets).omit({
  id: true,
  createdAt: true,
});

export const insertTimesheetEmployeeSchema = createInsertSchema(timesheetEmployees).omit({
  id: true,
  addedAt: true,
});

export const insertWorkRecordSchema = createInsertSchema(workRecords).omit({
  id: true,
});

export const insertSalaryRecordSchema = createInsertSchema(salaryRecords).omit({
  id: true,
  claimedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Timesheet = typeof timesheets.$inferSelect;
export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;

export type TimesheetEmployee = typeof timesheetEmployees.$inferSelect;
export type InsertTimesheetEmployee = z.infer<typeof insertTimesheetEmployeeSchema>;

export type WorkRecord = typeof workRecords.$inferSelect;
export type InsertWorkRecord = z.infer<typeof insertWorkRecordSchema>;

export type SalaryRecord = typeof salaryRecords.$inferSelect;
export type InsertSalaryRecord = z.infer<typeof insertSalaryRecordSchema>;
