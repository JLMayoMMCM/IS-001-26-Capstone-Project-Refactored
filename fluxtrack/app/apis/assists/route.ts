import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { nowUtc } from "@/lib/utils/date";

type AssistBody = {
  room_id: string;
  session_id?: string;
  assist_types: string[]; // ["room_facility", "medical", ...]
  note?: string;
};

export const GET = handle(async () => {
  await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assist_requests")
    .select(
      `*,
       faculty:users!assist_requests_faculty_id_fkey(full_name, email),
       room:rooms(room_code, building, floor_number)`,
    )
    .order("sent_at", { ascending: false })
    .limit(100);
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ assists: data ?? [] });
});

export const POST = handle(async (req) => {
  const user = await getCurrentUser();
  if (user.role !== "faculty") throw new ApiError("FORBIDDEN", "Only faculty can send assist requests");
  const body = (await req.json()) as AssistBody;

  if (!body?.room_id) throw new ApiError("VALIDATION", "room_id is required");
  if (!Array.isArray(body.assist_types) || body.assist_types.length === 0) {
    throw new ApiError("VALIDATION", "assist_types must be a non-empty array");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assist_requests")
    .insert({
      faculty_id: user.id,
      room_id: body.room_id,
      session_id: body.session_id ?? null,
      assist_types: body.assist_types.join(","),
      note: body.note ?? null,
      sent_at: nowUtc(),
    })
    .select()
    .single();

  if (error) throw new ApiError("INTERNAL", error.message);

  await auditLog({
    event_type: "ASSIST_REQUESTED",
    actor_id: user.id,
    target_type: "assist",
    target_id: data.id,
    payload: { room_id: body.room_id, assist_types: body.assist_types, note: body.note ?? null },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ assist: data }, { status: 201 });
});
