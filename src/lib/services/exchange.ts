import { CONFIG } from '../config.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRateTimestamp(payload) {
  const cd = typeof payload?.USDBRL?.create_date === 'string' ? payload.USDBRL.create_date : '';
  if (cd.trim()) {
    const parsed = new Date(cd.replace(' ', 'T'));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const ts = Number(payload?.USDBRL?.timestamp);
  return Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : new Date().toISOString();
}

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

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Resposta inválida da API');
  }
  const usdObj = payload.USDBRL;
  const eurObj = payload.EURBRL;
  if (!usdObj || typeof usdObj !== 'object' || !eurObj || typeof eurObj !== 'object') {
    throw new Error('Pares de câmbio ausentes na resposta');
  }
  const usd = parseApiNumber(usdObj.bid);
  const eur = parseApiNumber(eurObj.bid);
  if (usd == null || eur == null || usd <= 0 || eur <= 0 || usd > 1000 || eur > 1000) {
    throw new Error('Valores de câmbio fora do intervalo esperado');
  }
  return { usd, eur, usdObj, eurObj };
}

async function fetchOnce(controller) {
  const ctrl = controller ?? new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), CONFIG.RATE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(CONFIG.EXCHANGE_API_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
      throw new Error('Resposta não é JSON');
    }

    const payload = await response.json();
    const { usd, eur, usdObj, eurObj } = validatePayload(payload);
    const usdVar = parsePairVariation(usdObj);
    const eurVar = parsePairVariation(eurObj);

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

export async function fetchExchangeRates(controller) {
  let lastError = null;

  for (let attempt = 0; attempt < CONFIG.EXCHANGE_MAX_RETRIES; attempt += 1) {
    try {
      return await fetchOnce(controller);
    } catch (err) {
      lastError = err;
      if (attempt < CONFIG.EXCHANGE_MAX_RETRIES - 1) {
        await sleep(CONFIG.EXCHANGE_RETRY_BASE_MS * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error('Falha ao buscar cotações');
}
