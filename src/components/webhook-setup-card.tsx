"use client";

import { useEffect, useState } from "react";

export function WebhookSetupCard() {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const scriptCode = `/**
 * Google Apps Script - Real-Time Push Trigger for Dispatch Desk
 * Add this under Extensions > Apps Script in your Google Sheet.
 */
function onEdit(e) {
  var spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  var webhookUrl = "${origin}/api/webhooks/sheets?spreadsheetId=" + spreadsheetId;
  
  try {
    UrlFetchApp.fetch(webhookUrl, {
      method: "post",
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("Webhook sync error: " + err);
  }
}`;

  function handleCopy() {
    navigator.clipboard?.writeText(scriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <div className="panel-header">
        <div>
          <h2>⚡ Instant Real-Time Push Setup (Under 1s Sync)</h2>
          <p className="eyebrow">
            Make Google Sheets push updates instantly whenever an employee changes any cell.
          </p>
        </div>
        <button
          type="button"
          className={`button ${copied ? "success" : "primary"}`}
          onClick={handleCopy}
        >
          {copied ? "✓ Copied Script!" : "📋 Copy Apps Script"}
        </button>
      </div>
      <div className="panel-body">
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-secondary)" }}>
            By default, Dispatch Desk automatically polls your sheets every 15s in the background. To get{" "}
            <strong>instantaneous (&lt; 1 sec) real-time updates</strong> the moment staff edit a dropdown:
          </p>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: "var(--ink)" }}>
            <li>
              Open your Google Sheet (Blinkit, Flipkart, or Swiggy) and click <strong>Extensions &gt; Apps Script</strong>.
            </li>
            <li>Delete any default code, paste the script snippet below, and click <strong>Save (💾)</strong>.</li>
            <li>
              <em>Done!</em> Whenever an employee updates a cell or dropdown, Google Sheets will automatically ping Dispatch Desk immediately.
            </li>
          </ol>
          <div className="code-box">{scriptCode}</div>
        </div>
      </div>
    </section>
  );
}

