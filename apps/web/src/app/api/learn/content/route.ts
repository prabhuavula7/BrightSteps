import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getOrCreateLearnContent } from "@/server/learn/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const learn = await getOrCreateLearnContent(body);

    return NextResponse.json(learn);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid learn content request",
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to produce learn content" },
      { status: 500 },
    );
  }
}
