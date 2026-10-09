// booth_stt: แปลงเสียงเป็นข้อความ แยกตามคนพูด (ElevenLabs Scribe v2 + diarization)
// ใช้ร่วมกันโดย booth-transcribe (หน้าเว็บ BoothCRM) และ booth-line (คลิปเสียงใน LINE OA) — ต้องมี secret ELEVENLABS_API_KEY

export type SttLine = { speaker: string; text: string; start: number };
export type SttResult =
  | { ok: true; lines: SttLine[]; duration: number | null; language: string | null; ms: number }
  | { ok: false; error: string; ms: number };

const STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const NEW_LINE_GAP_SEC = 1.5; // a pause this long starts a new line even for the same speaker
export const BRAND_KEYTERMS = ["เอมโอชา", "Em-O-Cha", "แฟรนไชส์", "คอร์ปอเรท"];

// ElevenLabs accepts up to 100 terms of ≤ 50 characters and ≤ 5 words each.
export function cleanKeyterms(raw: unknown[]): string[] {
  return raw.map((k) => String(k ?? "").trim())
    .filter((k) => k && k.length <= 50 && k.split(/\s+/).length <= 5)
    .slice(0, 100);
}

function sttForm(file: Blob, name: string, keyterms: string[]): FormData {
  const f = new FormData();
  f.append("file", file, name || "audio");
  f.append("model_id", "scribe_v2");
  f.append("language_code", "tha");
  f.append("diarize", "true");
  f.append("tag_audio_events", "false");
  f.append("timestamps_granularity", "word");
  for (const k of keyterms) f.append("keyterms", k);
  return f;
}

// Words -> one line per speaker turn: "ผู้พูด 1", "ผู้พูด 2", ... in order of first appearance.
// deno-lint-ignore no-explicit-any
export function toLines(words: any[]): SttLine[] {
  const names = new Map<string, string>();
  const lines: SttLine[] = [];
  let cur: SttLine | null = null;
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

export async function transcribe(apiKey: string, file: Blob, name: string, keyterms: string[] = []): Promise<SttResult> {
  const t0 = Date.now();
  if (!apiKey) return { ok: false, error: "ยังไม่ได้ตั้งค่า ELEVENLABS_API_KEY", ms: 0 };
  try {
    const call = (terms: string[]) =>
      fetch(STT_URL, { method: "POST", headers: { "xi-api-key": apiKey }, body: sttForm(file, name, terms) });
    let res = await call(keyterms);
    // A rejected keyterm list shouldn't cost the whole transcript.
    if (res.status === 422 && keyterms.length) {
      console.warn("booth_stt keyterms rejected", (await res.text()).slice(0, 300));
      res = await call([]);
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error("booth_stt", res.status, detail);
      const error = res.status === 401 ? "ELEVENLABS_API_KEY ไม่ถูกต้อง หรือไม่มีสิทธิ์ Speech to Text"
        : res.status === 429 ? "บริการแปลงเสียงถูกจำกัดการใช้งานชั่วคราว"
        : res.status === 402 ? "เครดิต ElevenLabs หมด"
        : `แปลงเสียงไม่สำเร็จ (HTTP ${res.status})`;
      return { ok: false, error, ms: Date.now() - t0 };
    }
    const data = await res.json();
    const lines = toLines(Array.isArray(data.words) ? data.words : []);
    if (!lines.length && data.text) lines.push({ speaker: "ผู้พูด 1", text: String(data.text).trim(), start: 0 });
    return { ok: true, lines, duration: data.audio_duration_secs ?? null, language: data.language_code ?? null, ms: Date.now() - t0 };
  } catch (e) {
    console.error("booth_stt", e);
    return { ok: false, error: "ติดต่อบริการแปลงเสียงไม่ได้", ms: Date.now() - t0 };
  }
}
