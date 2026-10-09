// booth-transcribe: แปลงคลิปเสียงบทสนทนาหน้าบูธเป็นข้อความ แยกตามคนพูด (ElevenLabs Scribe v2 + diarization)
//
//   POST multipart/form-data: file (เสียง/วิดีโอ), keyterms (JSON array ของคำเฉพาะ เช่น ชื่อสาขา ไม่บังคับ)
//     -> { success, lines: [{ speaker: "ผู้พูด 1", text, start }], duration, language }
//
// หน้าเว็บ BoothCRM ส่งผลต่อให้ booth-extract (Claude) ระบุว่าใครคือพนักงาน/ลูกค้า และกรอกข้อมูล
// deploy ด้วย verify_jwt = false — ต้องตั้ง secret ELEVENLABS_API_KEY (สิทธิ์ Speech to Text)
// ไม่เก็บไฟล์เสียงไว้ที่ไหน ส่งต่อให้ ElevenLabs แล้วทิ้ง — โค้ดแปลงเสียงอยู่ที่ ../_shared/booth_stt.ts (ใช้ร่วมกับ booth-line)

import { cleanKeyterms, transcribe } from "../_shared/booth_stt.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";
const ALLOWED_ORIGINS = new Set(["https://em-o-cha.github.io"]);
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "https://em-o-cha.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "ใช้ POST เท่านั้น" }, 405);
  if (!ALLOWED_ORIGINS.has(req.headers.get("origin") || "")) return json({ success: false, error: "ไม่อนุญาต" }, 403);
  if (!ELEVENLABS_API_KEY) return json({ success: false, error: "ยังไม่ได้ตั้งค่า ELEVENLABS_API_KEY" }, 500);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ success: false, error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return json({ success: false, error: "ไม่มีไฟล์เสียง" }, 400);
  if (file.size > MAX_FILE_BYTES) return json({ success: false, error: "ไฟล์ใหญ่เกิน 25 MB" }, 413);
  let keyterms: string[] = [];
  try { keyterms = cleanKeyterms(JSON.parse(String(form.get("keyterms") || "[]"))); } catch { keyterms = []; }

  const r = await transcribe(ELEVENLABS_API_KEY, file, file.name, keyterms);
  return r.ok
    ? json({ success: true, lines: r.lines, duration: r.duration, language: r.language, ms: r.ms })
    : json({ success: false, error: r.error, ms: r.ms });
});
