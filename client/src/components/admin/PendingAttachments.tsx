import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Paperclip, ClipboardPaste } from "lucide-react";
import React from "react";

interface PendingLogMarkerData {
  // Renamed to avoid conflict
  id: string;
  blobId: string;
  sealLogId: string;
  timesheetId: string;
  timesheetCapId: string;
  employeeAddress: string;
  originalWorkLogData: any;
  timestamp: number;
  status: string;
}

interface PendingAttachmentsProps {
  pendingMarkersInput: string;
  setPendingMarkersInput: (value: string) => void;
  handleLoadAndSavePastedMarkers: () => Promise<void>;
  handleLoadAndProcessLatestFromStorage: () => Promise<void>; // New prop for the direct load & process
  pendingLogMarkers: PendingLogMarkerData[];
  attachLogMarkerMutationPending: boolean; // General mutation pending state
  isProcessingAttachmentId: string | null; // Specific item being processed
  onAttachLogMarker: (marker: PendingLogMarkerData) => void;
  isAdminWalletConnected: boolean;
}

export function PendingAttachments({
  pendingMarkersInput,
  setPendingMarkersInput,
  handleLoadAndSavePastedMarkers,
  handleLoadAndProcessLatestFromStorage,
  pendingLogMarkers,
  attachLogMarkerMutationPending,
  isProcessingAttachmentId,
  onAttachLogMarker,
  isAdminWalletConnected,
}: PendingAttachmentsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attach Pending Work Logs</CardTitle>
        <p className="text-sm text-muted-foreground">
          Admin: Paste JSON data (provided by employee after their checkout)
          into the textarea below to load and queue logs for on-chain
          attachment, or load directly from browser storage if available.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="pending-markers-input">
            Paste Log Marker Data (JSON string from employee)
          </Label>
          <Textarea
            id="pending-markers-input"
            rows={6}
            placeholder='Paste JSON string here, e.g., { "blobId": "...", ... } (or an array of them if employee provides multiple)'
            value={pendingMarkersInput}
            onChange={(e) => setPendingMarkersInput(e.target.value)}
          />
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={handleLoadAndSavePastedMarkers}
            disabled={
              !pendingMarkersInput.trim() || attachLogMarkerMutationPending
            }
          >
            <ClipboardPaste className="h-4 w-4 mr-2" /> Load & Save Pasted Data
          </Button>
          <Button
            variant="outline"
            onClick={handleLoadAndProcessLatestFromStorage}
            disabled={attachLogMarkerMutationPending}
          >
            Load & Process Latest from Browser Storage
          </Button>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">
            My Pending Attachments ({pendingLogMarkers.length})
          </h3>
          {pendingLogMarkers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No pending work logs in your local list. Paste data from an
              employee above or load from browser storage.
            </p>
          ) : (
            <div className="space-y-3">
              {pendingLogMarkers.map((marker) => (
                <Card key={marker.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="text-sm space-y-1">
                      <p>
                        <strong>Employee:</strong>{" "}
                        <span className="font-mono text-xs">
                          {marker.employeeAddress}
                        </span>
                      </p>
                      <p>
                        <strong>Timesheet ID:</strong>{" "}
                        <span className="font-mono text-xs">
                          {marker.timesheetId}
                        </span>
                      </p>
                      <p>
                        <strong>Blob ID:</strong>{" "}
                        <span className="font-mono text-xs">
                          {marker.blobId}
                        </span>
                      </p>
                      <p>
                        <strong>Seal Log ID:</strong>{" "}
                        <span className="font-mono text-xs">
                          {marker.sealLogId}
                        </span>
                      </p>
                      <p>
                        <strong>Logged At:</strong>{" "}
                        {new Date(marker.timestamp).toLocaleString()}
                      </p>
                      <details className="text-xs">
                        <summary>Original Log Data</summary>
                        <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                          {JSON.stringify(marker.originalWorkLogData, null, 2)}
                        </pre>
                      </details>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => onAttachLogMarker(marker)}
                      disabled={
                        isProcessingAttachmentId === marker.id ||
                        !isAdminWalletConnected
                      }
                    >
                      {isProcessingAttachmentId === marker.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Paperclip className="h-4 w-4 mr-2" />
                      )}
                      Attach Log
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
