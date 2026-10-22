/**
 * Interface do app de clima: busca de cidade com sugestões, geolocalização,
 * exibição da previsão e troca do tema visual conforme o tempo.
 */
(function () {
  'use strict';

  var L = WeatherLogic;
  var SUGGEST_DELAY = 300;

  var els = {
    body: document.body,
    sky: document.getElementById('sky'),
    welcome: document.getElementById('screen-welcome'),
    weather: document.getElementById('screen-weather'),
    forms: document.querySelectorAll('.search'),
    geoButtons: document.querySelectorAll('[data-action="geolocate"]'),
    message: document.getElementById('message'),
    loading: document.getElementById('loading'),
    place: document.getElementById('place'),
    updated: document.getElementById('updated'),
    icon: document.getElementById('current-icon'),
    temp: document.getElementById('current-temp'),
    condition: document.getElementById('current-condition'),
    range: document.getElementById('current-range'),
    feels: document.getElementById('feels-like'),
    humidity: document.getElementById('humidity'),
    wind: document.getElementById('wind'),
    forecast: document.getElementById('forecast')
  };

  var requestId = 0;
  var suggestTimer = null;

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /* ---------- Feedback ---------- */

  function showMessage(text) {
    els.message.textContent = text;
    els.message.hidden = !text;
  }

  function setLoading(isLoading) {
    els.loading.hidden = !isLoading;
    els.body.classList.toggle('is-loading', isLoading);
  }

  /* ---------- Fluxo principal ---------- */

  function loadWeather(place) {
    var current = ++requestId;
    setLoading(true);
    showMessage('');
    return fetchJson(L.buildForecastUrl(place.latitude, place.longitude))
      .then(function (json) {
        if (current !== requestId) return; // resposta antiga: ignora
        var data = L.parseForecast(json);
        L.saveLastPlace(window.localStorage, place);
        renderWeather(place, data);
      })
      .catch(function () {
        if (current !== requestId) return;
        showMessage('Não foi possível carregar a previsão. Verifique sua conexão e tente novamente.');
      })
      .then(function () {
        if (current === requestId) setLoading(false);
      });
  }

  function searchCity(name) {
    var term = name.trim();
    if (term.length < 2) {
      showMessage('Digite o nome de uma cidade.');
      return Promise.resolve();
    }
    setLoading(true);
    showMessage('');
    return fetchJson(L.buildGeocodingUrl(term, 1))
      .then(function (json) {
        var result = json.results && json.results[0];
        if (!result) {
          setLoading(false);
          showMessage('Cidade "' + term + '" não encontrada. Confira a grafia.');
          return;
        }
        return loadWeather(L.placeFromGeocoding(result));
      })
      .catch(function () {
        setLoading(false);
        showMessage('Erro ao buscar a cidade. Tente novamente.');
      });
  }

  function geolocate() {
    if (!navigator.geolocation) {
      showMessage('Seu navegador não suporta geolocalização. Digite o nome da cidade.');
      return;
    }
    setLoading(true);
    showMessage('');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = Math.round(pos.coords.latitude * 1e4) / 1e4;
      var lon = Math.round(pos.coords.longitude * 1e4) / 1e4;
      fetchJson(L.buildReverseUrl(lat, lon))
        .then(function (json) { return L.placeFromReverse(json, lat, lon); })
        .catch(function () { return L.placeFromReverse(null, lat, lon); })
        .then(loadWeather);
    }, function (err) {
      setLoading(false);
      showMessage(err && err.code === 1
        ? 'Permissão de localização negada. Digite o nome da cidade.'
        : 'Não foi possível obter sua localização. Digite o nome da cidade.');
    }, { timeout: 10000, maximumAge: 600000 });
  }

  /* ---------- Renderização ---------- */

  function renderWeather(place, data) {
    var c = data.current;
    els.place.textContent = place.label;
    els.updated.textContent = 'Atualizado às ' + c.time.slice(11, 16) + ' (horário local)';
    els.icon.textContent = c.weather.icon;
    els.icon.setAttribute('aria-label', c.weather.label);
    els.temp.textContent = c.temp + '°';
    els.condition.textContent = c.weather.label;
    els.range.textContent = 'Máx. ' + data.today.max + '° · Mín. ' + data.today.min + '°';
    els.feels.textContent = c.feelsLike + '°C';
    els.humidity.textContent = c.humidity + '%';
    els.wind.textContent = c.wind + ' km/h';

    var fragment = document.createDocumentFragment();
    data.days.forEach(function (day) {
      var li = document.createElement('li');
      li.className = 'day';
      li.innerHTML =
        '<p class="day__name"></p><p class="day__date"></p>' +
        '<p class="day__icon" role="img"></p>' +
        '<p class="day__temps"><strong></strong> <span></span></p>' +
        '<p class="day__rain"></p>';
      li.querySelector('.day__name').textContent = day.name;
      li.querySelector('.day__date').textContent = day.shortDate;
      li.querySelector('.day__icon').textContent = day.weather.icon;
      li.querySelector('.day__icon').setAttribute('aria-label', day.weather.label);
      li.querySelector('.day__temps strong').textContent = day.max + '°';
      li.querySelector('.day__temps span').textContent = day.min + '°';
      li.querySelector('.day__rain').textContent = day.rainChance !== null ? '💧 ' + day.rainChance + '%' : '';
      li.title = day.weather.label;
      fragment.appendChild(li);
    });
    els.forecast.replaceChildren(fragment);

    applyTheme(c.weather);
    els.welcome.hidden = true;
    els.weather.hidden = false;
    document.title = c.temp + '° ' + place.name + ' | Clima';
  }

  /** Troca o fundo (gradiente + partículas animadas) de acordo com o tempo. */
  function applyTheme(weather) {
    if (els.body.dataset.theme === weather.theme) return;
    els.body.dataset.theme = weather.theme;
    els.body.dataset.weather = weather.main;

    var particles = { rain: ['drop', 70], thunderstorm: ['drop', 90], snow: ['flake', 50], 'clear-night': ['star', 60], 'clouds-day': ['cloud', 6], 'clouds-night': ['cloud', 6], fog: ['mist', 5] };
    var conf = particles[weather.theme];
    var fragment = document.createDocumentFragment();
    if (conf) {
      for (var i = 0; i < conf[1]; i++) {
        var p = document.createElement('span');
        p.className = 'particle particle--' + conf[0];
        p.style.left = (Math.random() * 100).toFixed(2) + '%';
        p.style.top = (Math.random() * 100).toFixed(2) + '%';
        p.style.animationDelay = (-Math.random() * 10).toFixed(2) + 's';
        p.style.animationDuration = (conf[0] === 'drop' ? 0.5 + Math.random() * 0.5
          : conf[0] === 'flake' ? 6 + Math.random() * 6
          : conf[0] === 'star' ? 2 + Math.random() * 3
          : 30 + Math.random() * 30).toFixed(2) + 's';
        fragment.appendChild(p);
      }
    }
    if (weather.theme === 'clear-day') {
      var sun = document.createElement('span');
      sun.className = 'particle particle--sun';
      fragment.appendChild(sun);
    }
    els.sky.replaceChildren(fragment);
  }

  /* ---------- Sugestões de cidade ---------- */

  function hideSuggestions(list) {
    list.replaceChildren();
    list.hidden = true;
  }

  function suggest(input, list) {
    var term = input.value.trim();
    clearTimeout(suggestTimer);
    if (term.length < 2) {
      hideSuggestions(list);
      return;
    }
    suggestTimer = setTimeout(function () {
      fetchJson(L.buildGeocodingUrl(term, 5)).then(function (json) {
        if (input.value.trim() !== term) return;
        var results = json.results || [];
        var fragment = document.createDocumentFragment();
        results.forEach(function (r) {
          var place = L.placeFromGeocoding(r);
          var li = document.createElement('li');
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'suggestion';
          btn.textContent = place.label;
          btn.addEventListener('click', function () {
            input.value = place.name;
            hideSuggestions(list);
            loadWeather(place);
          });
          li.appendChild(btn);
          fragment.appendChild(li);
        });
        list.replaceChildren(fragment);
        list.hidden = results.length === 0;
      }).catch(function () { hideSuggestions(list); });
    }, SUGGEST_DELAY);
  }

  /* ---------- Eventos ---------- */

  els.forms.forEach(function (form) {
    var input = form.querySelector('input');
    var list = form.querySelector('.suggestions');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearTimeout(suggestTimer);
      hideSuggestions(list);
      input.blur();
      searchCity(input.value);
    });
    input.addEventListener('input', function () { suggest(input, list); });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') hideSuggestions(list);
    });
    // Fecha as sugestões ao clicar fora (o atraso permite clicar numa sugestão).
    input.addEventListener('blur', function () {
      setTimeout(function () { hideSuggestions(list); }, 200);
    });
  });

  els.geoButtons.forEach(function (btn) {
    btn.addEventListener('click', geolocate);
  });

  // Reabre na última cidade consultada.
  var last = L.loadLastPlace(window.localStorage);
  if (last) loadWeather(last);
})();
