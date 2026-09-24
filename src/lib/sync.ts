import { getSource, importRows, listSources, reconcileActiveSourceRows, recordSourceSync } from "@/lib/db";
import { readSheetRows } from "@/lib/sheet";

export async function syncSource(sourceId: string) {
  const source = getSource(sourceId);
  if (!source) throw new Error("Source not found.");
  if (!source.isActive) return { sourceId, skipped: true, imported: { upcoming: 0, inTransit: 0 } };
  try {
    const [upcoming, inTransit] = await Promise.all([
      readSheetRows(source.spreadsheetId, source.upcomingTab),
      readSheetRows(source.spreadsheetId, source.inTransitTab),
    ]);
    const importedUpcoming = importRows(source, "upcoming", source.upcomingTab, upcoming.rows);
    const importedTransit = importRows(source, "in_transit", source.inTransitTab, inTransit.rows);
    reconcileActiveSourceRows(source.id, [...importedUpcoming.externalKeys, ...importedTransit.externalKeys]);
    recordSourceSync(source.id, null);
    return {
      sourceId,
      displayName: source.displayName,
      skipped: false,
      imported: { upcoming: importedUpcoming.imported, inTransit: importedTransit.imported },
      headers: { upcoming: upcoming.headers, inTransit: inTransit.headers },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync source.";
    recordSourceSync(source.id, message);
    throw new Error(message);
  }
}

export async function syncSourceBySpreadsheetId(spreadsheetId: string) {
  const allSources = listSources();
  const matched = allSources.find(
    (s) => s.spreadsheetId === spreadsheetId || s.spreadsheetUrl.includes(spreadsheetId),
  );
  if (!matched) {
    throw new Error(`No configured source found for spreadsheet ID: ${spreadsheetId}`);
  }
  return syncSource(matched.id);
}

export async function syncAllActiveSources() {
  const activeSources = listSources().filter((source) => source.isActive);
  const results = await Promise.allSettled(activeSources.map((source) => syncSource(source.id)));
  return results.map((result, index) =>
    result.status === "fulfilled"
      ? { ok: true, ...result.value }
      : {
          sourceId: activeSources[index].id,
          displayName: activeSources[index].displayName,
          ok: false,
          error: result.reason instanceof Error ? result.reason.message : "Unable to sync source.",
        },
  );
}
