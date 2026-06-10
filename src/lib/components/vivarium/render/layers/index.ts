// Clouds are intentionally disabled; re-add when the sky pass is redesigned.
// import { cloudsLayer } from './clouds.js';
import { eventsLayer } from './events.js';
// Fauna is intentionally disabled. Keep the layer import documented for later reactivation.
// import { faunaLayer } from './events.js';
import { glassLayer } from './glass.js';
import { landscapeLayer } from './landscape.js';
import { particlesLayer } from './particles.js';
// Foreground plants are intentionally disabled; re-add plantsLayer when L-system flora is redesigned.
// import { plantsLayer } from './plants.js';
import { skyLayer } from './sky.js';
import { surfaceLifeLayer } from './surface-life.js';
import type { Layer } from '../../core/types.js';

export function buildLayers(): Layer[] {
  return [
    skyLayer,
    landscapeLayer,
    // cloudsLayer,
    surfaceLifeLayer,
    // plantsLayer,
    particlesLayer,
    eventsLayer,
    // Fauna is intentionally disabled; re-add faunaLayer when the animals are redesigned.
    // faunaLayer,
    glassLayer
  ].sort((a, b) => a.z - b.z);
}
