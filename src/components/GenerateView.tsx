import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ELEVEN_VOICES,
  GENERATORS,
  MAX_IMAGE_BYTES,
  MAX_SPEECH_CHARS,
  estimateCost,
  formatCost,
  lyriaPrompt,
  type ElevenVoice,
  type GenerateRequest,
  type GeneratorId,
} from "../../shared/generate";
import type { AppStatus, Sound } from "../../shared/types";
import { api } from "../api";
import { useApp } from "../state";
import { SoundCard } from "./SoundCard";

const DRAMA_DIRECTIONS = ["whispering", "nervous", "angry", "shouting", "crying", "laughing", "exhausted", "pause"];
const ELEVEN_TAGS = ["whispers", "sighs", "laughs", "crying", "excited", "sad", "angry", "pause"];

/** Text with quick-insert [tags], dropped in where the cursor is. */
function DirectedText({ value, onChange, tags, label, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  tags: string[];
  label: string;
  placeholder: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);

  function insert(tag: string) {
    const element = box.current;
    const at = element?.selectionStart ?? value.length;
    const text = `[${tag}] `;
    onChange(`${value.slice(0, at)}${text}${value.slice(element?.selectionEnd ?? at)}`);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(at + text.length, at + text.length);
    });
  }

  return (
    <>
      <label className="field">
        <span>{label}</span>
        <textarea ref={box} rows={6} maxLength={MAX_SPEECH_CHARS} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </label>
      <div className="chips small">
        {tags.map((tag) => <button type="button" key={tag} onClick={() => insert(tag)}>[{tag}]</button>)}
      </div>
    </>
  );
}

function LyriaForm({ onChange }: { onChange: (request: GenerateRequest | null) => void }) {
  const { notify } = useApp();
  const [prompt, setPrompt] = useState("");
  const [mood, setMood] = useState("");
  const [instruments, setInstruments] = useState("");
  const [bpm, setBpm] = useState("");
  const [instrumental, setInstrumental] = useState(true);
  const [seed, setSeed] = useState("");
  const [image, setImage] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => {
    if (prompt.trim().length < 3) return onChange(null);
    onChange({
      generator: "lyria-clip",
      prompt,
      mood,
      instruments,
      instrumental,
      ...(Number(bpm) > 0 ? { bpm: Number(bpm) } : {}),
      ...(seed !== "" ? { seed: Number(seed) } : {}),
      ...(image ? { image: image.url } : {}),
    });
  }, [prompt, mood, instruments, bpm, instrumental, seed, image, onChange]);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return notify("That image is over 5 MB.", true);
    const reader = new FileReader();
    reader.onload = () => setImage({ name: file.name, url: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <>
      <label className="field">
        <span>Describe the music</span>
        <textarea rows={3} maxLength={1000} value={prompt} placeholder="A fragile piano theme for a man alone in an empty school…" onChange={(event) => setPrompt(event.target.value)} />
      </label>
      <div className="field-row">
        <label className="field"><span>Mood</span><input value={mood} maxLength={120} placeholder="Melancholic, tender" onChange={(event) => setMood(event.target.value)} /></label>
        <label className="field"><span>Instruments</span><input value={instruments} maxLength={200} placeholder="Felt piano, solo cello" onChange={(event) => setInstruments(event.target.value)} /></label>
        <label className="field narrow"><span>BPM</span><input type="number" min={20} max={300} value={bpm} placeholder="72" onChange={(event) => setBpm(event.target.value)} /></label>
        <label className="field narrow" title="The same seed and prompt aim for a similar result"><span>Seed</span><input type="number" min={0} max={2147483647} value={seed} placeholder="Any" onChange={(event) => setSeed(event.target.value)} /></label>
      </div>
      <div className="field-options">
        <label><input type="checkbox" checked={instrumental} onChange={(event) => setInstrumental(event.target.checked)} /> Instrumental only</label>
        <label className="text">
          {image ? `Picture: ${image.name}` : "Add a picture for mood…"}
          <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={pick} />
        </label>
        {image && <button type="button" className="text quiet" onClick={() => setImage(null)}>Remove</button>}
      </div>
      {prompt.trim().length >= 3 && <p className="hint">Sends: {lyriaPrompt({ generator: "lyria-clip", prompt, mood, instruments, instrumental, ...(Number(bpm) > 0 ? { bpm: Number(bpm) } : {}) })}</p>}
    </>
  );
}

function DramaForm({ onChange }: { onChange: (request: GenerateRequest | null) => void }) {
  const [text, setText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [voice, setVoice] = useState("");

  useEffect(() => {
    onChange(text.trim().length < 2 ? null : { generator: "drama-3", text, instructions, voice: voice.trim() });
  }, [text, instructions, voice, onChange]);

  return (
    <>
      <DirectedText
        label="Script"
        value={text}
        onChange={setText}
        tags={DRAMA_DIRECTIONS}
        placeholder="[whispering] Nobody answered. [pause] [nervous] Is someone there?"
      />
      <div className="field-row">
        <label className="field"><span>Direction for the whole take</span><input value={instructions} maxLength={500} placeholder="Tired, close to the microphone" onChange={(event) => setInstructions(event.target.value)} /></label>
        <label className="field" title="OpenRouter doesn't list Fish voices. Paste an id from Fish Audio, or leave blank."><span>Fish voice id (optional)</span><input value={voice} maxLength={64} placeholder="Default voice" onChange={(event) => setVoice(event.target.value)} /></label>
      </div>
    </>
  );
}

function ElevenForm({ onChange }: { onChange: (request: GenerateRequest | null) => void }) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<ElevenVoice>("george");

  useEffect(() => {
    onChange(text.trim().length < 2 ? null : { generator: "eleven-v4", text, voice });
  }, [text, voice, onChange]);

  return (
    <>
      <DirectedText
        label="Script, in any language"
        value={text}
        onChange={setText}
        tags={ELEVEN_TAGS}
        placeholder="[sighs] I used to walk this corridor every day. [whispers] It's so much smaller now."
      />
      <div className="field-row">
        <label className="field">
          <span>Voice</span>
          <select value={voice} onChange={(event) => setVoice(event.target.value as ElevenVoice)}>
            {ELEVEN_VOICES.map((name) => <option key={name} value={name}>{name[0]!.toUpperCase() + name.slice(1)}</option>)}
          </select>
        </label>
      </div>
    </>
  );
}

export function GenerateView({ status }: { status: AppStatus | null }) {
  const { notify } = useApp();
  const [generator, setGenerator] = useState<GeneratorId>("lyria-clip");
  const [request, setRequest] = useState<GenerateRequest | null>(null);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = status?.generation.available ?? false;

  useEffect(() => {
    void api.generated().then(setSounds).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!request || busy) return;
    setBusy(true);
    setError(null);
    try {
      const sound = await api.generate(request);
      setSounds((current) => [sound, ...current]);
      notify("Take saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(sound: Sound) {
    if (!window.confirm(`Delete "${sound.title}"? You paid for this take, and it can't be restored.`)) return;
    await api.deleteGenerated(sound.nativeId);
    setSounds((current) => current.filter((item) => item.id !== sound.id));
  }

  const info = GENERATORS[generator];
  return (
    <>
      <header className="page"><h1>Generate</h1></header>
      <p className="hint generate-intro">The hunt comes first, but when nothing fits, sketch it. Uses your own OpenRouter credit.</p>

      {status && !available && (
        <p className="note">Add <code>OPENROUTER_API_KEY</code> to <code>.env</code> and restart to turn this on.</p>
      )}

      <div className="segments" role="group" aria-label="Model">
        {Object.values(GENERATORS).map((item) => (
          <button key={item.id} type="button" className={generator === item.id ? "on" : ""} onClick={() => { setGenerator(item.id); setRequest(null); setError(null); }}>
            {item.name}
          </button>
        ))}
      </div>
      <p className="hint generate-blurb">{info.maker}. {info.blurb}</p>

      <form className="generate" onSubmit={(event) => void submit(event)}>
        {generator === "lyria-clip" && <LyriaForm onChange={setRequest} />}
        {generator === "drama-3" && <DramaForm onChange={setRequest} />}
        {generator === "eleven-v4" && <ElevenForm onChange={setRequest} />}
        <div className="generate-submit">
          <button className="primary" disabled={!available || !request || busy}>
            {busy ? "Generating…" : request ? `Generate · ${formatCost(estimateCost(request))}` : "Generate"}
          </button>
          <span className="hint">
            {generator === "lyria-clip" ? "Your words and any picture go to OpenRouter and Google." : `Your script goes to OpenRouter and ${info.maker}. Don't imitate a real person's voice.`}
          </span>
        </div>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      <p className="note">
        Rights not verified. The terms we checked don't clearly grant commercial rights for audio made through OpenRouter, so generated
        sounds aren't marked as cleared. Check each model's terms before a commercial release.
      </p>

      {sounds.length > 0 && (
        <div className="results">
          {sounds.map((sound) => <SoundCard key={sound.id} sound={sound} queue={sounds} onRemove={() => void remove(sound)} />)}
        </div>
      )}
    </>
  );
}
