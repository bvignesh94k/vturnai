import type { Config } from "@netlify/functions";

/**
 * Nightly maintenance — scheduled recrawls, usage rollups and digest
 * notifications. Same arrangement as the queue tick: Netlify supplies the
 * schedule, the Next route holds the behaviour.
 */
export default async function handler(): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("CRON_SECRET is not set; cannot run daily maintenance");
    return new Response("CRON_SECRET missing", { status: 500 });
  }

  const origin = (process.env.URL ?? "https://vturnai.com").replace(/\/+$/, "");

  const response = await fetch(`${origin}/api/cron/daily`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });

  const body = await response.text();
  if (!response.ok) {
    console.error("Daily run failed", response.status, body.slice(0, 500));
    return new Response(body, { status: response.status });
  }

  console.log("Daily run complete", body.slice(0, 500));
  return new Response(body, { status: 200 });
}

export const config: Config = {
  schedule: "15 2 * * *",
};
