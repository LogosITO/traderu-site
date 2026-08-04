import { parseMoney, positionCost, positionMarket, positionPnl, totals } from './portfolio.mjs';

const STORAGE_KEY = 'market-sentinel-paper-v1';
const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 });

const demo = {
  initialCapital: 1_000_000_00,
  positions: [
    { ticker: 'SBER', lots: 12, lotSize: 10, buyPrice: 318_40, currentPrice: 326_75, commission: 48_00 },
    { ticker: 'LKOH', lots: 4, lotSize: 1, buyPrice: 7102_00, currentPrice: 7248_50, commission: 34_00 },
    { ticker: 'YDEX', lots: 3, lotSize: 1, buyPrice: 4025_00, currentPrice: 4170_00, commission: 18_00 }
  ]
};

let state = load();
const $ = id => document.getElementById(id);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Number.isSafeInteger(saved.initialCapital) && saved.initialCapital >= 0 && Array.isArray(saved.positions) && saved.positions.every(validPosition)) return saved;
  } catch (_) { /* corrupted local state falls back to demo */ }
  return structuredClone(demo);
}

function validPosition(item) {
  return item && /^[A-Z0-9-]{1,12}$/.test(item.ticker) &&
    ['lots', 'lotSize', 'buyPrice', 'currentPrice', 'commission'].every(key => Number.isSafeInteger(item[key]) && item[key] >= (key === 'commission' ? 0 : 1)) &&
    Number.isSafeInteger(positionCost(item)) && Number.isSafeInteger(positionMarket(item));
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function money(kopecks) { return rub.format(kopecks / 100); }
function tone(value) { return value > 0 ? 'positive' : value < 0 ? 'negative' : ''; }

function render() {
  const total = totals(state);
  $('initialValue').textContent = money(state.initialCapital);
  $('cashValue').textContent = money(total.cash);
  $('cashValue').className = tone(total.cash);
  $('cashHint').textContent = total.cash < 0 ? 'капитал превышен' : 'для новых идей';
  $('marketValue').textContent = money(total.market);
  $('positionsHint').textContent = `${state.positions.length} ${plural(state.positions.length, 'позиция', 'позиции', 'позиций')}`;
  $('pnlValue').textContent = `${total.pnl > 0 ? '+' : ''}${money(total.pnl)}`;
  $('pnlValue').className = tone(total.pnl);
  $('pnlPercent').textContent = total.invested ? percent.format(total.pnl / total.invested) : 'нет позиций';
  $('initialCapital').value = (state.initialCapital / 100).toFixed(2).replace('.', ',');

  $('positionsBody').innerHTML = state.positions.map((item, index) => {
    const pnl = positionPnl(item);
    const pnlRatio = positionCost(item) ? pnl / positionCost(item) : 0;
    return `<tr>
      <td><strong class="ticker">${escapeHtml(item.ticker)}</strong><small>MOEX · лот ${item.lotSize}</small></td>
      <td><strong>${item.lots} лот.</strong><small>${item.lots * item.lotSize} шт.</small></td>
      <td>${money(item.buyPrice)}</td><td>${money(item.currentPrice)}</td>
      <td><strong>${money(positionMarket(item))}</strong><small>комиссия ${money(item.commission)}</small></td>
      <td class="${tone(pnl)}"><strong>${pnl > 0 ? '+' : ''}${money(pnl)}</strong><small>${percent.format(pnlRatio)}</small></td>
      <td><button class="remove" type="button" data-remove="${index}" aria-label="Удалить ${escapeHtml(item.ticker)}">×</button></td>
    </tr>`;
  }).join('');

  const empty = state.positions.length === 0;
  $('emptyState').hidden = !empty;
  $('tableWrap').hidden = empty;
  $('allocation').hidden = empty;
  $('donutCount').textContent = state.positions.length;
  $('allocationList').innerHTML = state.positions
    .slice().sort((a, b) => positionMarket(b) - positionMarket(a))
    .map(item => {
      const share = total.market ? positionMarket(item) / total.market : 0;
      return `<div class="allocation-row"><span>${escapeHtml(item.ticker)}</span><div class="bar"><i style="width:${share * 100}%"></i></div><b>${Math.round(share * 100)}%</b></div>`;
    }).join('');
}

function plural(value, one, few, many) {
  const mod10 = value % 10, mod100 = value % 100;
  return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

$('positionForm').addEventListener('submit', event => {
  event.preventDefault();
  $('formError').textContent = '';
  try {
    const data = new FormData(event.currentTarget);
    const item = {
      ticker: String(data.get('ticker')).trim().toUpperCase(),
      lots: Number(data.get('lots')),
      lotSize: Number(data.get('lotSize')),
      buyPrice: parseMoney(data.get('buyPrice')),
      currentPrice: parseMoney(data.get('currentPrice')),
      commission: parseMoney(data.get('commission'))
    };
    if (!/^[A-Z0-9-]{1,12}$/.test(item.ticker)) throw new Error('Тикер: латиница, цифры и дефис');
    if (!Number.isSafeInteger(item.lots) || item.lots < 1 || !Number.isSafeInteger(item.lotSize) || item.lotSize < 1) throw new Error('Лоты и размер лота должны быть целыми');
    if (!Number.isSafeInteger(positionCost(item)) || !Number.isSafeInteger(positionMarket(item))) throw new Error('Позиция слишком большая');
    const existing = state.positions.findIndex(position => position.ticker === item.ticker);
    if (existing >= 0) throw new Error(`${item.ticker} уже есть в портфеле`);
    state.positions.push(item);
    save(); render();
    event.currentTarget.reset();
    $('lots').value = 1; $('lotSize').value = 10; $('commission').value = 0;
  } catch (error) { $('formError').textContent = error.message; }
});

$('positionsBody').addEventListener('click', event => {
  const button = event.target.closest('[data-remove]');
  if (!button) return;
  state.positions.splice(Number(button.dataset.remove), 1); save(); render();
});

$('initialCapital').addEventListener('change', event => {
  try { state.initialCapital = parseMoney(event.target.value); save(); render(); }
  catch (error) { event.target.setCustomValidity(error.message); event.target.reportValidity(); event.target.setCustomValidity(''); render(); }
});

$('demoButton').addEventListener('click', () => {
  if (state.positions.length && !confirm('Заменить текущий портфель демонстрационным?')) return;
  state = structuredClone(demo); save(); render();
});
$('clearButton').addEventListener('click', () => {
  if (!state.positions.length || !confirm('Удалить все позиции из PAPER-портфеля?')) return;
  state.positions = []; save(); render();
});
$('year').textContent = new Date().getFullYear();
render();
