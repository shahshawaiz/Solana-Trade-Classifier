// Vercel serverless entry point.
// Re-exports the Express app from server.ts. server.ts detects process.env.VERCEL
// and skips app.listen() and the setInterval daemons (those don't work on serverless);
// background ticks are driven by Vercel Cron hitting /api/cron/tick instead.
import app from "../server";

export default app;
