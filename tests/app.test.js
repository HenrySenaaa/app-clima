const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, tick } = require('./helpers');

const fixtures = {
  forecast: require('./fixtures/forecast.json'),
  geocoding: require('./fixtures/geocoding.json'),
  reverse: require('./fixtures/reverse.json')
};

/** Previsão real com o código de tempo/dia-noite trocados para testar os temas. */
function forecastWith(code, isDay = 1) {
  const json = structuredClone(fixtures.forecast);
  json.current.weather_code = code;
  json.current.is_day = isDay;
  return json;
}

function setup({ forecast = fixtures.forecast, geocoding = fixtures.geocoding, geolocation, storage, fail } = {}) {
  const requests = [];
  const dom = loadPage({
    storage,
    beforeParse(window) {
      window.fetch = (url) => {
        requests.push(decodeURIComponent(url));
        if (fail) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
        let body = forecast;
        if (url.includes('geocoding-api')) body = geocoding;
        if (url.includes('nominatim')) body = fixtures.reverse;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(structuredClone(body)) });
      };
      if (geolocation) {
        Object.defineProperty(window.navigator, 'geolocation', { value: geolocation, configurable: true });
      }
    }
  });
  const w = dom.window;
  const doc = w.document;
  const $ = (id) => doc.getElementById(id);
  const search = (city, index = 0) => {
    const form = doc.querySelectorAll('.search')[index];
    form.querySelector('input').value = city;
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  };
  return { w, doc, $, requests, search, close: () => w.close() };
}

test('tela inicial pede a cidade e oferece geolocalização', (t) => {
  const { doc, $, close } = setup();
  t.after(close);
  assert.equal($('screen-welcome').hidden, false);
  assert.equal($('screen-weather').hidden, true);
  assert.ok(doc.querySelector('#screen-welcome input[name="city"]'));
  assert.match(doc.querySelector('#screen-welcome [data-action="geolocate"]').textContent, /Usar minha localização/);
});

test('buscar cidade mostra temperatura, sensação, umidade e 3 dias', async (t) => {
  const { doc, $, requests, search, close } = setup();
  t.after(close);
  search('São Paulo');
  await tick(20);

  assert.match(requests[0], /geocoding-api.*name=São Paulo/);
  assert.match(requests[1], /api\.open-meteo\.com\/v1\/forecast\?latitude=-23\.5475&longitude=-46\.63611/);

  const c = fixtures.forecast.current;
  assert.equal($('screen-weather').hidden, false);
  assert.equal($('screen-welcome').hidden, true);
  assert.equal($('place').textContent, 'São Paulo, Brasil');
  assert.equal($('current-temp').textContent, Math.round(c.temperature_2m) + '°');
  assert.equal($('feels-like').textContent, Math.round(c.apparent_temperature) + '°C');
  assert.equal($('humidity').textContent, c.relative_humidity_2m + '%');
  assert.equal(doc.querySelectorAll('#forecast .day').length, 3);
  assert.equal(doc.querySelector('.day__name').textContent, 'Amanhã');
  assert.equal($('loading').hidden, true);
});

test('fundo e ícones mudam conforme o clima retornado', async (t) => {
  const cases = [
    [61, 1, 'rain', 'Rain', 'drop'],
    [0, 1, 'clear-day', 'Clear', 'sun'],
    [0, 0, 'clear-night', 'Clear', 'star'],
    [3, 1, 'clouds-day', 'Clouds', 'cloud'],
    [95, 1, 'thunderstorm', 'Thunderstorm', 'drop'],
    [73, 1, 'snow', 'Snow', 'flake']
  ];
  for (const [code, isDay, theme, main, particle] of cases) {
    const { doc, $, search, close } = setup({ forecast: forecastWith(code, isDay) });
    search('São Paulo');
    await tick(20);
    assert.equal(doc.body.dataset.theme, theme, `código ${code}`);
    assert.equal(doc.body.dataset.weather, main);
    assert.ok($('sky').querySelector('.particle--' + particle), `partículas "${particle}" para ${theme}`);
    assert.ok($('current-icon').textContent.length > 0);
    close();
  }
});

test('ícone muda entre sol (Clear) e chuva (Rain)', async (t) => {
  const sunny = setup({ forecast: forecastWith(0, 1) });
  t.after(sunny.close);
  sunny.search('Recife');
  await tick(20);
  const rainy = setup({ forecast: forecastWith(63, 1) });
  t.after(rainy.close);
  rainy.search('Recife');
  await tick(20);
  assert.equal(sunny.$('current-icon').textContent, '☀️');
  assert.equal(rainy.$('current-icon').textContent, '🌧️');
  assert.equal(rainy.$('current-condition').textContent, 'Chuva');
});

test('cidade inexistente mostra mensagem amigável', async (t) => {
  const { $, search, close } = setup({ geocoding: { generationtime_ms: 1 } });
  t.after(close);
  search('Cidadeinexistente');
  await tick(20);
  assert.equal($('message').hidden, false);
  assert.match($('message').textContent, /não encontrada/);
  assert.equal($('screen-weather').hidden, true);
});

test('erro de rede mostra mensagem', async (t) => {
  const { $, search, close } = setup({ fail: true });
  t.after(close);
  search('Recife');
  await tick(20);
  assert.match($('message').textContent, /Erro ao buscar a cidade/);
  assert.equal($('loading').hidden, true);
});

test('"Usar minha localização" usa a Geolocation API e mostra o nome da cidade', async (t) => {
  const geolocation = {
    getCurrentPosition(success) { success({ coords: { latitude: -8.0476, longitude: -34.877 } }); }
  };
  const { doc, $, requests, close } = setup({ geolocation });
  t.after(close);
  doc.querySelector('[data-action="geolocate"]').click();
  await tick(20);
  assert.match(requests[0], /nominatim.*lat=-8\.0476&lon=-34\.877/);
  assert.match(requests[1], /forecast\?latitude=-8\.0476&longitude=-34\.877/);
  assert.equal($('place').textContent, 'Recife, Pernambuco, Brasil');
  assert.equal($('screen-weather').hidden, false);
});

test('permissão de localização negada mostra aviso', (t) => {
  const geolocation = { getCurrentPosition(_, error) { error({ code: 1 }); } };
  const { doc, $, close } = setup({ geolocation });
  t.after(close);
  doc.querySelector('[data-action="geolocate"]').click();
  assert.match($('message').textContent, /Permissão de localização negada/);
});

test('sugestões de cidades aparecem ao digitar e podem ser escolhidas', async (t) => {
  const { w, doc, $, close } = setup();
  t.after(close);
  const input = doc.querySelector('#screen-welcome input');
  input.value = 'São Paulo';
  input.dispatchEvent(new w.Event('input'));
  await tick(350);

  const items = doc.querySelectorAll('#screen-welcome .suggestion');
  assert.equal(items.length, fixtures.geocoding.results.length);
  assert.equal(items[1].textContent, 'Frei Paulo, Sergipe, Brasil');
  items[1].click();
  await tick(20);
  assert.equal($('place').textContent, 'Frei Paulo, Sergipe, Brasil');
});

test('reabre automaticamente a última cidade consultada', async (t) => {
  const first = setup();
  t.after(first.close);
  first.search('São Paulo');
  await tick(20);
  const saved = first.w.localStorage.getItem('clima:ultima-cidade');
  assert.ok(saved);

  const second = setup({ storage: { 'clima:ultima-cidade': saved } });
  t.after(second.close);
  await tick(20);
  assert.equal(second.$('screen-weather').hidden, false);
  assert.equal(second.$('place').textContent, 'São Paulo, Brasil');
});
