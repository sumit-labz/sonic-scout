// A hand-checked catalogue of free instruments for scoring in Ableton Live.
// Researched 7 November 2026. Prices and terms change, so the card links go to the maker.

export type FamilyId =
  | "orchestra" | "strings" | "winds" | "piano" | "keys" | "choir" | "drums"
  | "percussion" | "guitar" | "world" | "synth" | "texture" | "players";

export const FAMILIES: Array<{ id: FamilyId; name: string; hue: number }> = [
  { id: "orchestra", name: "Full orchestra", hue: 12 },
  { id: "strings", name: "Strings", hue: 32 },
  { id: "winds", name: "Brass and woodwind", hue: 48 },
  { id: "piano", name: "Piano", hue: 200 },
  { id: "keys", name: "Keys and organ", hue: 225 },
  { id: "choir", name: "Choir and voice", hue: 280 },
  { id: "drums", name: "Drum kits", hue: 350 },
  { id: "percussion", name: "Percussion and bells", hue: 330 },
  { id: "guitar", name: "Guitar and bass", hue: 90 },
  { id: "world", name: "World instruments", hue: 160 },
  { id: "synth", name: "Synths", hue: 255 },
  { id: "texture", name: "Drones and textures", hue: 185 },
  { id: "players", name: "Players to install first", hue: 0 },
];

export type HostId = "plugin" | "splice" | "kontakt" | "sine" | "decent" | "sfz" | "soundpaint" | "synchron";

export const HOSTS: Record<HostId, string> = {
  plugin: "Own plugin",
  splice: "Splice INSTRUMENT",
  kontakt: "Kontakt Player",
  sine: "SINE Player",
  decent: "Decent Sampler",
  sfz: "sforzando",
  soundpaint: "Soundpaint",
  synchron: "Synchron Player",
};

// How far the commercial-use claim has been checked. Only "open" and "stated" rest on the
// licence itself; "reported" is a reviewer's word; "credit" also needs a credit line.
export type RightsLevel = "open" | "stated" | "reported" | "credit" | "check";

export const RIGHTS: Record<RightsLevel, { label: string; detail: string }> = {
  open: { label: "Open licence", detail: "Open-source or public-domain licence. What you make with it is yours." },
  stated: { label: "Commercial use stated", detail: "The maker's own terms say it can be used in commercial music." },
  reported: { label: "Reported cleared", detail: "Bedroom Producers Blog says it checked commercial use with the developer. The licence itself wasn't read for this list." },
  credit: { label: "Credit required", detail: "Usable, but the licence asks for a credit." },
  check: { label: "Read the licence", detail: "Commercial use not confirmed. Read the licence before using it in paid work." },
};

export interface Instrument {
  id: string;
  name: string;
  maker: string;
  family: FamilyId;
  blurb: string;
  url: string;
  host: HostId;
  os: string;
  rights: RightsLevel;
  /** Needs a free account or email sign-up. */
  account?: boolean;
  size?: string;
  image?: string;
  /** Something to know before installing. */
  caution?: string;
  /** Start here within its family. */
  pick?: boolean;
}

const BOTH = "Windows, Mac";
const ALL = "Windows, Mac, Linux";
const START = "https://www.native-instruments.com/products/komplete-start";
const MONSTER = "https://www.agushardiman.tv/";

const CORE: Instrument[] = [
  // Players
  { id: "splice-instrument", name: "Splice INSTRUMENT", maker: "Splice", family: "players", blurb: "The free plugin that took over from Spitfire LABS. It plays all the Splice packs listed here, and finds LABS packs you already own.", url: "https://splice.com/instrument", host: "plugin", os: BOTH, rights: "check", account: true, pick: true, caution: "Paid packs sit next to free ones, so check for the Free label before you get attached." },
  { id: "komplete-start", name: "Komplete Start", maker: "Native Instruments", family: "players", blurb: "Free bundle with Kontakt Player, Massive XL Player, Kontakt instruments and effects. Installs through Native Access.", url: START, host: "plugin", os: BOTH, rights: "stated", account: true, pick: true },
  { id: "decent-sampler", name: "Decent Sampler", maker: "Decent Samples", family: "players", blurb: "Free sampler that plays thousands of community libraries, including most of Pianobook.", url: "https://www.decentsamples.com/product/decent-sampler-plugin/", host: "plugin", os: ALL, rights: "check", account: true, image: "https://www.decentsamples.com/wp-content/uploads/2020/06/Decent-Sampler-Cover-Idea-2.jpg", pick: true },
  { id: "pianobook", name: "Pianobook", maker: "Pianobook community", family: "players", blurb: "A huge community archive of free sampled instruments. Good for odd, personal sounds. Every pack has its own terms.", url: "https://www.pianobook.co.uk/", host: "decent", os: ALL, rights: "check", account: true, caution: "Too many packs to list one by one. Check the terms on each pack." },
  { id: "sforzando", name: "sforzando", maker: "Plogue", family: "players", blurb: "Free SFZ player, needed for Virtual Playing Orchestra, Sonatina and VSCO 2. VST3 on Windows.", url: "https://www.plogue.com/products/sforzando.html", host: "plugin", os: ALL, rights: "check", image: "https://www.plogue.com/images/Sforzando_interface_1.png" },
  { id: "sine-player", name: "SINE Player", maker: "Orchestral Tools", family: "players", blurb: "Free player for Layers, Spindle and SINEfactory. Download one instrument at a time to save disk space.", url: "https://www.orchestraltools.com/layers", host: "plugin", os: BOTH, rights: "check", account: true },
  { id: "soundpaint-engine", name: "Soundpaint", maker: "Soundpaint", family: "players", blurb: "Free engine with its own free packs, and paid packs alongside them.", url: "https://soundpaint.com/pages/free-engine", host: "plugin", os: BOTH, rights: "check", account: true },
  { id: "bfd-player", name: "BFD Player", maker: "BFD Drums", family: "players", blurb: "Free drum player with a starter kit and a groove library.", url: "https://www.bfddrums.com/bfd-player/", host: "plugin", os: BOTH, rights: "check", account: true },
  { id: "ableton-packs", name: "Ableton Packs", maker: "Ableton", family: "players", blurb: "Not VSTs, but Ableton's own store has free Live packs that load straight into your session.", url: "https://www.ableton.com/en/packs/", host: "plugin", os: BOTH, rights: "check", image: "https://cdn-resources.ableton.com/80bA26cPQ1hEJDFjpUKntxfqdmG3ZykO/static/images/og-images/packs.3d64aad976d4.jpg" },

  // Orchestra
  { id: "bbcso-discover", name: "BBC Symphony Orchestra Discover", maker: "Spitfire Audio", family: "orchestra", blurb: "34 instruments, 47 techniques and a Steinway, recorded at Maida Vale. No Kontakt needed, and it's only 240 MB.", url: "https://www.spitfireaudio.com/products/bbc-symphony-orchestra-discover", host: "plugin", os: BOTH, rights: "check", account: true, size: "240 MB", pick: true },
  { id: "sso-discover", name: "Spitfire Symphony Orchestra Discover", maker: "Spitfire Audio", family: "orchestra", blurb: "44 instruments and 74 techniques recorded at AIR Lyndhurst. The deepest free orchestra here.", url: "https://www.spitfireaudio.com/products/spitfire-symphony-orchestra-discover", host: "kontakt", os: BOTH, rights: "check", account: true, size: "5.7 GB", pick: true },
  { id: "orchestra-elements", name: "The Orchestra Elements", maker: "Sonuscore", family: "orchestra", blurb: "Turns one played part into full orchestral patterns. Fast for blocking out a cue.", url: "https://www.sonuscore.com/shop/the-orchestra-elements/", host: "kontakt", os: BOTH, rights: "reported", account: true, size: "4 GB", image: "https://www.sonuscore.com/wp-content/uploads/2024/05/SONU_TheOrchestraElements_Artwork.jpg" },
  { id: "free-orchestra", name: "The Free Orchestra", maker: "ProjectSAM", family: "orchestra", blurb: "14 instruments drawn from ProjectSAM's catalogue, including staccatos, horns, choirs and drones.", url: "https://projectsam.com/libraries/the-free-orchestra/", host: "kontakt", os: BOTH, rights: "reported", account: true, size: "1.8 GB" },
  { id: "free-orchestra-2", name: "The Free Orchestra 2", maker: "ProjectSAM", family: "orchestra", blurb: "A second set of 12 instruments, aimed at trailer and cinematic writing.", url: "https://projectsam.com/libraries/the-free-orchestra-2/", host: "kontakt", os: BOTH, rights: "reported", account: true, pick: true },
  { id: "layers", name: "Layers", maker: "Orchestral Tools", family: "orchestra", blurb: "Full orchestral chords with blendable sections, recorded at Teldex in Berlin. Great for sketching.", url: "https://www.orchestraltools.com/layers", host: "sine", os: BOTH, rights: "check", account: true, size: "17 GB" },
  { id: "tutti-free", name: "Tutti Free", maker: "Sonokinetic", family: "orchestra", blurb: "Stabs, swells, glissandi and textures from an orchestra improvising. Made for tension and chaos.", url: "https://www.sonokinetic.net/products/classical/tutti/", host: "kontakt", os: BOTH, rights: "reported", account: true, size: "445 MB" },
  { id: "glade", name: "GLADE", maker: "Audio Imperia", family: "orchestra", blurb: "Cinematic orchestral library that Audio Imperia offers free to new composers.", url: "https://www.audioimperia.com/product/glade/", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://www.audioimperia.com/wp-content/uploads/2025/10/01-Glade-Product-Cover-Website-Alt.webp" },
  { id: "big-bang", name: "Big Bang Orchestra", maker: "Vienna Symphonic Library", family: "orchestra", blurb: "Big tutti hits and swells.", url: "https://www.vsl.co.at/en/Big_Bang_Orchestra", host: "synchron", os: BOTH, rights: "check", account: true, size: "1.4 GB", caution: "Needs iLok. The maker's page couldn't be read, so this comes from a reviewer." },
  { id: "sinefactory", name: "SINEfactory", maker: "Orchestral Tools", family: "orchestra", blurb: "A series of small free instruments for SINE Player.", url: "https://www.orchestraltools.com/sinefactory", host: "sine", os: BOTH, rights: "check", account: true },
  { id: "synful", name: "Synful Orchestra", maker: "Synful", family: "orchestra", blurb: "Synthesises phrasing instead of playing samples, so it needs almost no memory. Now free of charge.", url: "https://www.synful.com/", host: "plugin", os: BOTH, rights: "check" },
  { id: "vsco2", name: "VSCO 2 Community Edition", maker: "Versilian Studios", family: "orchestra", blurb: "A complete open-source chamber orchestra, about 3 GB.", url: "https://github.com/sgossner/VSCO-2-CE", host: "sfz", os: ALL, rights: "open", size: "3 GB" },
  { id: "vpo", name: "Virtual Playing Orchestra", maker: "Paul Battersby", family: "orchestra", blurb: "A full orchestra assembled from the best free samples, in SFZ format. Runs anywhere.", url: "https://virtualplaying.com/virtual-playing-orchestra/", host: "sfz", os: ALL, rights: "check", size: "618 MB" },
  { id: "sonatina", name: "Sonatina Symphonic Orchestra", maker: "Mattias Westlund", family: "orchestra", blurb: "A long-running free orchestra in SFZ format. Modest sound, but it covers everything.", url: "https://github.com/peastman/sso", host: "sfz", os: ALL, rights: "check", size: "1.4 GB", caution: "Creative Commons Sampling Plus 1.0. The author says some sample origins can't be fully traced." },

  // Brass and woodwind
  { id: "monster-sax", name: "MONSTER Sax", maker: "Agus Hardiman", family: "winds", blurb: "An expressive solo saxophone with real-time articulations.", url: MONSTER, host: "plugin", os: BOTH, rights: "check", pick: true },

  // Strings
  { id: "lux-strings", name: "LUX Orchestral Strings Elements", maker: "Sonuscore", family: "strings", blurb: "A 70-piece string section with four articulations per section, from a $499 library.", url: "https://www.sonuscore.com/shop/lux-orchestral-strings-elements/", host: "kontakt", os: BOTH, rights: "reported", account: true, pick: true },
  { id: "tokyo-strings", name: "Tokyo Scoring Strings Free", maker: "Impact Soundworks", family: "strings", blurb: "Scoring strings from Impact Soundworks' Tokyo library.", url: "https://impactsoundworks.com/product/tokyo-scoring-strings-free/", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://impactsoundworks.com/wp-content/uploads/2021/09/TSS-Featured-Image-1.png" },
  { id: "monster-strings", name: "MONSTER Strings", maker: "Agus Hardiman", family: "strings", blurb: "Lush acoustic string sections in a simple plugin. No sampler needed.", url: MONSTER, host: "plugin", os: BOTH, rights: "check" },

  // Piano
  { id: "toolbox-piano", name: "Creative ToolboX Piano", maker: "Strezov Sampling", family: "piano", blurb: "A Steinway grand in a scoring hall with three mic positions. Reviewers' top free piano of 2026.", url: "https://www.strezov-sampling.com/products/view/the-creative-toolbox-piano.html", host: "kontakt", os: BOTH, rights: "reported", account: true, pick: true },
  { id: "felt-seiler", name: "The Felt Seiler Free Edition", maker: "Strezov Sampling", family: "piano", blurb: "A close, soft felt piano for quiet scenes.", url: "https://www.strezov-sampling.com/products/view/the-felt-seiler-free-edition.html", host: "kontakt", os: BOTH, rights: "reported", account: true, pick: true },
  { id: "foundations-piano", name: "Foundations Piano", maker: "Heavyocity", family: "piano", blurb: "A cinematic piano that can be pushed into hybrid sound design.", url: "https://heavyocity.com/products/foundations-piano", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://heavyocity.com/cdn/shop/products/Foundations_CatalogUI_364855da-a71f-4f0f-aa98-5a3fb3347bd1.jpg?v=1758157828" },
  { id: "monastery", name: "Monastery Grand", maker: "MeldaProduction", family: "piano", blurb: "A concert grand that runs as its own plugin, so no Kontakt.", url: "https://www.meldaproduction.com/MonasteryGrand", host: "plugin", os: BOTH, rights: "check", image: "https://www.meldaproduction.com//webtemp/imagecache/pro_image/b7/127.v1609340920.jpeg" },
  { id: "1928-steinway", name: "1928 Vintage Grand Steinway", maker: "Soundpaint", family: "piano", blurb: "A reviewers' pick for the most realistic free grand.", url: "https://soundpaint.com/products/1928-vintage-grand-steinway", host: "soundpaint", os: BOTH, rights: "check", account: true, image: "https://soundpaint.com/cdn/shop/products/1928banner.jpg?v=1682964600", caution: "No price showed on the product page when checked. Confirm it's free at checkout." },
  { id: "absurdly-quiet", name: "Absurdly Quiet Piano", maker: "The Crow Hill Company", family: "piano", blurb: "An impossibly soft piano. The pedal and hammer noise is part of the sound.", url: "https://thecrowhillcompany.com/absurdly-quiet-piano/", host: "plugin", os: BOTH, rights: "check", account: true },
  { id: "spindle", name: "Spindle", maker: "Orchestral Tools", family: "piano", blurb: "A piano built for sound design.", url: "https://www.orchestraltools.com/spindle", host: "sine", os: BOTH, rights: "check", account: true },
  { id: "piano-in-162", name: "Piano in 162", maker: "Ivy Audio", family: "piano", blurb: "A well-loved free grand with close and ambient mics.", url: "https://ivyaudio.com/freebies", host: "kontakt", os: BOTH, rights: "check", caution: "Pick the version that suits you on the download page. Some may need full Kontakt." },
  { id: "piano-one", name: "Piano One", maker: "Sound Magic", family: "piano", blurb: "A nine-foot Blüthner and Yamaha C7 hybrid model.", url: "https://neovst.com/piano-one/", host: "plugin", os: "Windows, older Mac version", rights: "check", image: "https://neovst.com/wp-content/uploads/2025/06/np2p1.jpg" },
  { id: "salamander", name: "Salamander Grand Piano", maker: "Alexander Holm", family: "piano", blurb: "A classic free Yamaha C5 sample set, about 400 MB.", url: "https://sfzinstruments.github.io/pianos/salamander/", host: "sfz", os: ALL, rights: "credit", size: "400 MB" },
  { id: "upright-99", name: "Upright Piano", maker: "99Sounds", family: "piano", blurb: "A warm, characterful upright. 64-bit VST3 and easy on the CPU.", url: "https://99sounds.org/free-piano-vst/", host: "plugin", os: BOTH, rights: "check", size: "1.2 GB", image: "https://99sounds.org/wp-content/uploads/2023/07/1.jpg" },
  { id: "klavir", name: "Klavir", maker: "MNTRA", family: "piano", blurb: "A free piano from MNTRA.", url: "https://shop.mntra.io/products/klavir", host: "plugin", os: BOTH, rights: "check", account: true, image: "https://sd7mvhgr56egagqm.public.blob.vercel-storage.com/klavir-mn90ewlw-221216_Klavir_Screenshots_Perform_3-1440x960.jpg" },
  { id: "monster-piano", name: "MONSTER Piano", maker: "Agus Hardiman", family: "piano", blurb: "Concert grands, warm uprights and felt pianos in one plugin.", url: MONSTER, host: "plugin", os: BOTH, rights: "check" },
  { id: "4front", name: "4Front Piano", maker: "George Yohng", family: "piano", blurb: "A tiny, old upright-style plugin with a home-piano tone.", url: "https://www.yohng.com/software/piano.html", host: "plugin", os: BOTH, rights: "check", caution: "Very old. Check that a 64-bit build works in your Live." },

  // Keys
  { id: "sweetcase", name: "Sweetcase Vintage Electric Piano", maker: "NoiseAsh", family: "keys", blurb: "A vintage suitcase electric piano. Reviewers' top free choice.", url: "https://noiseash.com/sweetcase-vintage-electric-piano/", host: "plugin", os: BOTH, rights: "check", account: true, pick: true },
  { id: "88e", name: "The 88E", maker: "Impact Soundworks", family: "keys", blurb: "A sampled electric piano for Kontakt Player.", url: "https://impactsoundworks.com/product/the-88e/", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://impactsoundworks.com/wp-content/uploads/2022/02/The-88E-Featured-Image.png" },
  { id: "emp", name: "EMP Mark II", maker: "Sonokinetic", family: "keys", blurb: "A classic electric piano, sampled.", url: "https://www.sonokinetic.net/products/contemporary/emp/", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://d2y9zhcy2upetp.cloudfront.net/images/emp/slides/emp-slide1.jpg" },
  { id: "diamond-trio", name: "Diamond Jazz Trio", maker: "Strezov Sampling", family: "keys", blurb: "A jazz trio for Kontakt Player, taken from Strezov's Diamond series.", url: "https://www.strezov-sampling.com/products/view/diamond-jazz-trio-freebie.html", host: "kontakt", os: BOTH, rights: "reported", account: true },
  { id: "cassette-roads", name: "Cassette Roads", maker: "SampleScience", family: "keys", blurb: "A worn, cassette-processed electric piano.", url: "https://www.samplescience.info/2020/12/cassette-roads.html", host: "plugin", os: BOTH, rights: "check" },
  { id: "dsk-rhodez", name: "DSK RhodeZ", maker: "DSK Music", family: "keys", blurb: "A simple electric piano plugin.", url: "https://www.dskmusic.com/dsk-rhodez/", host: "plugin", os: "Windows", rights: "stated", image: "https://www.dskmusic.com/wp-content/uploads/2012/01/DSK-RhodeZ.jpg", caution: "64-bit build not confirmed. Live won't load 32-bit plugins." },
  { id: "dsk-elektrik", name: "DSK Elektrik Keys", maker: "DSK Music", family: "keys", blurb: "A set of sampled electric keys.", url: "https://www.dskmusic.com/dsk-elektrik-keys/", host: "plugin", os: "Windows", rights: "stated", image: "https://www.dskmusic.com/wp-content/uploads/2012/01/DSK-Elektrik-Keys.jpg", caution: "64-bit build not confirmed. Live won't load 32-bit plugins." },
  { id: "monster-keyz", name: "MONSTER Keyz", maker: "Agus Hardiman", family: "keys", blurb: "Blend acoustic pianos, electric pianos, organs and synth keys into hybrid voices.", url: MONSTER, host: "plugin", os: BOTH, rights: "check" },
  { id: "golden-piano", name: "Golden Piano", maker: "Agus Hardiman", family: "keys", blurb: "Warm, chorus-laden digital pianos in the style of the 80s and 90s.", url: MONSTER, host: "plugin", os: BOTH, rights: "check" },

  // Choir
  { id: "emotive-choir", name: "Foundations Emotive Choir", maker: "Heavyocity", family: "choir", blurb: "A cinematic choir for instant mood.", url: "https://heavyocity.com/products/emotive-choir", host: "kontakt", os: BOTH, rights: "check", account: true, image: "https://heavyocity.com/cdn/shop/products/FoundationsEC_Catalog_UI_b062da9d-b572-409b-830e-e27dab3fecea.png?v=1762268680", pick: true },
  { id: "audience-choir", name: "Jacob Collier Audience Choir", maker: "Native Instruments", family: "choir", blurb: "A whole audience singing together. Rough, human and huge. Comes with Komplete Start.", url: START, host: "kontakt", os: BOTH, rights: "stated", account: true },
  { id: "tape-choir", name: "Tape Choir", maker: "Soniccouture", family: "choir", blurb: "A wobbly tape-replay choir with lots of old-film character.", url: "https://www.soniccouture.com/en/products/18-exclusive-free-content/p170-tape-choir/", host: "kontakt", os: BOTH, rights: "reported", account: true },

  // Drums
  { id: "mt-power", name: "MT Power Drum Kit 2", maker: "Manda Audio", family: "drums", blurb: "A punchy acoustic kit with a big groove library. Simple and light.", url: "https://www.powerdrumkit.com/", host: "plugin", os: BOTH, rights: "check", image: "https://www.powerdrumkit.com/images/open-graph/og-index.jpg", pick: true },
  { id: "modo-cs", name: "MODO DRUM CS", maker: "IK Multimedia", family: "drums", blurb: "A modelled kit where you change shells, heads and tuning. One free kit, Studio.", url: "https://www.ikmultimedia.com/products/mododrum/", host: "plugin", os: BOTH, rights: "check", account: true },
  { id: "drumgizmo", name: "DrumGizmo", maker: "DrumGizmo", family: "drums", blurb: "An open-source multichannel drum sampler.", url: "https://drumgizmo.org/", host: "plugin", os: ALL, rights: "open" },
  { id: "jamstix", name: "Jamstix Free", maker: "Rayzoon", family: "drums", blurb: "A free edition of the drummer-simulation plugin.", url: "https://rayzoon.com/", host: "plugin", os: BOTH, rights: "check" },
  { id: "api-drums", name: "API Drums", maker: "Sulcata Sound", family: "drums", blurb: "Acoustic drums for Decent Sampler.", url: "https://sulcatasound.com/sounds/p/api-drums", host: "decent", os: ALL, rights: "check" },
  { id: "triaz", name: "Triaz Player", maker: "Wave Alchemy", family: "drums", blurb: "4,000 samples and 200 presets for electronic drums. The reviewers' pick for electronic work.", url: "https://www.wavealchemy.co.uk/product/triaz-player/", host: "plugin", os: BOTH, rights: "check", account: true, image: "https://www.wavealchemy.co.uk/wp-content/uploads/2024/08/Triaz_Player_Artwork.jpg" },
  { id: "monster-drums", name: "MONSTER Drums", maker: "Agus Hardiman", family: "drums", blurb: "Pop, rock, metal, jazz, cajon and 8-bit kits in one plugin.", url: MONSTER, host: "plugin", os: BOTH, rights: "check" },
  { id: "drumflx", name: "DRUMFLX", maker: "SoniX Audio", family: "drums", blurb: "A free drum machine plugin.", url: "https://drumflx.sonix.audio/", host: "plugin", os: BOTH, rights: "check" },
  { id: "drumplayer", name: "Drumplayer", maker: "99Sounds", family: "drums", blurb: "Lo-fi, glitch and retro game drums.", url: "https://99sounds.org/free-drum-vst/", host: "plugin", os: BOTH, rights: "check", image: "https://99sounds.org/wp-content/uploads/2023/07/drumplayer.jpg" },
  { id: "cassette-drums", name: "BPB Cassette Drums", maker: "Bedroom Producers Blog", family: "drums", blurb: "Drum machines recorded to tape.", url: "https://bpb.gumroad.com/l/cassette-drums/FREEDRUMS", host: "plugin", os: BOTH, rights: "check", image: "https://public-files.gumroad.com/igmoy9ihzhwqa3ovdlspt1g5ju8u" },
  { id: "chowkick", name: "ChowKick", maker: "Chowdhury DSP", family: "drums", blurb: "A kick drum synth for designing your own low hits.", url: "https://chowdsp.com/products.html", host: "plugin", os: ALL, rights: "check" },
  { id: "minispillage", name: "MiniSpillage", maker: "Audio Spillage", family: "drums", blurb: "A compact drum synth.", url: "https://www.audiospillage.com/minispillage.html", host: "plugin", os: BOTH, rights: "check" },
  { id: "excite-snare", name: "EXC!TE SNARE DRUM", maker: "CHAIR", family: "drums", blurb: "A playable snare, modelled and full of detail. VST3 and AU.", url: "https://www.chair.audio/product/excite_snare_drum/", host: "plugin", os: BOTH, rights: "check" },
  { id: "sitala", name: "Sitala (older version)", maker: "Decomposer", family: "drums", blurb: "A clean drum sampler for your own samples.", url: "https://decomposer.de/sitala/", host: "plugin", os: BOTH, rights: "check", caution: "The current version costs $20. Only the older one is free, further down the download page." },
  { id: "speedrum-lite", name: "Speedrum Lite", maker: "Apisonic Audio", family: "drums", blurb: "A drum sampler with separate stereo outputs for mixing.", url: "https://www.apisonic-audio.com/", host: "plugin", os: BOTH, rights: "check" },

  // Percussion
  { id: "thunder-taiko", name: "THUNDER X3M Taiko Freebie", maker: "Strezov Sampling", family: "percussion", blurb: "Big scoring-stage taiko hits for trailers and chases.", url: "https://www.strezov-sampling.com/products/view/THUNDER-X3M-Taiko-Freebie.html", host: "kontakt", os: BOTH, rights: "reported", account: true, pick: true },
  { id: "lineage-perc", name: "Lineage Percussion Free", maker: "ProjectSAM", family: "percussion", blurb: "Orchestral percussion from ProjectSAM's flagship library.", url: "https://projectsam.com/libraries/lineage-percussion-free", host: "kontakt", os: BOTH, rights: "reported", account: true, pick: true },
  { id: "toolbox-drums", name: "Creative ToolboX Drums and Percussion", maker: "Strezov Sampling", family: "percussion", blurb: "Scoring-stage drums and percussion.", url: "https://www.strezov-sampling.com/products/view/the-creative-toolbox-drums-and-percussion.html", host: "kontakt", os: BOTH, rights: "reported", account: true },
  { id: "carousel", name: "Carousel", maker: "Sonokinetic", family: "percussion", blurb: "Music-box and fairground colours.", url: "https://www.sonokinetic.net/products/instruments/carousel/", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://d2y9zhcy2upetp.cloudfront.net/images/carousel2020/slides/carousel-slide1.jpg" },
  { id: "monster-toys", name: "MONSTER Toys", maker: "Agus Hardiman", family: "percussion", blurb: "Sampled toy instruments, good for innocence that turns sinister.", url: MONSTER, host: "plugin", os: BOTH, rights: "check" },

  // Guitar and bass
  { id: "ample-m-lite", name: "Ample Guitar M Lite 4", maker: "Ample Sound", family: "guitar", blurb: "A realistic steel-string acoustic with strums and fingerpicking. Reviewers' top free guitar.", url: "https://www.amplesound.net/en/download.asp", host: "plugin", os: BOTH, rights: "check", account: true, pick: true },
  { id: "ample-p-lite", name: "Ample Bass P Lite 4", maker: "Ample Sound", family: "guitar", blurb: "A Precision-style electric bass. Download size 982 MB, activates with iLok.", url: "https://www.amplesound.net/en/download.asp", host: "plugin", os: BOTH, rights: "check", account: true, size: "982 MB" },
  { id: "deer-fox", name: "The Deer, the Fox and the Guitar", maker: "Wavelet Audio", family: "guitar", blurb: "A delicate, storybook acoustic guitar for Kontakt Player.", url: "https://wavelet-audio.com/deer-fox-guitar/", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://wavelet-audio.com/wp-content/uploads/2026/04/The-Deer-the-Fox-and-the-Guitar-01.jpg" },
  { id: "nylon", name: "Foundations Nylon Guitar", maker: "Heavyocity", family: "guitar", blurb: "Nylon guitar that also opens into cinematic hybrid sounds.", url: "https://heavyocity.com/products/foundations-nylon-guitar", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://heavyocity.com/cdn/shop/products/F3NG_CatalogUI_3549e702-82c1-41b8-9722-11cac1c70424.jpg?v=1760879439", pick: true },
  { id: "stratus", name: "Shreddage 3 Stratus FREE", maker: "Impact Soundworks", family: "guitar", blurb: "The closest thing to a proper modern electric guitar for free.", url: "https://impactsoundworks.com/product/shreddage-3-stratus-free-kp/", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://impactsoundworks.com/wp-content/uploads/2023/07/S3StratusFREE-Featured-Image.png" },
  { id: "precision", name: "Shreddage 3 Precision FREE", maker: "Impact Soundworks", family: "guitar", blurb: "An electric bass to match Stratus.", url: "https://impactsoundworks.com/product/shreddage-3-precision-free-kp/", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://impactsoundworks.com/wp-content/uploads/2023/08/Shreddage-3-Precision-Free-KP-Featured-Image.png" },
  { id: "synth-bass", name: "Foundations Synth Bass", maker: "Heavyocity", family: "guitar", blurb: "Cinematic synth bass for Kontakt Player.", url: "https://heavyocity.com/products/foundations-synth-bass", host: "kontakt", os: BOTH, rights: "reported", account: true },
  { id: "vinyl-guitar", name: "Vinyl Guitar 2", maker: "Echo Sound Works", family: "guitar", blurb: "A dusty sampled guitar. The maker states a 100% royalty-free commercial licence.", url: "https://www.echosoundworks.com/vinyl-guitar-2", host: "plugin", os: BOTH, rights: "stated", image: "https://static.wixstatic.com/media/81ef3c_6079ac7965504edf8d6008403ae97a2c~mv2.jpg/v1/fill/w_2500,h_1598,al_c/81ef3c_6079ac7965504edf8d6008403ae97a2c~mv2.jpg" },
  { id: "rubber-bridge", name: "Rubber Bridge Plucks", maker: "Somerville Sounds", family: "guitar", blurb: "Muted, woody plucks.", url: "https://somervillesounds.com/rubber-bridge-plucks/", host: "plugin", os: BOTH, rights: "check" },
  { id: "plastikguitar", name: "PlastikGuitar", maker: "Audiolatry", family: "guitar", blurb: "An electric guitar plugin with built-in reverb.", url: "https://audiolatry.com/free-guitar-plugin-plastikguitar/", host: "plugin", os: BOTH, rights: "check", image: "https://audiolatry.com/wp-content/uploads/2025/01/plastikguitar-1600-black.jpg" },
  { id: "solaris", name: "Solaris GTR Lite", maker: "Quiet Music", family: "guitar", blurb: "An atmospheric guitar instrument.", url: "https://quietmusic.gumroad.com/l/exmke/FREEDOWNLOAD", host: "plugin", os: BOTH, rights: "check", image: "https://public-files.gumroad.com/zi53ddtp0td2k8kuzp6lvj2y2jes" },
  { id: "monster-guitar", name: "MONSTER Guitar", maker: "Agus Hardiman", family: "guitar", blurb: "Acoustic and electric tones with chord and strumming modes.", url: MONSTER, host: "plugin", os: BOTH, rights: "check" },
  { id: "monster-bass", name: "MONSTER Bass", maker: "Agus Hardiman", family: "guitar", blurb: "Electric, acoustic, synth and distorted sub-basses.", url: MONSTER, host: "plugin", os: BOTH, rights: "check" },

  // World
  { id: "monster-ethnica", name: "MONSTER Ethnica", maker: "Agus Hardiman", family: "world", blurb: "Instruments and textures from around the world in one plugin. The easiest place to start.", url: MONSTER, host: "plugin", os: BOTH, rights: "check", pick: true },
  { id: "duduk", name: "BALKAN Ethnic Orchestra Duduk", maker: "Strezov Sampling", family: "world", blurb: "A tenor duduk for mournful solo lines.", url: "https://www.strezov-sampling.com/products/view/balkan-ethnic-orchestra-duduk-freebie.html", host: "kontakt", os: BOTH, rights: "check", account: true, pick: true },
  { id: "irish-harp", name: "Irish Harp", maker: "Native Instruments", family: "world", blurb: "A warm 34-string neo-Irish harp. Comes with Komplete Start.", url: START, host: "kontakt", os: BOTH, rights: "stated", account: true },
  { id: "hurdy-gurdy", name: "Hurdy Gurdy", maker: "Sonokinetic", family: "world", blurb: "A medieval drone and melody instrument for period scenes.", url: "https://www.sonokinetic.net/products/classical/hurdygurdy/", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://d2y9zhcy2upetp.cloudfront.net/images/hurdygurdy/slides/hurdygurdy-slide1.jpg" },
  { id: "indian-dreamz", name: "DSK Indian DreamZ", maker: "DSK Music", family: "world", blurb: "Sitar, sarod, veena, tar, tampura and tabla. The only free sitar confirmed on a maker's page.", url: "https://www.dskmusic.com/dsk-indian-dreamz/", host: "plugin", os: "Windows", rights: "stated", image: "https://www.dskmusic.com/wp-content/uploads/2012/01/DSK-Indian-DreamZ.jpg", caution: "From 2012. 64-bit build not confirmed, and Live won't load 32-bit plugins." },
  { id: "asian-dreamz", name: "DSK Asian DreamZ", maker: "DSK Music", family: "world", blurb: "A set of sampled Asian instruments.", url: "https://www.dskmusic.com/dsk-asian-dreamz/", host: "plugin", os: "Windows", rights: "stated", caution: "64-bit build not confirmed. Live won't load 32-bit plugins." },
  { id: "world-stringz", name: "DSK World StringZ", maker: "DSK Music", family: "world", blurb: "A set of sampled plucked strings from around the world.", url: "https://www.dskmusic.com/dsk-world/", host: "plugin", os: "Windows", rights: "stated", caution: "64-bit build not confirmed. Live won't load 32-bit plugins." },

  // Synths
  { id: "surge-xt", name: "Surge XT", maker: "Surge Synth Team", family: "synth", blurb: "A huge open-source synth with thousands of presets. VST3 for Windows and Mac.", url: "https://surge-synthesizer.github.io/", host: "plugin", os: ALL, rights: "open", image: "https://surge-synthesizer.github.io/images/og_image.png", pick: true },
  { id: "vital", name: "Vital", maker: "Matt Tytel", family: "synth", blurb: "A full wavetable synth. The free Basic tier has every feature and 75 presets.", url: "https://vital.audio/", host: "plugin", os: ALL, rights: "stated", account: true, image: "https://vital.audio/images/social.png", pick: true },
  { id: "zebralette3", name: "Zebralette 3", maker: "u-he", family: "synth", blurb: "One deep oscillator from Zebra 3. Reviewers rate it for cinematic and ambient work.", url: "https://u-he.com/products/plug-ins/zebralette3/", host: "plugin", os: ALL, rights: "check", pick: true },
  { id: "tyrell", name: "Tyrell N6", maker: "u-he", family: "synth", blurb: "A warm virtual analog with a big preset library.", url: "https://u-he.com/products/tyrelln6/", host: "plugin", os: ALL, rights: "check", image: "https://u-he.com/products/tyrelln6/assets/images/uhe-tyrelln6-splash-photo-studio-setup-1100x350.jpg", caution: "The current build is labelled beta." },
  { id: "dexed", name: "Dexed", maker: "Pascal Gauthier", family: "synth", blurb: "Yamaha DX7-style FM: glassy keys, bells and basses. GPL v3.", url: "https://asb2m10.github.io/dexed/", host: "plugin", os: ALL, rights: "open" },
  { id: "odin2", name: "Odin 2", maker: "TheWaveWarden", family: "synth", blurb: "A 24-voice hybrid synth with a clean layout. VST3 on every platform.", url: "https://thewavewarden.com/pages/odin-2", host: "plugin", os: ALL, rights: "check" },
  { id: "tetraop", name: "TetraOP", maker: "tiagolr", family: "synth", blurb: "Four-operator FM and wavetable with fat unison. GPL-3.0.", url: "https://github.com/tiagolr/tetraop", host: "plugin", os: ALL, rights: "open" },
  { id: "noisemaker", name: "TAL-NoiseMaker", maker: "TAL Software", family: "synth", blurb: "A classic analog-style synth that's very light on CPU.", url: "https://tal-software.com/products/tal-noisemaker", host: "plugin", os: ALL, rights: "check", image: "https://tal-software.com/images/products/tal-noisemaker-new.jpg" },
  { id: "ob-xf", name: "OB-Xf", maker: "Surge Synth Team", family: "synth", blurb: "Big Oberheim-style brass and pads. Use this one, because the free OB-Xd bans commercial use.", url: "https://github.com/surge-synthesizer/OB-Xf/releases/latest", host: "plugin", os: ALL, rights: "check" },
  { id: "fury-68", name: "Fury-68", maker: "full bucket music", family: "synth", blurb: "Grimy 80s poly sounds in the style of a Poly-61.", url: "https://www.fullbucket.de/music/fury68.html", host: "plugin", os: BOTH, rights: "check" },
  { id: "charlatan", name: "Charlatan 3", maker: "BlauKraut", family: "synth", blurb: "A very easy virtual analog for basses and leads.", url: "https://blaukraut.info/", host: "plugin", os: "Windows, Linux", rights: "check" },
  { id: "pivot-lite", name: "Pivot Lite", maker: "Fors", family: "synth", blurb: "An easier way into FM than Dexed.", url: "https://fors.fm/pivot", host: "plugin", os: BOTH, rights: "check", account: true, image: "https://api.fors.fm/storage/v1/object/public/images/meta-thumbnails/pivot.jpg" },
  { id: "massive-xl", name: "Massive XL Player", maker: "Native Instruments", family: "synth", blurb: "Preset-driven basses, leads and pads. Comes with Komplete Start.", url: "https://www.native-instruments.com/products/massive-xl-player", host: "plugin", os: BOTH, rights: "stated", account: true, image: "https://www.native-instruments.com/cdn/shop/files/Massive-XL-Player-featured-image.png?v=1792761312" },
  { id: "pendulate", name: "Pendulate", maker: "Newfangled Audio", family: "synth", blurb: "A chaotic monosynth built on chaos theory. Gritty and unstable, in a good way.", url: "https://www.newfangledaudio.com/pendulate", host: "plugin", os: BOTH, rights: "check", account: true, pick: true },
  { id: "primer", name: "Primer 2", maker: "Syntorial", family: "synth", blurb: "A friendly synth for learning the basics.", url: "https://www.syntorial.com/primer/", host: "plugin", os: BOTH, rights: "check", image: "https://www.syntorial.com/wp-content/uploads/2024/11/Primer-Website1.jpg" },
  { id: "cardinal", name: "Cardinal", maker: "DISTRHO", family: "synth", blurb: "A full modular rack as a plugin, based on VCV Rack. VST3 works in Live.", url: "https://cardinal.kx.studio/", host: "plugin", os: ALL, rights: "open" },
  { id: "vcv-rack", name: "VCV Rack 2 Free", maker: "VCV", family: "synth", blurb: "A virtual Eurorack studio.", url: "https://vcvrack.com/Rack", host: "plugin", os: ALL, rights: "check", caution: "The free version is a separate app, not a plugin for Live." },
  { id: "tunefish", name: "Tunefish", maker: "Brain Control", family: "synth", blurb: "A tiny additive synth that needs little CPU.", url: "https://www.tunefish-synth.com/", host: "plugin", os: ALL, rights: "check" },
  { id: "synth1", name: "Synth1", maker: "Daichi Laboratory", family: "synth", blurb: "A much-loved, very light two-oscillator synth with thousands of user patches.", url: "https://daichilab.sakura.ne.jp/softsynth/index.html", host: "plugin", os: BOTH, rights: "check" },
  { id: "helm", name: "Helm", maker: "Matt Tytel", family: "synth", blurb: "An older open-source synth from Vital's maker. Pay what you like, including nothing.", url: "https://tytel.org/helm/", host: "plugin", os: ALL, rights: "open", image: "https://tytel.org/static/images/helm_og_image_small.png" },
  { id: "monster-synth", name: "MONSTER Synth", maker: "Agus Hardiman", family: "synth", blurb: "Hundreds of leads, pads, basses and retro keys, ready to play.", url: MONSTER, host: "plugin", os: BOTH, rights: "check" },

  // Textures
  { id: "paulxstretch", name: "PaulXStretch", maker: "Sonosaurus", family: "texture", blurb: "Stretch any audio by huge amounts until it becomes a drone. Open source, VST3.", url: "https://sonosaurus.com/paulxstretch/", host: "plugin", os: BOTH, rights: "open", pick: true },
  { id: "diffusia", name: "Diffusia", maker: "Full FX Media", family: "texture", blurb: "Hold a chord and it turns into an evolving drone. VST3, no time limit.", url: "https://fullfxmedia-site.pages.dev/plugins/diffusia/", host: "plugin", os: ALL, rights: "check", image: "https://fullfxmedia.com/images/diffusia_screenshot.png", pick: true },
  { id: "obscura", name: "Obscura", maker: "Occult Audio", family: "texture", blurb: "Ten evolving drone sources for dark cinematic layers. Its own plugin, no Kontakt.", url: "https://soundshockaudio.com/obscura/", host: "plugin", os: BOTH, rights: "check", image: "https://images.soundshockaudio.com/products/obscura/hero.webp", caution: "Only confirmed on a retailer listing, which shows GBP 0.00." },
  { id: "hypha", name: "Hypha", maker: "Native Instruments", family: "texture", blurb: "Hybrid acoustic and electric sounds inspired by nature. Comes with Komplete Start.", url: START, host: "kontakt", os: BOTH, rights: "stated", account: true },
  { id: "ethereal-earth", name: "Ethereal Earth", maker: "Native Instruments", family: "texture", blurb: "Organic textures blended with electronics. Comes with Komplete Start.", url: START, host: "kontakt", os: BOTH, rights: "stated", account: true, pick: true },
  { id: "analog-dreams", name: "Analog Dreams", maker: "Native Instruments", family: "texture", blurb: "Retro synths and modern layers for dreamy pads. Comes with Komplete Start.", url: START, host: "kontakt", os: BOTH, rights: "stated", account: true },
  { id: "factory-selection", name: "Kontakt Factory Selection", maker: "Native Instruments", family: "texture", blurb: "A starter set of synths, drums, band instruments and choirs. Comes with Komplete Start.", url: START, host: "kontakt", os: BOTH, rights: "stated", account: true },
  { id: "silver", name: "SILVER", maker: "Audiobro", family: "texture", blurb: "An inspiring free Kontakt library for experimental colours.", url: "https://audiobro.com/silver/", host: "kontakt", os: BOTH, rights: "reported", account: true, image: "https://audiobro.com/wp-content/uploads/2024/02/Silver-500w_tny.png" },
  { id: "rainsong", name: "Rainsong", maker: "Soundiron", family: "texture", blurb: "Experimental library from Soundiron.", url: "https://soundiron.com/products/rainsong", host: "kontakt", os: BOTH, rights: "reported", account: true, caution: "The maker's page blocked the check, so this comes from a reviewer." },
  { id: "infinite", name: "Infinite Collection", maker: "Emergence Audio", family: "texture", blurb: "Atmospheric cinematic instruments.", url: "https://emergenceaudio.com/product/infinite-collection/", host: "kontakt", os: BOTH, rights: "reported", account: true, caution: "The maker's page blocked the check, so this comes from a reviewer." },
  { id: "monster-soundscapes", name: "MONSTER Soundscapes", maker: "Agus Hardiman", family: "texture", blurb: "Ambient textures, field recordings and cinematic layers.", url: MONSTER, host: "plugin", os: BOTH, rights: "check" },
];

// The 65 packs that Splice labels Free. Pack title, page slug and family.
const SPLICE: Array<[string, string, FamilyId, string?]> = [
  ["Strings", "spitfire-labs-strings", "strings", "The original LABS string ensemble: simple, warm and intimate."],
  ["Strings 2", "strings-2", "strings"],
  ["Frozen Strings", "frozen-strings", "strings", "Still, icy string beds."],
  ["Scary Strings", "scary-strings", "strings", "Unsettling string textures for tension."],
  ["Expressive Strings", "expressive-strings", "strings"],
  ["Harmonic Flights", "harmonic-flights", "strings"],
  ["Cello Moods", "cello-moods", "strings"],
  ["Amplified Cello Quartet", "amplified-cello-quartet", "strings"],
  ["Monochord", "monochord", "strings"],
  ["Autoharp", "autoharp", "strings"],
  ["Foghorn", "foghorn", "winds"],
  ["Trumpet Fields", "trumpet-fields", "winds"],
  ["Arctic Swells", "arctic-swells", "winds"],
  ["Soft Piano", "soft-piano", "piano", "The LABS classic: a close, felted piano."],
  ["Autograph Grand", "autograph-grand", "piano"],
  ["Intimate Grand Piano", "intimate-grand-piano", "piano"],
  ["Tape Piano", "tape-piano", "piano"],
  ["Glass Piano", "glass-piano", "piano"],
  ["Rare Groove Piano", "rare-groove-piano", "piano"],
  ["Modular Piano", "modular-piano", "piano"],
  ["Electric Piano", "electric-piano", "keys"],
  ["Vintage Keys", "vintage-keys", "keys"],
  ["Pipe Organ", "pipe-organ", "keys"],
  ["Ondes Musicales", "ondes-musicales", "keys"],
  ["Choir", "choir", "choir", "A simple sustained-vowel choir, sampled from the Eric Whitacre Singers."],
  ["Micah's Choir", "micahs-choir", "choir"],
  ["Gaelic Voices", "gaelic-voices", "choir"],
  ["Siren Songs", "siren-songs", "choir"],
  ["Drums", "spitfire-labs-drums", "drums"],
  ["Vintage Drums", "vintage-drums", "drums"],
  ["Percussion", "spitfire-labs-percussion", "percussion"],
  ["Bell Swarm", "bell-swarm", "percussion"],
  ["Hand Bells", "hand-bells", "percussion"],
  ["Music Box", "music-box", "percussion"],
  ["Christmas", "christmas", "percussion"],
  ["Electric Guitars", "electric-guitars", "guitar"],
  ["Peel Guitar", "peel-guitar", "guitar"],
  ["Ambient Guitars", "ambient-guitars", "guitar"],
  ["Astral Forms", "astral-forms", "guitar"],
  ["Guitar Harmonics", "guitar-harmonics", "guitar"],
  ["Moon Guitar", "moon-guitar", "guitar"],
  ["Lap Steel", "lap-steel", "guitar"],
  ["Bass Guitar", "bass-guitar", "guitar"],
  ["Mandolin", "mandolin", "guitar"],
  ["Dulcimer", "dulcimer", "world"],
  ["Charango", "charango", "world"],
  ["Uilleann Pipes", "uilleann-pipes", "world"],
  ["Classic Synths", "classic-synths", "synth"],
  ["Synth Pads", "synth-pads", "synth"],
  ["Synth Strings", "synth-strings", "synth"],
  ["Pedal Pads", "pedal-pads", "synth"],
  ["Cassette Synth", "cassette-synth", "synth"],
  ["Tape Orchestra", "tape-orchestra", "synth"],
  ["Obsolete Machines", "obsolete-machines", "synth"],
  ["Electronic Antique", "electronic-antique", "synth"],
  ["Hyperpop Synths", "hyperpop-synths", "synth"],
  ["Opia", "opia", "synth"],
  ["OPIA Wandering", "opia-wandering", "synth"],
  ["Textural Pads", "textural-pads", "texture"],
  ["Piano Pads", "piano-pads", "texture"],
  ["Organic Textures", "organic-textures", "texture"],
  ["Granular Whalesong", "granular-whalesong", "texture"],
  ["Tundra Atmos", "tundra-atmos", "texture"],
  ["London Atmos", "london-atmos", "texture"],
  ["LA Atmos", "la-atmos", "texture"],
];

const PICKS = new Set(["soft-piano", "frozen-strings", "scary-strings", "spitfire-labs-strings", "choir", "tundra-atmos"]);

export const INSTRUMENTS: Instrument[] = [
  ...CORE,
  ...SPLICE.map(([name, slug, family, blurb]): Instrument => ({
    id: `splice-${slug}`,
    name,
    maker: "Spitfire LABS / Splice",
    family,
    blurb: blurb ?? "A free pack that plays inside Splice INSTRUMENT.",
    url: `https://splice.com/instrument/packs/${slug}`,
    host: "splice",
    os: BOTH,
    rights: "check",
    account: true,
    pick: PICKS.has(slug) || undefined,
  })),
];

export interface ScoringKit {
  id: string;
  name: string;
  brief: string;
  parts: Array<{ role: string; id: string }>;
}

// Starting palettes for a cue: suggestions, chosen to cover the jobs in a cue.
export const KITS: ScoringKit[] = [
  { id: "intimate", name: "Intimate drama", brief: "Two people, one room, a lot unsaid.", parts: [
    { role: "Lead", id: "splice-soft-piano" }, { role: "Lead", id: "felt-seiler" }, { role: "Bed", id: "splice-spitfire-labs-strings" }, { role: "Colour", id: "splice-cello-moods" }, { role: "Colour", id: "nylon" },
  ] },
  { id: "epic", name: "Epic and trailer", brief: "Scale, drive and a big finish.", parts: [
    { role: "Orchestra", id: "free-orchestra-2" }, { role: "Sketch", id: "orchestra-elements" }, { role: "Drums", id: "thunder-taiko" }, { role: "Hits", id: "lineage-perc" }, { role: "Voices", id: "emotive-choir" }, { role: "Risers", id: "tutti-free" },
  ] },
  { id: "horror", name: "Horror and dread", brief: "Something is wrong and it's getting closer.", parts: [
    { role: "Strings", id: "splice-scary-strings" }, { role: "Chaos", id: "tutti-free" }, { role: "Drone", id: "obscura" }, { role: "Drone", id: "paulxstretch" }, { role: "Unstable", id: "pendulate" }, { role: "Innocence", id: "monster-toys" },
  ] },
  { id: "scifi", name: "Sci-fi", brief: "Cold light, big machines, deep space.", parts: [
    { role: "Pads", id: "zebralette3" }, { role: "Sound design", id: "vital" }, { role: "Everything else", id: "surge-xt" }, { role: "Retro", id: "analog-dreams" }, { role: "Hybrid", id: "splice-obsolete-machines" }, { role: "Space", id: "splice-tundra-atmos" },
  ] },
  { id: "period", name: "Period romance", brief: "Costumes, letters and long looks.", parts: [
    { role: "Orchestra", id: "bbcso-discover" }, { role: "Strings", id: "lux-strings" }, { role: "Piano", id: "toolbox-piano" }, { role: "Harp", id: "irish-harp" }, { role: "Bells", id: "splice-hand-bells" },
  ] },
  { id: "noir", name: "Noir and jazz", brief: "Smoke, rain, and a bad decision.", parts: [
    { role: "Trio", id: "diamond-trio" }, { role: "Keys", id: "sweetcase" }, { role: "Bass", id: "ample-p-lite" }, { role: "Sax", id: "monster-sax" }, { role: "Tape", id: "tape-choir" },
  ] },
  { id: "journey", name: "World journey", brief: "Distance, landscape and old roads.", parts: [
    { role: "Start here", id: "monster-ethnica" }, { role: "Solo", id: "duduk" }, { role: "Solo", id: "splice-uilleann-pipes" }, { role: "Plucked", id: "splice-charango" }, { role: "Plucked", id: "splice-dulcimer" }, { role: "Drone", id: "hurdy-gurdy" }, { role: "Sitar", id: "indian-dreamz" },
  ] },
  { id: "documentary", name: "Documentary and nature", brief: "Patient, curious, and out of the way.", parts: [
    { role: "Bed", id: "ethereal-earth" }, { role: "Bed", id: "hypha" }, { role: "Piano", id: "splice-glass-piano" }, { role: "Strings", id: "splice-frozen-strings" }, { role: "Air", id: "splice-tundra-atmos" }, { role: "Stretch", id: "paulxstretch" },
  ] },
];

// Popular "free" instruments that didn't make the list, so nobody goes looking for them.
export const LEFT_OUT: Array<{ name: string; why: string }> = [
  { name: "OB-Xd", why: "the free version bans commercial use. OB-Xf replaces it." },
  { name: "Keyzone Classic, Attic Grand", why: "no longer free." },
  { name: "Steven Slate Drums Free", why: "the maker's page only showed a paid product with a free trial." },
  { name: "Obelisk", why: "costs £20." },
  { name: "Spitfire LABS website", why: "it now redirects to Splice INSTRUMENT." },
];
