/**
 * Lógica do app de clima: URLs das APIs, tradução dos códigos de tempo
 * (WMO) em condições/temas visuais e formatação. Sem acesso ao DOM.
 *
 * APIs gratuitas e sem chave:
 *  - Open-Meteo (previsão e busca de cidades): https://open-meteo.com
 *  - Nominatim/OpenStreetMap (nome da cidade a partir da localização)
 */
var WeatherLogic = (function () {
  'use strict';

  var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  var GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  var REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
  var STORAGE_KEY = 'clima:ultima-cidade';

  function query(params) {
    return Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
  }

  function buildGeocodingUrl(name, count) {
    return GEOCODING_URL + '?' + query({ name: name.trim(), count: count || 5, language: 'pt', format: 'json' });
  }

  function buildForecastUrl(lat, lon) {
    return FORECAST_URL + '?' + query({
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: 4
    });
  }

  function buildReverseUrl(lat, lon) {
    return REVERSE_URL + '?' + query({ format: 'jsonv2', lat: lat, lon: lon, zoom: 10, 'accept-language': 'pt' });
  }

  /**
   * Agrupa os códigos WMO nas mesmas categorias da OpenWeatherMap
   * (Clear, Clouds, Rain...), que definem o tema visual da página.
   */
  var WMO = {
    0: ['Clear', 'Céu limpo'],
    1: ['Clear', 'Predominantemente limpo'],
    2: ['Clouds', 'Parcialmente nublado'],
    3: ['Clouds', 'Nublado'],
    45: ['Fog', 'Neblina'],
    48: ['Fog', 'Neblina com geada'],
    51: ['Drizzle', 'Garoa fraca'],
    53: ['Drizzle', 'Garoa'],
    55: ['Drizzle', 'Garoa forte'],
    56: ['Drizzle', 'Garoa congelante'],
    57: ['Drizzle', 'Garoa congelante forte'],
    61: ['Rain', 'Chuva fraca'],
    63: ['Rain', 'Chuva'],
    65: ['Rain', 'Chuva forte'],
    66: ['Rain', 'Chuva congelante'],
    67: ['Rain', 'Chuva congelante forte'],
    71: ['Snow', 'Neve fraca'],
    73: ['Snow', 'Neve'],
    75: ['Snow', 'Neve forte'],
    77: ['Snow', 'Grãos de neve'],
    80: ['Rain', 'Pancadas de chuva'],
    81: ['Rain', 'Pancadas de chuva fortes'],
    82: ['Rain', 'Pancadas de chuva violentas'],
    85: ['Snow', 'Pancadas de neve'],
    86: ['Snow', 'Pancadas de neve fortes'],
    95: ['Thunderstorm', 'Tempestade'],
    96: ['Thunderstorm', 'Tempestade com granizo'],
    99: ['Thunderstorm', 'Tempestade forte com granizo']
  };

  var ICONS = {
    Clear: { day: '☀️', night: '🌙' },
    Clouds: { day: '⛅', night: '☁️' },
    Fog: { day: '🌫️', night: '🌫️' },
    Drizzle: { day: '🌦️', night: '🌧️' },
    Rain: { day: '🌧️', night: '🌧️' },
    Snow: { day: '❄️', night: '❄️' },
    Thunderstorm: { day: '⛈️', night: '⛈️' }
  };

  /** Retorna { main, label, icon, theme } para um código WMO. */
  function describeWeather(code, isDay) {
    var entry = WMO[code] || ['Clouds', 'Indefinido'];
    var main = entry[0];
    var day = isDay !== false && isDay !== 0;
    // "Predominantemente limpo" (código 1) usa o sol entre nuvens.
    var icon = code === 1 ? (day ? '🌤️' : '🌙') : ICONS[main][day ? 'day' : 'night'];
    var theme = main.toLowerCase();
    if (main === 'Drizzle') theme = 'rain';
    if (main === 'Clear' || main === 'Clouds') theme += day ? '-day' : '-night';
    return { main: main, label: entry[1], icon: icon, theme: theme };
  }

  /** Converte "2026-10-22" em data local (sem deslocamento de fuso). */
  function parseLocalDate(iso) {
    var p = String(iso).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function formatDayName(iso, todayIso) {
    if (todayIso) {
      var diff = Math.round((parseLocalDate(iso) - parseLocalDate(todayIso)) / 86400000);
      if (diff === 0) return 'Hoje';
      if (diff === 1) return 'Amanhã';
    }
    var name = parseLocalDate(iso).toLocaleDateString('pt-BR', { weekday: 'long' });
    name = name.replace('-feira', '');
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function formatShortDate(iso) {
    var d = parseLocalDate(iso);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function round(n) {
    var r = Math.round(n);
    return r === 0 ? 0 : r; // evita "-0°"
  }

  /** Extrai o necessário da resposta da Open-Meteo: agora + próximos 3 dias. */
  function parseForecast(json) {
    if (!json || !json.current || !json.daily) throw new Error('Resposta de previsão inválida.');
    var c = json.current;
    var d = json.daily;
    var today = d.time[0];
    var days = d.time.slice(1, 4).map(function (date, i) {
      var idx = i + 1;
      return {
        date: date,
        name: formatDayName(date, today),
        shortDate: formatShortDate(date),
        max: round(d.temperature_2m_max[idx]),
        min: round(d.temperature_2m_min[idx]),
        rainChance: d.precipitation_probability_max ? d.precipitation_probability_max[idx] : null,
        weather: describeWeather(d.weather_code[idx], true)
      };
    });
    return {
      current: {
        temp: round(c.temperature_2m),
        feelsLike: round(c.apparent_temperature),
        humidity: Math.round(c.relative_humidity_2m),
        wind: Math.round(c.wind_speed_10m),
        isDay: c.is_day === 1,
        time: c.time,
        weather: describeWeather(c.weather_code, c.is_day === 1)
      },
      today: {
        max: round(d.temperature_2m_max[0]),
        min: round(d.temperature_2m_min[0])
      },
      days: days,
      timezone: json.timezone
    };
  }

  /** Monta o nome exibido a partir de um resultado da geocodificação. */
  function formatPlace(place) {
    var parts = [place.name];
    if (place.admin1 && place.admin1 !== place.name) parts.push(place.admin1);
    if (place.country) parts.push(place.country);
    return parts.join(', ');
  }

  function placeFromGeocoding(result) {
    return {
      name: result.name,
      label: formatPlace(result),
      latitude: result.latitude,
      longitude: result.longitude
    };
  }

  /** Nome da cidade a partir da resposta do Nominatim. */
  function placeFromReverse(json, lat, lon) {
    var a = (json && json.address) || {};
    var city = a.city || a.town || a.village || a.municipality || (json && json.name) || 'Sua localização';
    var parts = [city];
    if (a.state && a.state !== city) parts.push(a.state);
    if (a.country) parts.push(a.country);
    return { name: city, label: parts.join(', '), latitude: lat, longitude: lon };
  }

  function loadLastPlace(storage) {
    try {
      var p = JSON.parse(storage.getItem(STORAGE_KEY));
      return p && typeof p.latitude === 'number' && typeof p.longitude === 'number' && p.name ? p : null;
    } catch (e) {
      return null;
    }
  }

  function saveLastPlace(storage, place) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(place)); } catch (e) { /* ignora */ }
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    buildGeocodingUrl: buildGeocodingUrl,
    buildForecastUrl: buildForecastUrl,
    buildReverseUrl: buildReverseUrl,
    describeWeather: describeWeather,
    formatDayName: formatDayName,
    formatShortDate: formatShortDate,
    parseForecast: parseForecast,
    formatPlace: formatPlace,
    placeFromGeocoding: placeFromGeocoding,
    placeFromReverse: placeFromReverse,
    loadLastPlace: loadLastPlace,
    saveLastPlace: saveLastPlace
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WeatherLogic;
}
