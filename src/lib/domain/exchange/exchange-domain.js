import { getBrazilDateKey } from '../../utils/state.js';

export function buildRateMeta(updatedAtIso, prefix) {
  const date = new Date(updatedAtIso);
  if (Number.isNaN(date.getTime())) return prefix + '.';
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
  return prefix + ' às ' + time + '.';
}

export function hasDisplayableRates(cache) {
  return Boolean(cache && Number.isFinite(cache.usd) && Number.isFinite(cache.eur));
}

export function mergeFreshRatesIntoState(state, freshRates, now = new Date()) {
  const todayInBrazil = getBrazilDateKey(now);
  const currentBaseline = state.ratesBaseline;
  const shouldResetBaseline = !currentBaseline || currentBaseline.dayKey !== todayInBrazil;

  return {
    ...state,
    ratesCache: freshRates,
    ratesBaseline: shouldResetBaseline
      ? { dayKey: todayInBrazil, usd: freshRates.usd, eur: freshRates.eur }
      : currentBaseline
  };
}
