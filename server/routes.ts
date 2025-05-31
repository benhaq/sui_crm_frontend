import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTimesheetSchema, insertTimesheetEmployeeSchema, insertWorkRecordSchema, insertSalaryRecordSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Timesheet routes
  app.get("/api/timesheets", async (req, res) => {
    try {
      const timesheets = await storage.getTimesheets();
      res.json(timesheets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch timesheets" });
    }
  });

  app.get("/api/timesheets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const timesheet = await storage.getTimesheet(id);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch timesheet" });
    }
  });

  app.post("/api/timesheets", async (req, res) => {
    try {
      const validated = insertTimesheetSchema.parse(req.body);
      const timesheet = await storage.createTimesheet(validated);
      res.status(201).json(timesheet);
    } catch (error) {
      res.status(400).json({ message: "Invalid timesheet data" });
    }
  });

  app.patch("/api/timesheets/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, txHash } = req.body;
      await storage.updateTimesheetStatus(id, status, txHash);
      res.json({ message: "Timesheet status updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update timesheet status" });
    }
  });

  // Timesheet employee routes
  app.get("/api/timesheets/:id/employees", async (req, res) => {
    try {
      const timesheetId = parseInt(req.params.id);
      const employees = await storage.getTimesheetEmployees(timesheetId);
      res.json(employees);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch timesheet employees" });
    }
  });

  app.post("/api/timesheets/:id/employees", async (req, res) => {
    try {
      const timesheetId = parseInt(req.params.id);
      const validated = insertTimesheetEmployeeSchema.parse({
        ...req.body,
        timesheetId
      });
      const employee = await storage.addEmployeeToTimesheet(validated);
      res.status(201).json(employee);
    } catch (error) {
      res.status(400).json({ message: "Invalid employee data" });
    }
  });

  // Work record routes
  app.get("/api/work-records", async (req, res) => {
    try {
      const { employeeAddress, timesheetId } = req.query;
      const records = await storage.getWorkRecords(
        employeeAddress as string,
        timesheetId ? parseInt(timesheetId as string) : undefined
      );
      res.json(records);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch work records" });
    }
  });

  app.post("/api/work-records", async (req, res) => {
    try {
      const validated = insertWorkRecordSchema.parse(req.body);
      const record = await storage.createWorkRecord(validated);
      res.status(201).json(record);
    } catch (error) {
      res.status(400).json({ message: "Invalid work record data" });
    }
  });

  app.patch("/api/work-records/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.updateWorkRecord(id, req.body);
      res.json({ message: "Work record updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update work record" });
    }
  });

  // Salary record routes
  app.get("/api/salary-records", async (req, res) => {
    try {
      const { employeeAddress } = req.query;
      const records = await storage.getSalaryRecords(employeeAddress as string);
      res.json(records);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch salary records" });
    }
  });

  app.post("/api/salary-records", async (req, res) => {
    try {
      const validated = insertSalaryRecordSchema.parse(req.body);
      const record = await storage.createSalaryRecord(validated);
      res.status(201).json(record);
    } catch (error) {
      res.status(400).json({ message: "Invalid salary record data" });
    }
  });

  app.patch("/api/salary-records/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, txHash } = req.body;
      await storage.updateSalaryStatus(id, status, txHash);
      res.json({ message: "Salary record status updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update salary status" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
