import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("xlaunch_x_session");
  response.cookies.delete("xlaunch_x_oauth");
  return response;
}
