const workerCode = [
  'let timers = {};',
  "self.onmessage = (e) => {",
  "  const d = e.data;",
  "  if (d.cmd === 'start') {",
  "    if (timers[d.id]) clearInterval(timers[d.id]);",
  "    self.postMessage({ id: d.id });",
  "    timers[d.id] = setInterval(() => self.postMessage({ id: d.id }), d.ms);",
  "  } else if (d.cmd === 'stop') {",
  "    if (timers[d.id]) { clearInterval(timers[d.id]); delete timers[d.id]; }",
  "  } else if (d.cmd === 'stopAll') {",
  "    Object.keys(timers).forEach((k) => clearInterval(timers[k]));",
  "    timers = {};",
  "  }",
  "};"
].join('\n');

function createTimerWorker() {
  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
  } catch {
    console.warn('[timer] Web Worker indisponível — usando setInterval como fallback.');
    return null;
  }
}

const timerWorker = createTimerWorker();
const fallbackTimers = {};
const workerCallbacks = {};

export function startTimer(id, ms, callback) {
  stopTimer(id);
  workerCallbacks[id] = callback;
  if (timerWorker) {
    timerWorker.postMessage({ cmd: 'start', id, ms });
  } else {
    callback();
    fallbackTimers[id] = setInterval(callback, ms);
  }
}

export function stopTimer(id) {
  delete workerCallbacks[id];
  if (timerWorker) timerWorker.postMessage({ cmd: 'stop', id });
  if (fallbackTimers[id]) {
    clearInterval(fallbackTimers[id]);
    delete fallbackTimers[id];
  }
}

export function stopAllTimers() {
  Object.keys(workerCallbacks).forEach((k) => delete workerCallbacks[k]);
  if (timerWorker) timerWorker.postMessage({ cmd: 'stopAll' });
  Object.keys(fallbackTimers).forEach((k) => {
    clearInterval(fallbackTimers[k]);
    delete fallbackTimers[k];
  });
}

if (timerWorker) {
  timerWorker.onmessage = (e) => {
    const cb = workerCallbacks[e.data.id];
    if (cb) cb();
  };
}
