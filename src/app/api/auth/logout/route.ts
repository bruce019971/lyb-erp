import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE } from "@/lib/app-session";

export async function POST() {
  const response = NextResponse.json({ data: true });
  response.cookies.set(APP_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
