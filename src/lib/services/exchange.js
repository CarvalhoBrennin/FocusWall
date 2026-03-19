import { CONFIG } from '../config.js';

function parseRateTimestamp(payload) {
  const cd = typeof payload?.USDBRL?.create_date === 'string' ? payload.USDBRL.create_date : '';
  if (cd.trim()) {
    const parsed = new Date(cd.replace(' ', 'T'));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const ts = Number(payload?.USDBRL?.timestamp);
  return Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : new Date().toISOString();
}

/** AwesomeAPI: varBid, pctChange podem vir como string (ex. "0,02"). Converte para number. */
function parseApiNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parsePairVariation(obj) {
  if (!obj || typeof obj !== 'object') return { varBid: null, pctChange: null };
  return {
    varBid: parseApiNumber(obj.varBid),
    pctChange: parseApiNumber(obj.pctChange)
  };
}

/**
 * @param {AbortController} [controller] - Optional controller for external abort (e.g. on pause)
 */
export async function fetchExchangeRates(controller) {
  const ctrl = controller ?? new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), CONFIG.RATE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(CONFIG.EXCHANGE_API_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const payload = await response.json();
    const usd = Number(payload?.USDBRL?.bid);
    const eur = Number(payload?.EURBRL?.bid);
    if (!Number.isFinite(usd) || !Number.isFinite(eur)) throw new Error('Payload inválido');

    const usdVar = parsePairVariation(payload?.USDBRL);
    const eurVar = parsePairVariation(payload?.EURBRL);

    return {
      usd,
      eur,
      usdVarBid: usdVar.varBid,
      usdPctChange: usdVar.pctChange,
      eurVarBid: eurVar.varBid,
      eurPctChange: eurVar.pctChange,
      updatedAt: parseRateTimestamp(payload),
      fetchedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
