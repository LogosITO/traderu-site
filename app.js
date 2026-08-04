import { buildPaperPortfolio, parseMoney, parsePercent, positionCost, positionMarket, positionPnl, selectStrategy, STRATEGIES, totals } from './portfolio.mjs';

const STORAGE_KEY = 'market-sentinel-bot-v2';
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

async function fetchQuotes() {
  const response = await fetch(`quotes.json?v=${Date.now()}`, { cache:'no-store' });
  const published = response.ok ? await response.json() : null;
  if (published?.quotes?.length >= 8) return published;
  throw new Error('Котировки обновляются. Попробуйте ещё раз через несколько минут.');
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
  $('strategyName').textContent = STRATEGIES[state.strategy] || 'Ранее собранный портфель';
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
    const feed = await fetchQuotes(), quotes = feed.quotes;
    const byTicker = new Map(quotes.map(quote => [quote.ticker, quote]));
    state.positions = state.positions.map(item => ({ ...item, currentPrice:byTicker.get(item.ticker)?.price ?? item.currentPrice }));
    state.updatedAt = feed.updatedAt; save(); render();
    $('quoteStatus').textContent = `Котировки MOEX от ${formatDate(feed.updatedAt)}`;
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
    const feed = await fetchQuotes(), strategy = $('strategy').value;
    state = buildPaperPortfolio(selectStrategy(feed.quotes, strategy), budget, commissionBps);
    state.strategy = strategy;
    state.updatedAt = feed.updatedAt; save(); render();
    $('quoteStatus').textContent = `Портфель собран по котировкам от ${formatDate(feed.updatedAt)}`;
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
