const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
const forecast = require('./fixtures/forecast.json');
const geocoding = require('./fixtures/geocoding.json');
const reverse = require('./fixtures/reverse.json');

const params = (url) => Object.fromEntries(new URL(url).searchParams);

test('URLs das APIs têm os parâmetros esperados', () => {
  const geo = params(L.buildGeocodingUrl('  São Paulo '));
  assert.equal(geo.name, 'São Paulo');
  assert.equal(geo.language, 'pt');

  const f = params(L.buildForecastUrl(-23.5, -46.6));
  assert.equal(f.latitude, '-23.5');
  assert.equal(f.longitude, '-46.6');
  assert.match(f.current, /temperature_2m/);
  assert.match(f.current, /apparent_temperature/);
  assert.match(f.current, /relative_humidity_2m/);
  assert.match(f.daily, /weather_code/);
  assert.equal(f.forecast_days, '4');
  assert.equal(f.timezone, 'auto');

  const r = params(L.buildReverseUrl(-8.05, -34.9));
  assert.equal(r.lat, '-8.05');
  assert.equal(r['accept-language'], 'pt');
});

test('describeWeather mapeia códigos WMO para as categorias Clear/Clouds/Rain...', () => {
  assert.equal(L.describeWeather(0, true).main, 'Clear');
  assert.equal(L.describeWeather(3, true).main, 'Clouds');
  assert.equal(L.describeWeather(45, true).main, 'Fog');
  assert.equal(L.describeWeather(53, true).main, 'Drizzle');
  assert.equal(L.describeWeather(63, true).main, 'Rain');
  assert.equal(L.describeWeather(81, true).main, 'Rain');
  assert.equal(L.describeWeather(75, true).main, 'Snow');
  assert.equal(L.describeWeather(95, true).main, 'Thunderstorm');
  assert.equal(L.describeWeather(1234, true).label, 'Indefinido');
});

test('describeWeather escolhe tema e ícone de dia/noite', () => {
  assert.deepEqual(L.describeWeather(0, true), { main: 'Clear', label: 'Céu limpo', icon: '☀️', theme: 'clear-day' });
  assert.equal(L.describeWeather(0, false).theme, 'clear-night');
  assert.equal(L.describeWeather(0, false).icon, '🌙');
  assert.equal(L.describeWeather(2, false).theme, 'clouds-night');
  assert.equal(L.describeWeather(61, true).theme, 'rain');
  assert.equal(L.describeWeather(51, true).theme, 'rain', 'garoa usa o visual de chuva');
  assert.equal(L.describeWeather(96, true).theme, 'thunderstorm');
});

test('formatDayName usa Hoje/Amanhã e dias da semana em português', () => {
  assert.equal(L.formatDayName('2026-10-21', '2026-10-21'), 'Hoje');
  assert.equal(L.formatDayName('2026-10-22', '2026-10-21'), 'Amanhã');
  assert.equal(L.formatDayName('2026-10-23', '2026-10-21'), 'Sexta');
  assert.equal(L.formatDayName('2026-10-25'), 'Domingo');
  assert.equal(L.formatShortDate('2026-01-05'), '05/01');
});

test('parseForecast extrai o clima atual e os próximos 3 dias da resposta real', () => {
  const data = L.parseForecast(forecast);
  const c = forecast.current;
  assert.equal(data.current.temp, Math.round(c.temperature_2m));
  assert.equal(data.current.feelsLike, Math.round(c.apparent_temperature));
  assert.equal(data.current.humidity, c.relative_humidity_2m);
  assert.equal(data.current.isDay, c.is_day === 1);
  assert.equal(data.days.length, 3);
  assert.equal(data.days[0].date, forecast.daily.time[1], 'começa amanhã');
  assert.equal(data.days[0].name, 'Amanhã');
  data.days.forEach((d) => {
    assert.equal(typeof d.max, 'number');
    assert.ok(d.max >= d.min);
    assert.ok(d.weather.icon);
  });
});

test('parseForecast evita "-0" e rejeita resposta inválida', () => {
  const json = structuredClone(forecast);
  json.current.temperature_2m = -0.3;
  assert.equal(Object.is(L.parseForecast(json).current.temp, -0), false);
  assert.throws(() => L.parseForecast({}), /inválida/);
});

test('placeFromGeocoding monta o nome com estado e país', () => {
  const place = L.placeFromGeocoding(geocoding.results[0]);
  assert.equal(place.name, 'São Paulo');
  assert.equal(place.label, 'São Paulo, Brasil', 'não repete o nome quando estado = cidade');
  assert.equal(typeof place.latitude, 'number');
  assert.equal(L.formatPlace({ name: 'Frei Paulo', admin1: 'Sergipe', country: 'Brasil' }), 'Frei Paulo, Sergipe, Brasil');
});

test('placeFromReverse lê a cidade do Nominatim e tem fallback', () => {
  assert.deepEqual(L.placeFromReverse(reverse, -8.05, -34.9), {
    name: 'Recife', label: 'Recife, Pernambuco, Brasil', latitude: -8.05, longitude: -34.9
  });
  assert.equal(L.placeFromReverse(null, 1, 2).name, 'Sua localização');
});

test('última cidade é salva e lida do storage', () => {
  const data = {};
  const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  assert.equal(L.loadLastPlace(storage), null);
  const place = { name: 'Recife', label: 'Recife, Pernambuco, Brasil', latitude: -8.05, longitude: -34.9 };
  L.saveLastPlace(storage, place);
  assert.deepEqual(L.loadLastPlace(storage), place);
  data[L.STORAGE_KEY] = '{lixo';
  assert.equal(L.loadLastPlace(storage), null);
});
