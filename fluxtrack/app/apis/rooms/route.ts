import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";

export const GET = handle(async () => {
  await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("id, room_code, building, floor_number, room_type, capacity, is_active")
    .eq("is_active", true)
    .order("floor_number")
    .order("room_code");
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ rooms: data ?? [] });
});
