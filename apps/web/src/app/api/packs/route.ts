import { listPackSummaries } from "@/lib/pack-loader";
import { NextResponse } from "next/server";

export async function GET() {
  const packs = await listPackSummaries();
  return NextResponse.json({ packs });
}
