import type { SeededRandom } from './rng.js';

export type Vec2 = { x: number; y: number };

export type CreatureKind = 'fly' | 'ant' | 'beetle' | 'spider' | 'gecko' | 'larva';
export type CreatureState =
  | 'idle'
  | 'wander'
  | 'seekFood'
  | 'flee'
  | 'rest'
  | 'inspect'
  | 'feed'
  | 'hide'
  | 'climb'
  | 'fly'
  | 'land';

export type EcosystemCycle = 'dawn' | 'day' | 'night' | 'late';
export type EcosystemMood = 'quiet' | 'low' | 'med' | 'high';
export type PlantKind = 'stem' | 'grass' | 'fern' | 'vine' | 'moss' | 'fungus' | 'sprout';
export type ParticleKind = 'dust' | 'spore' | 'pollen' | 'moisture';
export type SurfaceLifeKind = 'moss' | 'mycelium' | 'fungus' | 'sprout';
export type VivariumEventKind =
  | 'sporeBurst'
  | 'condensationRun'
  | 'rootPulse'
  | 'mossBloom'
  | 'soilShift'
  | 'faunaPass'
  | 'rain';
export type VisualFocus = 'air' | 'soil' | 'plants' | 'fauna';
export type FaunaDensity = 'none' | 'low' | 'medium';
export type VisualNoise = 'low' | 'medium';
export type EventFrequency = 'rare' | 'normal';
export type ClockMode = 'simulated' | 'real';
export type DebugOverlay = 'minimal' | 'full';

export type Branch = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;
  alpha: number;
};

export type Creature = {
  id: string;
  kind: CreatureKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: -1 | 1;
  energy: number;
  state: CreatureState;
  stateTime: number;
  size: number;
  layer: number;
  seed: number;
  variant: number;
  target?: Vec2;
  home?: Vec2;
  route?: [Vec2, Vec2];
  carryingFood?: boolean;
  hidden?: boolean;
  animationTime: number;
  decisionTime: number;
};

export type Plant = {
  id: string;
  kind: PlantKind;
  x: number;
  rootY: number;
  height: number;
  lean: number;
  phase: number;
  sway: number;
  moisture: number;
  life: number;
  age: number;
  growth: number;
  health: number;
  sporeRate: number;
  layer: number;
  leaves: number;
  nextSpore: number;
  branches: Branch[];
  visibleSegments: number;
};

export type SurfaceLife = {
  id: string;
  kind: SurfaceLifeKind;
  x: number;
  y: number;
  width: number;
  phase: number;
  moisture: number;
  growth: number;
  alpha: number;
  nextSpore: number;
};

export type Particle = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  life: number;
  maxLife: number;
  seed: number;
  kind: ParticleKind;
};

export type VivariumEvent = {
  id: string;
  kind: VivariumEventKind;
  x: number;
  y: number;
  radius: number;
  age: number;
  duration: number;
  intensity: number;
  layer: number;
  affectsFauna: boolean;
};

export type VivariumProductivity = {
  completedTasksToday: number;
  totalTasksToday: number;
  focusLevel?: number;
};

export type VivariumConfig = {
  worldWidth: number;
  worldHeight: number;
  updateHz: number;
  renderFps: number;
  dayLengthSeconds: number;
  clockMode: ClockMode;
  screensaverSeconds: number;
  numberOfFlies: number;
  numberOfAnts: number;
  numberOfParticles: number;
  plantCount: number;
  surfaceLifeCount: number;
  fungusCount: number;
  sporeDensity: number;
  enableFauna: boolean;
  faunaDensity: FaunaDensity;
  visualNoise: VisualNoise;
  eventFrequency: EventFrequency;
  debugOverlay: DebugOverlay;
  enableGecko: boolean;
  enableSpider: boolean;
  enableLarva: boolean;
  showDebug: boolean;
  reducedMotionScale: number;
  parallaxDriftAmp: number;
  lSystemDepth: number;
};

export type Camera = {
  driftX: number;
  driftY: number;
  pointerX: number;
  pointerY: number;
};

export type WorldState = {
  width: number;
  height: number;
  floorY: number;
  airTop: number;
  seed: number;
  creatures: Creature[];
  plants: Plant[];
  surfaceLife: SurfaceLife[];
  particles: Particle[];
  events: VivariumEvent[];
  viewportWidth: number;
  viewportHeight: number;
  eventCooldown: number;
  lightLevel: number;
  humidity: number;
  activityLevel: number;
  botanicalActivity: number;
  warmth: number;
  timeOfDay: number;
  dayPhase: number;
  wind: number;
  cycle: EcosystemCycle;
  ecosystemMood: EcosystemMood;
  visualFocus: VisualFocus;
  clarityMode: boolean;
  productivity: VivariumProductivity;
  reducedMotion: boolean;
  active: boolean;
  hidden: boolean;
  elapsed: number;
  visualElapsed: number;
  /** Horizontal cloud drift (seconds-equivalent), advanced in the sim loop. */
  cloudScroll: number;
  camera: Camera;
  cacheInvalid: boolean;
  lastLightBand: number;
};

export type Perception = {
  predators: Creature[];
  prey: Creature[];
  neighbors: Creature[];
  plants: Plant[];
  event?: VivariumEvent;
  nearLeft: boolean;
  nearRight: boolean;
  nearFloor: boolean;
};

export type HudSnapshot = {
  flora: number;
  fauna: number;
  cycle: EcosystemCycle;
  humidity: number;
  event: string;
  seed: string;
  dayPhase: number;
};

export type RenderContext = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  px: (x: number, y: number, width?: number, height?: number, alpha?: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number, alpha?: number) => void;
  text: (value: string, x: number, y: number, alpha?: number) => void;
};

export type System = {
  id: string;
  update: (world: WorldState, dt: number, rng: SeededRandom, config: VivariumConfig) => void;
};

export type Layer = {
  id: string;
  z: number;
  cache?: boolean;
  /** Parallax applied when blitting a cached layer (not baked into draw). */
  parallaxFactor?: number;
  invalidate?: (world: WorldState) => boolean;
  draw: (rc: RenderContext, world: WorldState) => void;
};
