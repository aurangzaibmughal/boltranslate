import { NextRequest, NextResponse } from "next/server";
import { turso, ensureTable } from "@/lib/turso";

export async function GET() {
  try {
    await ensureTable();
    const result = await turso.execute(
      "SELECT id, urdu_text, english_text, timestamp, is_favorite, audio_duration FROM translations ORDER BY id DESC LIMIT 100;"
    );

    const items = result.rows.map((row) => ({
      id: String(row.id),
      urduText: String(row.urdu_text || ""),
      englishText: String(row.english_text || ""),
      timestamp: row.timestamp
        ? new Date(String(row.timestamp)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "Recent",
      isFavorite: Boolean(row.is_favorite),
      audioDuration: Number(row.audio_duration || 0),
    }));

    return NextResponse.json(items);
  } catch (err: unknown) {
    console.error("Turso GET /api/history error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json();
    const urdu = body.urdu || body.urduText || "";
    const english = body.english || body.englishText || "";
    const isFavorite = body.isFavorite ? 1 : 0;
    const audioDuration = body.audioDuration || 0.0;

    if (!urdu && !english) {
      return NextResponse.json({ error: "Empty translation" }, { status: 400 });
    }

    const result = await turso.execute({
      sql: "INSERT INTO translations (urdu_text, english_text, is_favorite, audio_duration) VALUES (?, ?, ?, ?) RETURNING id, timestamp;",
      args: [urdu, english, isFavorite, audioDuration],
    });

    const newId = result.rows[0]?.id ? String(result.rows[0].id) : String(Date.now());

    return NextResponse.json({
      id: newId,
      urduText: urdu,
      englishText: english,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isFavorite: Boolean(isFavorite),
      audioDuration,
    });
  } catch (err: unknown) {
    console.error("Turso POST /api/history error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      await turso.execute({
        sql: "DELETE FROM translations WHERE id = ?;",
        args: [id],
      });
      return NextResponse.json({ success: true, deletedId: id });
    } else {
      await turso.execute("DELETE FROM translations;");
      return NextResponse.json({ success: true, message: "All records deleted" });
    }
  } catch (err: unknown) {
    console.error("Turso DELETE /api/history error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");

    if (!id) {
      const body = await req.json();
      id = body.id;
    }

    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    await turso.execute({
      sql: "UPDATE translations SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?;",
      args: [id],
    });

    return NextResponse.json({ success: true, toggledId: id });
  } catch (err: unknown) {
    console.error("Turso PATCH /api/history error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
