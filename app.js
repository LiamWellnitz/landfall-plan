(function () {
  'use strict';

  var KEY = 'landfallplan.v1';
  var OLD_KEY = 'stormready.v1';
  var VIEWS = ['quiz', 'plan', 'alerts', 'family'];
  var TITLES = { quiz: 'Quiz', plan: 'Plan', alerts: 'Alerts', family: 'Family plan' };
  var SOUTH_FL = { region: 'south-florida', label: 'South Florida' };
  var SOUTH_FL_SAME = ['012086', '012011', '012099', '012087'];
  var SOUTH_FL_NAMES = ['miami-dade', 'broward', 'palm beach', 'monroe'];
  var SEVERITY_RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
  var ALERT_STALE_MS = 10 * 60 * 1000;

  function $(id) { return document.getElementById(id); }

  function locKey(loc) { return loc.region ? 'region:' + loc.region : loc.lat.toFixed(3) + ',' + loc.lon.toFixed(3); }
  function roundCoord(n) { return Math.round(n * 10000) / 10000; } 
  var locDenied = false;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === false || v === null || v === undefined) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }

  function defaultState() {
    return {
      profile: null,
      checked: {},
      family: { contacts: [{ name: '', phone: '' }], neighbors: [], outOfArea: '', meetNear: '', meetFar: '', evac: '', notes: '' },
      location: { region: SOUTH_FL.region, label: SOUTH_FL.label },
      locMode: 'default', 
      largeText: false,
      alerts: null
    };
  }

  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  function loadState() {
    var s = defaultState();
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) raw = window.localStorage.getItem(OLD_KEY);
      if (!raw) return s;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return s;
      if (saved.profile && typeof saved.profile === 'object') s.profile = window.StormPlan.normalizeProfile(saved.profile);
      if (saved.checked && typeof saved.checked === 'object') s.checked = saved.checked;
      if (saved.family && typeof saved.family === 'object') {
        var f = saved.family;
        ['outOfArea', 'meetNear', 'meetFar', 'evac', 'notes'].forEach(function (k) {
          if (typeof f[k] === 'string') s.family[k] = f[k];
        });
        if (Array.isArray(f.contacts)) s.family.contacts = f.contacts.map(cleanRow('phone'));
        if (Array.isArray(f.neighbors)) s.family.neighbors = f.neighbors.map(cleanRow('note'));
        if (!s.family.contacts.length) s.family.contacts = [{ name: '', phone: '' }];
      }
      if (saved.locMode === 'auto' && saved.location && isNum(saved.location.lat) && isNum(saved.location.lon)) {
        s.location = {
          lat: roundCoord(saved.location.lat),
          lon: roundCoord(saved.location.lon),
          label: 'Your location'
        };
      }
      if (saved.locMode === 'auto' || saved.locMode === 'manual') s.locMode = saved.locMode;
      s.largeText = !!saved.largeText;
      if (saved.alerts && Array.isArray(saved.alerts.items) && isNum(saved.alerts.fetchedAt) && typeof saved.alerts.key === 'string') s.alerts = saved.alerts;
    } catch (e) { }
    return s;
  }

  function cleanRow(secondKey) {
    return function (r) {
      var row = { name: '' };
      row[secondKey] = '';
      if (r && typeof r.name === 'string') row.name = r.name;
      if (r && typeof r[secondKey] === 'string') row[secondKey] = r[secondKey];
      return row;
    };
  }

  var state = loadState();
  var currentPlan = null;

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { }
  }

  function currentView() {
    var h = (window.location.hash || '').replace('#', '');
    if (VIEWS.indexOf(h) >= 0) return h;
    return state.profile ? 'plan' : 'quiz';
  }

  function route() {
    var name = currentView();
    VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('.tabbar a'), function (a) {
      if (a.getAttribute('data-tab') === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = TITLES[name] + ' | Landfall Plan South Florida';
    try { window.scrollTo(0, 0); } catch (e) { }
    var h2 = document.querySelector('#view-' + name + ' h2');
    if (h2) h2.focus({ preventScroll: true });
    if (name === 'alerts') autoLocate(maybeRefreshAlerts);
  }

  function fillQuiz() {
    var p = state.profile || window.StormPlan.DEFAULT_PROFILE;
    var f = $('quiz-form').elements;
    ['adults', 'seniors', 'children', 'infants', 'pets'].forEach(function (k) { f[k].value = p[k]; });
    f.homeType.value = p.homeType;
    f.days.value = String(p.days);
    ['shutters', 'generator', 'needsMeds', 'powerMedical', 'mobility'].forEach(function (k) { f[k].checked = !!p[k]; });
  }

  function onQuizSubmit(e) {
    e.preventDefault();
    var f = $('quiz-form').elements;
    var raw = {
      adults: f.adults.value, seniors: f.seniors.value, children: f.children.value,
      infants: f.infants.value, pets: f.pets.value, homeType: f.homeType.value, days: f.days.value,
      shutters: f.shutters.checked, generator: f.generator.checked, needsMeds: f.needsMeds.checked,
      powerMedical: f.powerMedical.checked, mobility: f.mobility.checked
    };
    var err = $('quiz-error');
    var headcount = ['adults', 'seniors', 'children', 'infants'].reduce(function (sum, k) {
      return sum + (parseInt(raw[k], 10) || 0);
    }, 0);
    if (headcount < 1) {
      err.textContent = 'Add at least one person to your household.';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    state.profile = window.StormPlan.normalizeProfile(raw);
    save();
    renderPlan();
    if (window.location.hash === '#plan') route(); else window.location.hash = '#plan';
  }

  function renderPlan() {
    var has = !!state.profile;
    $('plan-empty').hidden = has;
    $('plan-content').hidden = !has;
    if (!has) { currentPlan = null; return; }

    var plan = window.StormPlan.buildPlan(state.profile);
    currentPlan = plan;
    var s = plan.summary;

    $('plan-lede').textContent = 'A ' + s.days + '-day plan for ' + s.people + (s.people === 1 ? ' person' : ' people') +
      (s.pets ? ' and ' + s.pets + (s.pets === 1 ? ' pet' : ' pets') : '') +
      ' in a ' + window.StormPlan.HOME_LABELS[plan.profile.homeType].toLowerCase() + '.';

    var stats = $('stats');
    clear(stats);
    [
      [s.waterGallons, 'gallons of water'],
      [s.meals, 'non-perishable meals'],
      [s.flashlights, 'flashlights'],
      [s.goBags, s.goBags === 1 ? 'go-bag' : 'go-bags']
    ].forEach(function (pair) {
      stats.appendChild(el('div', { class: 'stat' }, [
        el('div', { class: 'num', text: String(pair[0]) }),
        el('div', { class: 'lbl', text: pair[1] })
      ]));
    });

    var host = $('sections');
    clear(host);
    plan.sections.forEach(function (sec, idx) {
      var count = el('span', { class: 'sec-count', 'data-count': sec.id });
      var list = el('ul', { class: 'items' });
      sec.items.forEach(function (it) { list.appendChild(renderItem(sec, it)); });
      var body = el('div', { class: 'sec-body' }, [
        sec.blurb ? el('p', { class: 'sec-blurb', text: sec.blurb }) : null,
        list
      ]);
      var d = el('details', { class: 'sec', 'data-sec': sec.id, open: idx < 2 }, [
        el('summary', null, [el('span', { class: 'sec-title', text: sec.title }), count]),
        body
      ]);
      host.appendChild(d);
      updateSectionCount(sec);
    });

    var res = $('resources');
    clear(res);
    plan.resources.forEach(function (r) {
      res.appendChild(el('li', null, [el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: r.label })]));
    });

    updateProgress();
  }

  function renderItem(sec, it) {
    var cb = el('input', { type: 'checkbox', checked: !!state.checked[it.id], 'data-id': it.id });
    cb.addEventListener('change', function () {
      if (cb.checked) state.checked[it.id] = true; else delete state.checked[it.id];
      save();
      updateSectionCount(sec);
      updateProgress();
    });
    var txt = el('span', { class: 'txt' }, [
      it.qty ? el('span', { class: 'qty', text: it.qty }) : null,
      it.text
    ]);
    var body = el('span', { class: 'body' }, [txt, it.detail ? el('span', { class: 'detail', text: it.detail }) : null]);
    return el('li', null, [el('label', { class: 'item' }, [cb, body])]);
  }

  function updateSectionCount(sec) {
    var node = document.querySelector('[data-count="' + sec.id + '"]');
    if (!node) return;
    var sp = window.StormPlan.sectionProgress(sec, state.checked);
    node.textContent = sp.done + '/' + sp.total;
    node.classList.toggle('done', sp.done === sp.total && sp.total > 0);
  }

  function updateProgress() {
    if (!currentPlan) return;
    var pr = window.StormPlan.progress(currentPlan, state.checked);
    $('progress-text').textContent = pr.done + ' of ' + pr.total + ' done';
    $('progress-pct').textContent = pr.percent + '%';
    $('progress-fill').style.width = pr.percent + '%';
    $('progress-bar').setAttribute('aria-valuenow', String(pr.percent));
  }

  function shareChecklist() {
    if (!currentPlan) return;
    var text = window.StormPlan.plainText(currentPlan, state.checked);
    if (navigator.share) {
      navigator.share({ title: 'Hurricane prep checklist', text: text }).catch(function () { });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast('Checklist copied. Paste it into a message.'); },
        function () { toast('Could not copy. Try the print button instead.'); }
      );
    } else {
      toast('Sharing is not supported here. Try the print button.');
    }
  }

  function bindText(id, key) {
    var input = $(id);
    input.value = state.family[key] || '';
    input.addEventListener('input', function () { state.family[key] = input.value; save(); });
  }

  function renderRows(hostId, rows, secondKey, labels) {
    var host = $(hostId);
    clear(host);
    rows.forEach(function (row, i) {
      var name = el('input', { type: 'text', 'aria-label': labels.name + ' ' + (i + 1), placeholder: labels.name, value: row.name, autocomplete: 'off' });
      var other = el('input', {
        type: secondKey === 'phone' ? 'tel' : 'text', 'aria-label': labels.other + ' ' + (i + 1),
        placeholder: labels.other, value: row[secondKey], autocomplete: 'off'
      });
      name.addEventListener('input', function () { row.name = name.value; save(); });
      other.addEventListener('input', function () { row[secondKey] = other.value; save(); });
      var remove = el('button', {
        type: 'button', class: 'btn btn-danger btn-small no-print', 'aria-label': 'Remove ' + labels.name.toLowerCase() + ' ' + (i + 1),
        text: 'Remove',
        onclick: function () { rows.splice(i, 1); save(); renderRows(hostId, rows, secondKey, labels); }
      });
      host.appendChild(el('div', { class: 'row' }, [name, other, remove]));
    });
  }

  function renderFamily() {
    bindText('fam-outOfArea', 'outOfArea');
    bindText('fam-meetNear', 'meetNear');
    bindText('fam-meetFar', 'meetFar');
    bindText('fam-evac', 'evac');
    bindText('fam-notes', 'notes');
    renderContacts();
    renderNeighbors();
  }
  function renderContacts() { renderRows('contacts', state.family.contacts, 'phone', { name: 'Name', other: 'Phone' }); }
  function renderNeighbors() { renderRows('neighbors', state.family.neighbors, 'note', { name: 'Neighbor', other: 'Note (optional)' }); }

  function clearAllData() {
    if (!window.confirm('Erase your quiz answers, checklist progress and family plan from this device?')) return;
    try { window.localStorage.removeItem(KEY); window.localStorage.removeItem(OLD_KEY); } catch (e) { }
    state = defaultState();
    currentPlan = null;
    applyLargeText();
    fillQuiz();
    renderPlan();
    renderFamily();
    renderAlerts();
    toast('All saved data erased.');
    if (window.location.hash === '#quiz') route(); else window.location.hash = '#quiz';
  }

  var refreshing = false;

  function alertsUrl(loc) {
    if (loc.region) return 'https://api.weather.gov/alerts/active?area=FL';
    return 'https://api.weather.gov/alerts/active?point=' + loc.lat.toFixed(4) + ',' + loc.lon.toFixed(4);
  }

  function inSouthFlorida(props) {
    props = props || {};
    var same = (props.geocode && props.geocode.SAME) || [];
    for (var i = 0; i < same.length; i++) if (SOUTH_FL_SAME.indexOf(same[i]) >= 0) return true;
    var area = String(props.areaDesc || '').toLowerCase();
    for (var j = 0; j < SOUTH_FL_NAMES.length; j++) if (area.indexOf(SOUTH_FL_NAMES[j]) >= 0) return true;
    return false;
  }

  function shapeAlert(props) {
    props = props || {};
    return {
      id: String(props.id || props.headline || Math.random()),
      event: String(props.event || 'Weather alert'),
      severity: SEVERITY_RANK.hasOwnProperty(props.severity) ? props.severity : 'Unknown',
      headline: String(props.headline || ''),
      area: String(props.areaDesc || ''),
      expires: props.ends || props.expires || '',
      instruction: String(props.instruction || ''),
      description: String(props.description || '')
    };
  }

  function refreshAlerts() {
    if (refreshing) return Promise.resolve();
    refreshing = true;
    $('refresh-alerts').disabled = true;
    setStatus('Checking the National Weather Service…');

    return fetch(alertsUrl(state.location), { headers: { Accept: 'application/geo+json' } })
      .then(function (res) {
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status);
          err.outside = res.status === 400 || res.status === 404;
          throw err;
        }
        return res.json();
      })
      .then(function (data) {
        var features = data.features || [];
        if (state.location.region) features = features.filter(function (f) { return inSouthFlorida(f && f.properties); });
        var items = features.map(function (f) { return shapeAlert(f && f.properties); });
        items.sort(function (a, b) { return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]; });
        state.alerts = { fetchedAt: Date.now(), label: state.location.label, key: locKey(state.location), items: items };
        save();
        renderAlerts();
      })
      .catch(function (err) {
        renderAlerts(err && err.outside ? 'outside' : true);
      })
      .then(function () {
        refreshing = false;
        $('refresh-alerts').disabled = false;
      });
  }

  function maybeRefreshAlerts() {
    renderAlerts();
    var a = state.alerts;
    if (navigator.onLine === false) return;
    if (!a || Date.now() - a.fetchedAt > ALERT_STALE_MS || a.key !== locKey(state.location)) refreshAlerts();
  }

  function setStatus(msg) { $('alert-status').textContent = msg; }

  function fmtTime(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }

  function sampleAlert() {
    return {
      id: 'sample', event: 'Hurricane Watch', severity: 'Severe', sample: true,
      headline: 'SAMPLE ONLY: this is a demonstration alert, not a real warning.',
      area: 'Broward County (demo)', expires: '',
      instruction: 'Finish your storm preparations. This is practice text shown in demo mode.',
      description: 'Demo mode is on (?demo=1). Real alerts from the National Weather Service appear here when they are issued for your location.'
    };
  }

  function renderAlerts(failed) {
    $('loc-label').textContent = state.location.label;
    $('loc-note').hidden = !(locDenied && state.location.region);
    var host = $('alert-list');
    clear(host);

    var demo = /(^|[?&])demo=1(&|$)/.test(window.location.search);
    var a = state.alerts && state.alerts.key === locKey(state.location) ? state.alerts : null;
    var items = a ? a.items.slice() : [];
    if (demo) items.unshift(sampleAlert());

    if (failed === 'outside') {
      setStatus('The National Weather Service only covers the United States and its territories, so there are no alerts for your device location. Refresh when you are back in the US.');
    } else if (failed) {
      setStatus(a
        ? 'Could not reach the weather service. Showing alerts saved at ' + fmtTime(new Date(a.fetchedAt).toISOString()) + '.'
        : 'Could not reach the weather service. Check your connection and try again.');
    } else if (a) {
      setStatus('Updated ' + fmtTime(new Date(a.fetchedAt).toISOString()) + '.');
    } else if (!refreshing) {
      setStatus('');
    }

    if (!items.length) {
      if (a || failed === false) {
        host.appendChild(el('div', { class: 'card empty' }, [
          el('strong', { text: 'No active alerts' }),
          'The National Weather Service has nothing active for ' + state.location.label + ' right now.'
        ]));
      }
      return;
    }

    items.forEach(function (it) {
      var kids = [
        el('h3', null, [it.event, it.sample ? el('span', { class: 'badge sample', text: 'Sample' }) : el('span', { class: 'badge', text: it.severity })])
      ];
      var meta = [];
      if (it.area) meta.push(it.area);
      if (it.expires) meta.push('Until ' + fmtTime(it.expires));
      if (meta.length) kids.push(el('p', { class: 'meta', text: meta.join(' · ') }));
      if (it.headline) kids.push(el('p', { text: it.headline }));
      if (it.instruction || it.description) {
        var inner = [];
        if (it.instruction) inner.push('WHAT TO DO\n' + it.instruction + '\n\n');
        if (it.description) inner.push('DETAILS\n' + it.description.slice(0, 2000));
        kids.push(el('details', null, [el('summary', { text: 'Details and what to do' }), el('pre', { text: inner.join('') })]));
      }
      host.appendChild(el('article', { class: 'alert sev-' + it.severity }, kids));
    });
  }

  function useMyLocation(silent, fallback) {
    if (!navigator.geolocation) {
      if (!silent) toast('Location is not available on this device.');
      if (fallback) fallback();
      return;
    }
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      locDenied = false;
      state.location = { lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude), label: 'Your location' };
      state.locMode = 'auto';
      save();
      refreshAlerts();
    }, function (err) {
      setStatus('');
      var code = err && err.code;
      if (code === 1) {
        locDenied = true;
        resetToRegion();
      }
      if (!silent) {
        if (code === 1) {
          toast('Location is blocked. Turn on Location Services for your browser in your phone settings, allow it for this site, then reload the page. Showing South Florida alerts.', 8000);
        } else if (code === 3) {
          toast('Finding your location took too long. Showing South Florida alerts. Try again in a moment.', 5000);
        } else {
          toast('Your location is not available right now. Showing South Florida alerts.', 5000);
        }
      }
      if (fallback) fallback(); else renderAlerts();
    }, { timeout: 20000, maximumAge: 600000 });
  }

  function autoLocate(fallback) {
    if (!navigator.geolocation) return fallback();
    var go = function () { useMyLocation(true, fallback); };
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function (r) {
        // If the browser says location is allowed, use it, even if an earlier denial
        // left locMode as 'manual' (the person has since turned location on).
        if (r.state === 'granted') go();
        else if (r.state === 'prompt' && state.locMode === 'default') go();
        else {
          if (r.state === 'denied') { locDenied = true; if (state.locMode === 'auto') resetToRegion(); }
          fallback();
        }
      }).catch(function () {
        if (state.locMode === 'manual') fallback(); else go();
      });
    } else if (state.locMode === 'manual') fallback();
    else go();
  }

  function resetToRegion() {
    state.location = { region: SOUTH_FL.region, label: SOUTH_FL.label };
    state.locMode = 'manual';
    save();
  }

  function applyLargeText() {
    document.documentElement.classList.toggle('large', !!state.largeText);
    $('text-size').setAttribute('aria-pressed', state.largeText ? 'true' : 'false');
  }

  function updateNet() {
    var online = navigator.onLine !== false;
    var pill = $('net-pill');
    pill.textContent = online ? 'Online' : 'Offline: your saved plan still works';
    pill.classList.toggle('offline', !online);
  }

  function printNow() { window.print(); }

  function onBeforePrint() {
    Array.prototype.forEach.call(document.querySelectorAll('details.sec'), function (d) { d.open = true; });
    $('print-date').textContent = 'Household storm plan, printed ' + new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    });
  }

  function init() {
    applyLargeText();
    fillQuiz();
    renderPlan();
    renderFamily();
    renderAlerts();
    updateNet();

    $('quiz-form').addEventListener('submit', onQuizSubmit);
    $('share-btn').addEventListener('click', shareChecklist);
    $('print-plan').addEventListener('click', printNow);
    $('print-family').addEventListener('click', printNow);
    $('add-contact').addEventListener('click', function () {
      state.family.contacts.push({ name: '', phone: '' }); save(); renderContacts();
    });
    $('add-neighbor').addEventListener('click', function () {
      state.family.neighbors.push({ name: '', note: '' }); save(); renderNeighbors();
    });
    $('clear-data').addEventListener('click', clearAllData);
    $('refresh-alerts').addEventListener('click', function () { autoLocate(refreshAlerts); });
    $('use-location').addEventListener('click', function () { useMyLocation(false); });
    $('text-size').addEventListener('click', function () {
      state.largeText = !state.largeText; save(); applyLargeText();
    });

    window.addEventListener('hashchange', route);
    window.addEventListener('online', function () { updateNet(); if (currentView() === 'alerts') refreshAlerts(); });
    window.addEventListener('offline', updateNet);
    window.addEventListener('beforeprint', onBeforePrint);

    route();
    registerServiceWorker();
  }

  init();
})();
