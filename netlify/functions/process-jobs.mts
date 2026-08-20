import type { Config } from "@netlify/functions";

/**
 * Job queue worker tick.
 *
 * The crawl, scoring and AI-visibility work runs through a database-backed
 * queue, and a queue with nothing driving it is just a table. The schedule for
 * this lived in `vercel.json`, which Netlify never reads — so on this host the
 * worker had simply never run. This is that schedule, expressed in the form
 * Netlify does read.
 *
 * The real work stays in the Next route: this only wakes it up, so both hosts
 * drive exactly the same code path.
 */
export default async function handler(): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("CRON_SECRET is not set; cannot drive the job queue");
    return new Response("CRON_SECRET missing", { status: 500 });
  }

  const origin = (process.env.URL ?? "https://vturnai.com").replace(/\/+$/, "");

  const response = await fetch(`${origin}/api/cron/process-jobs`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });

  const body = await response.text();
  if (!response.ok) {
    console.error("Job tick failed", response.status, body.slice(0, 500));
    return new Response(body, { status: response.status });
  }

  console.log("Job tick complete", body.slice(0, 500));
  return new Response(body, { status: 200 });
}

export const config: Config = {
  schedule: "*/5 * * * *",
};
