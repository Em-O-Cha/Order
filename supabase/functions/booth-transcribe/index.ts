// booth-transcribe: แปลงคลิปเสียงบทสนทนาหน้าบูธเป็นข้อความ แยกตามคนพูด (ElevenLabs Scribe v2 + diarization)
//
//   POST multipart/form-data: file (เสียง/วิดีโอ), keyterms (JSON array ของคำเฉพาะ เช่น ชื่อสาขา ไม่บังคับ)
//     -> { success, lines: [{ speaker: "ผู้พูด 1", text, start }], duration, language }
//
// หน้าเว็บ BoothCRM ส่งผลต่อให้ booth-extract (Claude) ระบุว่าใครคือพนักงาน/ลูกค้า และกรอกข้อมูล
// deploy ด้วย verify_jwt = false — ต้องตั้ง secret ELEVENLABS_API_KEY (สิทธิ์ Speech to Text)
// ไม่เก็บไฟล์เสียงไว้ที่ไหน ส่งต่อให้ ElevenLabs แล้วทิ้ง

type Json = Record<string, any>;

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";
const STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const ALLOWED_ORIGINS = new Set(["https://em-o-cha.github.io"]);
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const NEW_LINE_GAP_SEC = 1.5; // a pause this long starts a new line even for the same speaker

const CORS = {
  "Access-Control-Allow-Origin": "https://em-o-cha.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

function sttForm(file: File, keyterms: string[]): FormData {
  const f = new FormData();
  f.append("file", file, file.name || "audio");
  f.append("model_id", "scribe_v2");
  f.append("language_code", "tha");
  f.append("diarize", "true");
  f.append("tag_audio_events", "false");
  f.append("timestamps_granularity", "word");
  for (const k of keyterms) f.append("keyterms", k);
  return f;
}

// Words -> one line per speaker turn: "ผู้พูด 1", "ผู้พูด 2", ... in order of first appearance.
function toLines(words: Json[]): Json[] {
  const names = new Map<string, string>();
  const lines: Json[] = [];
  let cur: Json | null = null;
  let lastEnd = 0;
  for (const w of words) {
    if (w.type !== "word" && w.type !== "spacing") continue;
    const id = String(w.speaker_id ?? "speaker_0");
    if (!names.has(id)) names.set(id, `ผู้พูด ${names.size + 1}`);
    const speaker = names.get(id)!;
    const gap = typeof w.start === "number" ? w.start - lastEnd : 0;
    if (w.type === "word" && (!cur || cur.speaker !== speaker || gap > NEW_LINE_GAP_SEC)) {
      cur = { speaker, text: "", start: w.start ?? 0 };
      lines.push(cur);
    }
    if (cur) cur.text += String(w.text ?? "");
    if (typeof w.end === "number") lastEnd = w.end;
  }
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() })).filter((l) => l.text);
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
  try {
    keyterms = (JSON.parse(String(form.get("keyterms") || "[]")) as unknown[])
      .map((k) => String(k ?? "").trim())
      .filter((k) => k && k.length <= 50 && k.split(/\s+/).length <= 5)
      .slice(0, 100);
  } catch { keyterms = []; }

  const t0 = Date.now();
  try {
    const call = (terms: string[]) =>
      fetch(STT_URL, { method: "POST", headers: { "xi-api-key": ELEVENLABS_API_KEY }, body: sttForm(file, terms) });
    let res = await call(keyterms);
    // A rejected keyterm list shouldn't cost the whole transcript.
    if (res.status === 422 && keyterms.length) {
      console.warn("booth-transcribe keyterms rejected", (await res.text()).slice(0, 300));
      res = await call([]);
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error("booth-transcribe", res.status, detail);
      const msg = res.status === 401 ? "ELEVENLABS_API_KEY ไม่ถูกต้อง หรือไม่มีสิทธิ์ Speech to Text"
        : res.status === 429 ? "บริการแปลงเสียงถูกจำกัดการใช้งานชั่วคราว"
        : res.status === 402 ? "เครดิต ElevenLabs หมด"
        : `แปลงเสียงไม่สำเร็จ (HTTP ${res.status})`;
      return json({ success: false, error: msg, ms: Date.now() - t0 });
    }
    const data = await res.json();
    const lines = toLines(Array.isArray(data.words) ? data.words : []);
    if (!lines.length && data.text) lines.push({ speaker: "ผู้พูด 1", text: String(data.text).trim(), start: 0 });
    return json({
      success: true, lines, duration: data.audio_duration_secs ?? null, language: data.language_code ?? null, ms: Date.now() - t0,
    });
  } catch (e) {
    console.error("booth-transcribe", e);
    return json({ success: false, error: "ติดต่อบริการแปลงเสียงไม่ได้", ms: Date.now() - t0 });
  }
});
