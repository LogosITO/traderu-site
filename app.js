import { buildPaperPortfolio, parseMoney, parsePercent, positionCost, positionMarket, positionPnl, totals } from './portfolio.mjs';

const STORAGE_KEY = 'market-sentinel-bot-v2';
const UNIVERSE = ['SBER', 'LKOH', 'GAZP', 'YDEX', 'NVTK', 'ROSN'];
const ISS = 'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities';
const rub = new Intl.NumberFormat('ru-RU', { style:'currency', currency:'RUB', maximumFractionDigits:2 });
const pct = new Intl.NumberFormat('ru-RU', { style:'percent', signDisplay:'exceptZero', maximumFractionDigits:2 });
const $ = id => document.getElementById(id);
let state = load();

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (validState(value)) return value;
  } catch (_) { /* invalid local state is ignored */ }
  return null;
}

function validState(value) {
  return value && Number.isSafeInteger(value.budget) && Number.isSafeInteger(value.cash) &&
    typeof value.createdAt === 'string' && Array.isArray(value.positions) && value.positions.every(item =>
      /^[A-Z0-9-]{1,12}$/.test(item.ticker) && ['lots','lotSize','entryPrice','currentPrice'].every(key => Number.isSafeInteger(item[key]) && item[key] > 0) &&
      Number.isSafeInteger(item.commission) && item.commission >= 0);
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function money(value) { return rub.format(value / 100); }
function tone(value) { return value > 0 ? 'positive' : value < 0 ? 'negative' : ''; }
function formatDate(value) { return new Intl.DateTimeFormat('ru-RU', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[char]); }

function tableRow(table) {
  if (!table?.data?.length) return null;
  return Object.fromEntries(table.columns.map((column, index) => [column, table.data[0][index]]));
}

async function fetchQuote(ticker) {
  const fields = 'iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,SHORTNAME,LOTSIZE&marketdata.columns=SECID,LAST,MARKETPRICE,LCLOSEPRICE';
  const response = await fetch(`${ISS}/${ticker}.json?${fields}`, { signal:AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`MOEX: ${response.status}`);
  const data = await response.json();
  const security = tableRow(data.securities), market = tableRow(data.marketdata);
  const price = market?.LAST ?? market?.MARKETPRICE ?? market?.LCLOSEPRICE;
  if (!security || !Number.isFinite(price) || price <= 0) return null;
  return { ticker, name:security.SHORTNAME || ticker, lotSize:security.LOTSIZE, price:Math.round(price * 100) };
}

async function fetchQuotes() {
  const results = await Promise.allSettled(UNIVERSE.map(fetchQuote));
  const quotes = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
  if (quotes.length < 2) throw new Error('MOEX сейчас не отвечает. Попробуйте ещё раз позже.');
  return quotes;
}

function render() {
  $('portfolio').hidden = !state;
  if (!state) return;
  const total = totals(state);
  $('budgetValue').textContent = money(state.budget);
  $('equityValue').textContent = money(total.equity);
  $('cashValue').textContent = money(state.cash);
  $('pnlValue').textContent = `${total.pnl > 0 ? '+' : ''}${money(total.pnl)}`;
  $('pnlValue').className = tone(total.pnl);
  $('pnlPercent').textContent = pct.format(total.pnl / state.budget);
  $('portfolioDate').textContent = `Портфель собран ${formatDate(state.createdAt)}`;
  $('updatedAt').textContent = `Обновлено ${formatDate(state.updatedAt)}`;
  $('positions').innerHTML = state.positions.map(item => {
    const pnl = positionPnl(item);
    return `<article class="position">
      <div><strong class="ticker">${escapeHtml(item.ticker)}</strong><span>${escapeHtml(item.name)}</span></div>
      <div><strong>${item.lots} лот.</strong><span>${item.lots * item.lotSize} акций</span></div>
      <div><strong>${money(item.entryPrice)}</strong><span>цена входа</span></div>
      <div><strong>${money(item.currentPrice)}</strong><span>сейчас</span></div>
      <div><strong class="${tone(pnl)}">${pnl > 0 ? '+' : ''}${money(pnl)}</strong><span>${pct.format(pnl / positionCost(item))}</span></div>
    </article>`;
  }).join('');
}

async function refresh() {
  if (!state) return;
  setBusy(true, 'Получаем свежие цены…');
  try {
    const quotes = await fetchQuotes();
    const byTicker = new Map(quotes.map(quote => [quote.ticker, quote]));
    state.positions = state.positions.map(item => ({ ...item, currentPrice:byTicker.get(item.ticker)?.price ?? item.currentPrice }));
    state.updatedAt = new Date().toISOString(); save(); render();
    $('quoteStatus').textContent = 'Котировки MOEX обновлены';
  } catch (error) { $('quoteStatus').textContent = error.message; }
  finally { setBusy(false); }
}

function setBusy(busy, message = '') {
  $('startButton').disabled = busy;
  $('refreshButton').disabled = busy;
  if (message) $('quoteStatus').textContent = message;
}

$('botForm').addEventListener('submit', async event => {
  event.preventDefault(); $('setupMessage').textContent = '';
  if (state && !confirm('Заменить текущий PAPER-портфель новым?')) return;
  try {
    const budget = parseMoney($('budget').value), commissionBps = parsePercent($('commission').value);
    setBusy(true); $('startButton').firstChild.textContent = 'Получаем цены… ';
    const quotes = await fetchQuotes();
    state = buildPaperPortfolio(quotes, budget, commissionBps); save(); render();
    $('quoteStatus').textContent = 'Портфель собран по котировкам MOEX';
    $('portfolio').scrollIntoView({ behavior:'smooth', block:'start' });
  } catch (error) { $('setupMessage').textContent = error.message; }
  finally { setBusy(false); $('startButton').firstChild.textContent = 'Собрать портфель '; }
});

$('refreshButton').addEventListener('click', refresh);
$('resetButton').addEventListener('click', () => {
  if (!confirm('Удалить сохранённый PAPER-портфель?')) return;
  state = null; localStorage.removeItem(STORAGE_KEY); render(); window.scrollTo({ top:0, behavior:'smooth' });
});
$('year').textContent = new Date().getFullYear();
render();
if (state) refresh();
