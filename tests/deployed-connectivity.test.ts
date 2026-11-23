import { describe, it, expect } from "vitest";
import { openwaClient } from "../backend/notifications/openwa";
import { dbManager } from "../backend/database/client";
import { defaultDispatcher } from "../backend/notifications/dispatcher";

describe("Deployed Backend Connectivity & Diagnostic Tests", () => {
  it("verifies Database Manager status and configuration schema", async () => {
    const status = await dbManager.getDatabaseStatus();
    expect(status).toBeDefined();
    expect(status.status).toBe("STABILIZED");
    expect(typeof status.schoolsDbConfigured).toBe("boolean");
    expect(typeof status.commerceDbConfigured).toBe("boolean");
    expect(status.activeDriver).toBeDefined();
    expect(status.activeEntities).toBeDefined();
    expect(status.telemetry).toBeDefined();
  });

  it("verifies OpenWA Client diagnostic and session endpoint structure", async () => {
    const sessionStatus = await openwaClient.getSessionStatus();
    expect(sessionStatus).toBeDefined();
    expect(sessionStatus.sessionId).toBeDefined();
    expect(["CONNECTED", "WORKING", "QR_READY", "SCAN_QR_CODE", "DISCONNECTED", "STARTING", "STOPPED", "SIMULATION"]).toContain(sessionStatus.status);
  });

  it("verifies OpenWA phone number formatter for domestic Indian mobile numbers", () => {
    expect(openwaClient.formatChatId("6303157119")).toBe("916303157119@c.us");
    expect(openwaClient.formatChatId("+91 63031 57119")).toBe("916303157119@c.us");
    expect(openwaClient.formatChatId("06303157119")).toBe("916303157119@c.us");
  });

  it("verifies end-to-end WhatsApp notification dispatch and outbox ledger recording", async () => {
    const testResult = await defaultDispatcher.sendWhatsApp({
      to: "916303157119",
      templateName: "connectivity_verification_test",
      fallbackText: "ThinkOva Automated Verification Ping",
      metadata: { test: true, timestamp: Date.now() },
    });

    expect(testResult).toBeDefined();
    expect(testResult.id).toBeDefined();
    expect(testResult.to).toBe("916303157119");
    expect(["SENT", "FAILED"]).toContain(testResult.status);

    const outbox = defaultDispatcher.getWhatsAppOutbox("916303157119");
    expect(outbox.length).toBeGreaterThan(0);
    expect(outbox[0]?.id).toBe(testResult.id);
  });

  it("verifies persistent notification retrieval fallback", async () => {
    const notifications = await defaultDispatcher.getPersistentNotifications({ limit: 5 });
    expect(Array.isArray(notifications)).toBe(true);
  });
});
