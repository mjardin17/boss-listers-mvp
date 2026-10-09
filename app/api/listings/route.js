import { NextResponse } from "next/server";
import {
  deleteListing,
  getListing,
  listListings,
  saveListing,
  updateListing
} from "../../../lib/store";
import { generateForAll } from "../../../lib/generator";
import { withSession } from "../../../lib/requireSessionApp";

export const runtime = "nodejs";

// Every handler is login-gated and tenant-scoped: reads, updates and deletes
// only ever touch listings whose payload.tenantId equals the caller's tenant,
// and the tenant is taken from the session, never from the request body.

async function GET_handler(req, _context, session) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const sessionId = searchParams.get("sessionId");

    if (id) {
      const item = await getListing(id, session.tenantId);
      return item
        ? NextResponse.json({ ok: true, item })
        : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const items = await listListings(sessionId, session.tenantId);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("listings get error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Server error" },
      { status: 500 }
    );
  }
}

async function POST_handler(req, _context, session) {
  try {
    const body = await req.json();
    let { input, outputs, sessionId, imageUrls } = body || {};
    if (!outputs && input) outputs = generateForAll(input);
    if (!outputs?.length) {
      return NextResponse.json({ ok: false, error: "Missing listing data" }, { status: 400 });
    }

    const item = await saveListing({
      tenantId: session.tenantId,
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

async function PUT_handler(req, _context, session) {
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

    const item = await updateListing(
      id,
      {
        tenantId: session.tenantId,
        sessionId: sessionId || input?.sessionId || "anon",
        input: input || {},
        outputs,
        imageUrls: imageUrls || []
      },
      session.tenantId
    );
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

async function DELETE_handler(req, _context, session) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const removed = await deleteListing(id, session.tenantId);
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

export const GET = withSession(GET_handler);
export const POST = withSession(POST_handler);
export const PUT = withSession(PUT_handler);
export const DELETE = withSession(DELETE_handler);
