// lib/xlsxLoader.js
//
// The spreadsheet library is big, so it is loaded on demand. Loading it INSIDE the export tap (`await import("xlsx")`) used up the tap
// before the file was ready, so a phone could not open its share sheet (2026-10-24 phone review). Screens that have an export button
// call preloadXlsx() when they open; the tap then finds the library already here and builds the file without waiting.
let mod = null;
let pending = null;
export function preloadXlsx() {
  if (!pending) pending = import('xlsx').then((m) => { mod = m; return m; }).catch(() => { pending = null; return null; });
  return pending;
}
/** The library if it has already arrived, else null. */
export const loadedXlsx = () => mod;
/** The library, from the cache when it is there. */
export async function getXlsx() { return mod || preloadXlsx(); }
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** A workbook as a Blob, built synchronously. */
export function workbookBlob(XLSX, wb) {
  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: XLSX_MIME });
}
