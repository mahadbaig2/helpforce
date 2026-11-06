import { handle } from "@/lib/api-handler";

// Local mock API. All rules live in lib/api-handler.ts and lib/store.ts.
type Context = { params: Promise<{ path?: string[] }> };

export async function GET(req: Request, ctx: Context) {
  return handle(req, (await ctx.params).path ?? []);
}

export async function POST(req: Request, ctx: Context) {
  return handle(req, (await ctx.params).path ?? []);
}
