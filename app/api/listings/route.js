import { NextResponse } from "next/server";
import {
  deleteListing,
  getListing,
  listListings,
  saveListing,
  updateListing
} from "../../../lib/store";
import { generateForAll } from "../../../lib/generator";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const sessionId = searchParams.get("sessionId");

    if (id) {
      const item = await getListing(id);
      return item
        ? NextResponse.json({ ok: true, item })
        : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const items = await listListings(sessionId);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("listings get error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    let { input, outputs, sessionId, imageUrls } = body || {};
    if (!outputs && input) outputs = generateForAll(input);
    if (!outputs?.length) {
      return NextResponse.json({ ok: false, error: "Missing listing data" }, { status: 400 });
    }

    const item = await saveListing({
      sessionId: sessionId || input?.sessionId || "anon",
      input: input || {},
      outputs,
      imageUrls: imageUrls || []
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    console.error("listings post error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const body = await req.json();
    let { input, outputs, sessionId, imageUrls } = body || {};
    if (!outputs && input) outputs = generateForAll(input);
    if (!outputs?.length) {
      return NextResponse.json({ ok: false, error: "Missing listing data" }, { status: 400 });
    }

    const item = await updateListing(id, {
      sessionId: sessionId || input?.sessionId || "anon",
      input: input || {},
      outputs,
      imageUrls: imageUrls || []
    });
    return item
      ? NextResponse.json({ ok: true, item })
      : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("listings put error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const removed = await deleteListing(id);
    return removed
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("listings delete error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Server error" },
      { status: 500 }
    );
  }
}
