import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

const REQUIRED_HEADERS = [
  "course_code",
  "course_name",
  "section",
  "enrolled_count",
  "scheduled_modality",
  "day_of_week",
  "start_time",
  "end_time",
  "academic_term",
  "faculty_email",
  "room_code",
] as const;

type ImportError = { row: number; message: string };
type ImportResult = {
  inserted: number;
  rejected: number;
  errors: ImportError[];
  total_rows: number;
};

/**
 * POST /api/schedules/import (multipart with CSV file, or JSON {csv: "..."})
 *
 * Validates each row against rooms (by room_code) and users (by email).
 * Bulk inserts validated rows. Returns per-row error report for rejects.
 */
export const POST = handle(async (req) => {
  const user = await requireRole("ifo_admin", "system_admin");

  let csvText: string;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("VALIDATION", "file is required");
    csvText = await file.text();
  } else {
    const body = (await req.json()) as { csv?: string };
    if (!body?.csv) throw new ApiError("VALIDATION", "csv is required");
    csvText = body.csv;
  }

  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new ApiError("VALIDATION", "CSV is empty");

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new ApiError("VALIDATION", `Missing CSV headers: ${missing.join(", ")}`);
  }

  // Build header → index map
  const idx = Object.fromEntries(REQUIRED_HEADERS.map((h) => [h, headers.indexOf(h)])) as Record<
    (typeof REQUIRED_HEADERS)[number],
    number
  >;

  // Pre-resolve rooms + faculty for validation in one query each
  const supabase = await createClient();
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));

  const roomCodes = [...new Set(dataRows.map((r) => r[idx.room_code]?.trim()).filter(Boolean))];
  const emails    = [...new Set(dataRows.map((r) => r[idx.faculty_email]?.trim().toLowerCase()).filter(Boolean))];

  const [roomsRes, usersRes] = await Promise.all([
    supabase.from("rooms").select("id, room_code").in("room_code", roomCodes),
    supabase.from("users").select("id, email").in("email", emails),
  ]);
  if (roomsRes.error) throw new ApiError("INTERNAL", roomsRes.error.message);
  if (usersRes.error) throw new ApiError("INTERNAL", usersRes.error.message);

  const roomByCode  = new Map(roomsRes.data!.map((r) => [r.room_code, r.id]));
  const userByEmail = new Map(usersRes.data!.map((u) => [u.email.toLowerCase(), u.id]));

  const VALID_MODS  = new Set(["f2f", "blended", "online"]);
  const VALID_DAYS  = new Set(["mon", "tue", "wed", "thu", "fri", "sat"]);
  const TIME_RE     = /^\d{1,2}:\d{2}(:\d{2})?$/;

  const validRows: Array<{
    course_code: string; course_name: string; section: string | null;
    enrolled_count: number; scheduled_modality: "f2f" | "blended" | "online";
    day_of_week: "mon"|"tue"|"wed"|"thu"|"fri"|"sat";
    start_time: string; end_time: string; academic_term: string;
    faculty_id: string; room_id: string;
  }> = [];
  const errors: ImportError[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const lineNo = i + 2; // header is line 1
    try {
      const facultyEmail = row[idx.faculty_email]?.trim().toLowerCase();
      const facultyUserId = userByEmail.get(facultyEmail ?? "");
      if (!facultyUserId) throw new Error(`Unknown faculty email '${facultyEmail}'`);

      const roomCode = row[idx.room_code]?.trim();
      const roomId = roomByCode.get(roomCode ?? "");
      if (!roomId) throw new Error(`Unknown room_code '${roomCode}'`);

      const modality = row[idx.scheduled_modality]?.trim().toLowerCase();
      if (!VALID_MODS.has(modality)) throw new Error(`Invalid modality '${modality}'`);

      const day = row[idx.day_of_week]?.trim().toLowerCase();
      if (!VALID_DAYS.has(day)) throw new Error(`Invalid day_of_week '${day}'`);

      const startTime = row[idx.start_time]?.trim();
      const endTime   = row[idx.end_time]?.trim();
      if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
        throw new Error("start_time/end_time must be HH:MM[:SS]");
      }
      if (endTime <= startTime) throw new Error("end_time must be after start_time");

      const enrolled = parseInt(row[idx.enrolled_count]?.trim() ?? "0", 10);
      if (Number.isNaN(enrolled) || enrolled < 0) throw new Error("Invalid enrolled_count");

      validRows.push({
        course_code: row[idx.course_code].trim(),
        course_name: row[idx.course_name].trim(),
        section: row[idx.section]?.trim() || null,
        enrolled_count: enrolled,
        scheduled_modality: modality as "f2f" | "blended" | "online",
        day_of_week: day as "mon" | "tue" | "wed" | "thu" | "fri" | "sat",
        start_time: startTime,
        end_time: endTime,
        academic_term: row[idx.academic_term].trim(),
        faculty_id: facultyUserId,
        room_id: roomId,
      });
    } catch (err) {
      errors.push({ row: lineNo, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // Bulk insert validated rows via service-role to bypass RLS for the import
  let inserted = 0;
  if (validRows.length > 0) {
    const admin = createAdminClient();
    const { error: insErr } = await admin.from("schedules").insert(validRows);
    if (insErr) throw new ApiError("INTERNAL", `Bulk insert failed: ${insErr.message}`);
    inserted = validRows.length;
  }

  await auditLog({
    event_type: "SESSION_STARTED", // no dedicated event yet; reuse generic
    actor_id: user.id,
    target_type: "schedule",
    payload: { phase: "csv_import", inserted, rejected: errors.length, total_rows: dataRows.length },
    ip_address: getClientIp(req),
  });

  const result: ImportResult = {
    inserted,
    rejected: errors.length,
    errors,
    total_rows: dataRows.length,
  };
  return NextResponse.json(result);
});

/** Minimal RFC-4180 CSV parser (handles quoted fields with embedded commas + escaped quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// Schedule detail (PATCH) — handled in /api/schedules/[id]/route.ts (separate file)
