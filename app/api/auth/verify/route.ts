import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const appPassword = process.env.APP_PASSWORD || "";

    if (!appPassword) {
      return NextResponse.json(
        { error: "APP_PASSWORD non configurata" },
        { status: 500 }
      );
    }

    if (typeof password !== "string" || password.trim().length === 0) {
      return NextResponse.json(
        { error: "Password mancante" },
        { status: 400 }
      );
    }

    if (password !== appPassword) {
      return NextResponse.json(
        { error: "Password non valida" },
        { status: 401 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Errore di autenticazione" },
      { status: 500 }
    );
  }
}
