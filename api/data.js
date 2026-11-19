import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = new Redis({ url, token });
const KEY = "isbm-state";

export default async function handler(req, res) {
  try {
    if (!url || !token) return res.status(500).json({ error: "Redis-Zugangsdaten fehlen" });
    if (req.method === "GET") {
      const data = await redis.get(KEY);
      return res.status(200).json(data ?? null);
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      await redis.set(KEY, body);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
