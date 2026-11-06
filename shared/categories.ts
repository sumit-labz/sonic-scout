import type { CategoryId } from "./types";

export interface Category {
  id: CategoryId;
  name: string;
  terms: string[];
}

export const CATEGORIES: Category[] = [
  { id: "human", name: "Human", terms: ["breathing", "heartbeat", "footsteps", "whispers", "crying", "laughter", "crowds"] },
  { id: "environment", name: "Environment", terms: ["wind", "rain", "traffic", "forest", "river", "birds", "market", "railway station"] },
  { id: "foley", name: "Foley", terms: ["door", "footsteps", "fabric", "objects", "glass", "metal", "furniture"] },
  { id: "mechanical", name: "Mechanical", terms: ["clock", "motor", "engine", "machine", "electrical hum"] },
  { id: "musical", name: "Musical", terms: ["bansuri", "tabla", "sitar", "piano", "strings", "percussion"] },
  { id: "cinematic", name: "Cinematic", terms: ["impact", "drone", "riser", "transition", "suspense texture"] },
  { id: "abstract", name: "Abstract", terms: ["reversed", "granular texture", "distorted voice", "experimental noise"] },
];
