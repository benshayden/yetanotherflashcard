'use strict';

var $ = function(i) { return document.querySelector('#' + i); }
var toArray = function(a) { return Array.prototype.slice.apply(a); }
var MS_PER_DAY = 1000 * 60 * 60 * 24;

function parse_csv(csv, delim) {
  delim = (delim || ',');
  var pattern = new RegExp((
    '(\\' + delim + "|\\r?\\n|\\r|^)" +
    "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
    "([^\"\\" + delim + "\\r\\n]*))"), 'gi');
  var parsed = [[]];
  var match = null;
  while (match = pattern.exec(csv)){
    var matched_delim = match[1];
    if (matched_delim.length && (matched_delim != delim)) {
      parsed.push([]);
    }
    var matched_value = '';
    if (match[2]) {
      matched_value = match[2].replace(new RegExp('""', 'g'), '"');
    } else {
      matched_value = match[3];
    }
    parsed[parsed.length - 1].push(matched_value);
  }
  return parsed;
}

function remove_childNodes(elem) {
  toArray(elem.childNodes).forEach(function(c) {
    elem.removeChild(c);
  });
  try {elem.innerText = '';}catch(e){}
  try {elem.textContent = '';}catch(e){}
}

function set_text(elem, text) {
  remove_childNodes(elem);
  elem.appendChild(document.createTextNode(text));
}

function shuffle(a) {
  // http://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
  var i, j;
  // When shuffling Cards, try to prevent one direction of a card from
  // immediately following the other direction of the same card. It's more
  // likely than you think. The scheduler tries to avoid scheduling both
  // directions of the same card on the same day, but it isn't guaranteed.
  function more_random() {
    while (((i > 0) && a[j].is_reverse(a[i - 1])) ||
           ((i < (a.length - 1)) && a[j].is_reverse(a[i + 1])) ||
           ((j > 0) && a[j - 1].is_reverse(a[i])) ||
           ((j < (a.length - 1)) && a[j + 1].is_reverse(a[i])) ||
           (i === j)) {
      j = Math.floor(Math.random() * (i + 1));
    }
  }
  if (a.length < 4) {
    more_random = function() {};
  } else {
    a.some(function(e) {
      if (!e.is_reverse) {
        more_random = function() {};
        return true;
      }
    });
  }
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    var t = a[i];
    more_random();
    a[i] = a[j];
    a[j] = t;
  }
}

function rotate(a) {
  a.push(a[0]);
  a.splice(0, 1);
}

var yaf = {};

yaf.db = {};
(function() {
var _sync_time_server = ('syncts' in localStorage) ? parseInt(localStorage.syncts) : 0;  // Seconds since yaf server epoch.
var _sync_time_client = ('synctc' in localStorage) ? new Date(localStorage.synctc) : new Date();
var _synced = ('synced' in localStorage) ? JSON.parse(localStorage.synced) : {};
var _journal = ('journal' in localStorage) ? JSON.parse(localStorage.journal) : {};
var _timer = null;
var _listeners = {};
var _syncing = false;

function clientTimeToServer(dt) {
  return Math.floor(_sync_time_server + (((dt || new Date()) - _sync_time_client) / 1000));
}
function serverTimeToClient(s) {
  return new Date(_sync_time_client.getTime() + (s - _sync_time_server) * 1000);
}
function serverToday() {
  return Math.floor(clientTimeToServer() * 1000 / MS_PER_DAY);
}

// Number of days since the server's epoch.
yaf.TODAY = serverToday();

// Values are coerced to strings and the default value is '', so store booleans
// like this:
// yaf.db.set(key, bool ? '1' : '') // default false
// bool = (yaf.db.get(key) === '1');
// yaf.db.set(key, bool ? '' : '0') // default true
// bool = (yaf.db.get(key) !== '0');

yaf.db.get = function(k) {
  if (k in _journal) return _journal[k].v;
  if (k in _synced) return _synced[k].v;
  return '';
};

yaf.db.set = function(k, v) {
  k = '' + k;
  v = '' + v;
  // Can't delete _journal[k] when _synced[k].v === v because _journal[k] might
  // have just been sent to server.
  _journal[k] = {'v':v, 't':clientTimeToServer()};
  localStorage.journal = JSON.stringify(_journal);
  if (!_timer) {
    _timer = setTimeout(yaf.db.sync, 60 * 1000);
    $('sync').children[0].style.stroke = 'orange';
  }
};

yaf.db.on = function(listener) {
  console.assert(!_listeners[listener.id], listener.id, _listeners[listener.id], listener);
  _listeners[listener.id] = listener;
};

yaf.db.onSync = function(cb) {
  addEventListener(yaf.db.onSync.type, cb);
};
yaf.db.onSync.type = 'sync';

yaf.db.sync = function() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  var sent = {};
  // deep-copy _journal in case it changes while the xhr is in flight.
  for (var k in _journal) {
    if (k !== '\0') sent[k] = {'v':_journal[k].v, 't':_journal[k].t};
  }
  document.cookie.split(';').forEach(function(a){
    var i = a.indexOf('=');
    if (a.substr(0, i).trim() != 'CSRFs') return;
    sent['\0'] = a.substr(i+1).trim();
  });
  if (_syncing) {
    return;
  }
  _syncing = true;
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState != 4) return;
    if (xhr.status === 204) {
      var login = xhr.getResponseHeader('X-Login-Required');
      if (login) {
        location.href = login;
      }
    }
    _syncing = false;
    if (xhr.status != 200) {
      return;
    }

    _sync_time_server = parseInt(xhr.getResponseHeader('x-sync-time'));
    _sync_time_client = new Date();
    localStorage.syncts = _sync_time_server;
    localStorage.synctc = _sync_time_client;
    var new_today = serverToday();
    if (yaf.TODAY != new_today) {
      console.debug('calendrical skew', yaf.TODAY, new_today);
      yaf.TODAY = new_today;
      new_today = true;
    } else {
      new_today = false;
    }
    var missed = JSON.parse(xhr.responseText);
    var any_missed = false;
    for (var k in sent) {
      // Move sent items from _journal to _synced if they didn't change while
      // the xhr was in flight.
      if (k === '\0') continue;
      _synced[k] = sent[k];
      if (_synced[k].v.length === 0) {
        // Don't need _synced[k].t
        delete _synced[k];
      }
      if (_journal[k] && (_journal[k].v == sent[k].v)) {
        delete _journal[k];
      }
    }
    // missed overrides sent.
    for (var k in missed) {
      any_missed = true;
      if (sent[k]) {
        console.assert(sent[k].t <= missed[k].t, k, sent[k].v, sent[k].t, missed[k].v, missed[k].t);
      }
      _synced[k] = missed[k];
      if (_synced[k].v.length === 0) {
        // Don't need _synced[k].t
        delete _synced[k];
      }
      var l = _listeners[k];
      // merge should not need to call yaf.db.set. if it does, it may make
      // journal[k] either == or != sent[k] and/or == or != synced[k], but that
      // won't break anything.
      if (l) l.merge(missed[k].v);
    }
    localStorage.journal = JSON.stringify(_journal);
    localStorage.synced = JSON.stringify(_synced);
    var any_journal = false;
    for (var k in _journal) {
      any_journal = true;
    }
    $('sync').children[0].style.stroke = any_journal ? 'organge' : 'grey';
    if (new_today || any_missed) {
      yaf.study.due.update();
    }
    // If yaf.db.set was called between yaf.db.sync and now, then the timer is
    // already set.
    dispatchEvent(new Event(yaf.db.onSync.type));
  };
  xhr.open('POST', '/sync', true);
  xhr.setRequestHeader('X-Last-Sync', _sync_time_server);
  xhr.send(JSON.stringify(sent));
  $('sync').children[0].style.stroke = 'green';
};
addEventListener('online', yaf.db.sync);
})();

$('sync').addEventListener('click', function() {
  yaf.db.sync();
});

yaf.onStudy = function(cb) {
  addEventListener(yaf.onStudy.type, cb);
};
yaf.onStudy.type = 'study';
yaf.onStudy.card = null;

yaf.onDone = function(cb) {
  addEventListener(yaf.onDone.type, cb);
};
yaf.onDone.type = 'done';

// Any object that quacks like {
//   update(),
//   any() => boolean,
//   card() => yaf.Card,
//   mark(boolean),
// }
yaf.studying = null;

yaf.study = function(studying) {
  if (studying &&
      (typeof studying.update === 'function') &&
      (typeof studying.any === 'function') &&
      (typeof studying.card === 'function') &&
      (typeof studying.mark === 'function')) {
    yaf.studying = studying;
  }
  if (!yaf.studying) {
    yaf.studying = yaf.study.due;
  }
  if (!yaf.studying.any()) {
    yaf.studying.update();
  }
  if (!yaf.studying.any()) {
    yaf.study.done();
    return;
  }
  $('settings').style.display = 'none';
  $('card').style.display = 'inline-block';
  $('flip').style.display = 'block';
  $('front').style.display = 'block';
  $('good').style.display = 'inline';
  $('postflip').style.display = 'none';
  $('flip').focus();
  $('deck').style.background = (!yaf.onStudy.card || (yaf.studying.card().deck !== yaf.onStudy.card.deck)) ? '#8f8' : '';
  yaf.onStudy.card = yaf.studying.card();
  if (location.hash !== '#study') location.hash = '#study';
  set_text($('deck'), yaf.studying.card().deck.title);
  set_text($('front'), yaf.studying.card().front);
  set_text($('back'), yaf.studying.card().back);
  dispatchEvent(new Event(yaf.onStudy.type));
};

yaf.study.done = function() {
  yaf.onStudy.card = null;
  yaf.studying = null;
  $('card').style.display = 'none';
  $('settings').style.display = 'inline-block';
  if (location.hash !== '') location.hash = '';
  dispatchEvent(new Event(yaf.onDone.type));
};

addEventListener('hashchange', function() {
  if (location.hash === '#study') {
    if (!yaf.onStudy.card) yaf.study();
  } else if (location.hash === '') {
    if (yaf.onStudy.card) yaf.study.done();
  }
}, false);

// TODO option enable event?

yaf.define_option = function(plugin_id, name, direction, deck_filter) {
  var safe_name = name.replace(' ', '_');
  if (!direction || (direction === 'both')) {
    yaf.define_option(plugin_id, name, 'forward');
    yaf.define_option(plugin_id, name, 'backward');
    return;
  }
  yaf.Deck.forEach(function(deck) {
    var span = $('option-template').cloneNode(true);
    span.id = deck.div.id + 'p' + plugin_id + direction[0] + safe_name;
    span.hidden = (deck_filter && !deck_filter(deck, direction));
    var options = $(deck.div.id + ' .' + direction + ' .options');
    options.appendChild(document.createTextNode(' '));
    options.appendChild(span);
    var enable = $(span.id + ' .enable');
    var label = $(span.id + ' .label');
    set_text(label, name);
    var direction_enabled = $(deck.div.id + ' .' + direction + ' .enable').checked;
    enable.disabled = !direction_enabled;
    label.style.color = direction_enabled ? '' : 'gray';
    label.htmlFor = enable.id = span.id + 'enable';
    // options default false
    enable.checked = yaf.db.get(span.id) === '1';
    enable.store = function() {
      yaf.db.set(span.id, enable.checked ? '1' : '');
    };
    enable.addEventListener('click', enable.store);
  });
};

yaf.Card = function(deck, front, back, backward) {
  var card = this;
  card.deck = deck;
  card.front = front;
  card.back = back;
  card.backward = backward;
  card.score = 0;
  card.due = 0;
  card.index = deck.cards.length / 2;
  card.id = deck.id + 'c' + deck.cards.length;
  deck.cards.push(card);
  card.lesson = $(deck.div.id + ' .lessons').lastChild.lesson;
  card.lesson.cards.push(card);
  yaf.db.on(card);

  var s = yaf.db.get(card.id);
  if (s) {
    s = s.split(',');
    card.score = parseInt(s[0]);
    card.due = parseInt(s[1]);
  }
};

yaf.Card.prototype.get_other = function() {
  return this.lesson.cards[(this.index * 2) + (this.backward ? 0 : 1)];
};

yaf.Card.prototype.direction = function() {
  return this.backward ? 'backward' : 'forward';
};

yaf.Card.prototype.is_reverse = function(other) {
  return this.front === other.back && this.back === other.front;
}

yaf.Card.prototype.get_option = function(plugin_id, name) {
  return this.deck.get_option(plugin_id, name, this.direction());
};

yaf.Card.prototype.is_enabled = function() {
  return this.lesson.is_enabled() && this.deck.is_enabled(this.direction());
}

yaf.Card.prototype.is_due = function() {
  return this.is_enabled() && (this.due <= yaf.TODAY);
};

yaf.Card.prototype.merge = function(s) {
  var card = this;
  s = s.split(',');
  card.score = parseInt(s[0]);
  card.due = parseInt(s[1]);
};

yaf.Card.prototype.mark = function(good) {
  var card = this;
  card.score = (good ? yaf.Card.good : yaf.Card.bad)(card);
  card.due = yaf.Card.schedule(card);
  yaf.db.set(card.id, card.score + ',' + card.due);
};

// Return the card's new score.
yaf.Card.good = function(card) { return card.score + 1; };
yaf.Card.bad = function(card) { return 0; }

// Return the card's new due date as a number of days from today.
yaf.Card.schedule = function(card) { return yaf.TODAY + card.score; }

yaf.study.due = {
  _q: [],  // private yaf.Card[][]

  // Call whenever any card.is_due() might have changed.
  update: function() {
    var study_due = this;
    study_due._q.splice(0, study_due._q.length);
    yaf.Deck.forEach(function(deck) {
      var deck_due_cards = [];
      yaf.Lesson.forEach(deck, function(lesson) {
        if (!lesson.enable.checked) return;
        lesson.cards.forEach(function(card) {
          if (card.is_due()) {
            deck_due_cards.push(card);
          }
        });
      });
      if (deck_due_cards.length > 0) {
        shuffle(deck_due_cards);
        study_due._q.push(deck_due_cards);
      }
    });
    if (!yaf.onStudy.card) {
      $('study').style.display = study_due.any() ? 'block' : 'none';
      $('study-disabled').style.display = study_due.any() ? 'none' : 'block';
    }
  },

  any: function() {
    return (this._q.length > 0) && (this._q[0].length > 0);
  },

  card: function() { return this._q[0][0]; },

  mark: function(good) {
    console.assert(this == yaf.studying);
    // update might have been called, so use yaf.onStudy.card
    if (!yaf.studying.any() || (yaf.onStudy.card !== yaf.studying.card())) {
      return;
    }
    yaf.studying.card().mark(good);
    if (yaf.studying._q.length === 0) {
      return;
    }
    if (!good) {
      rotate(yaf.studying._q[0]);
      return;
    }
    yaf.studying._q[0].splice(0,1);
    while ((yaf.studying._q.length > 0) && (yaf.studying._q[0].length === 0)) {
      yaf.studying._q.splice(0, 1);
    }
  },
};

yaf.Lesson = function(deck, title) {
  var lesson = this;
  lesson.cards = [];
  lesson.div = $('lesson-template').cloneNode(true);
  lesson.div.lesson = lesson;
  lesson.index = deck.lessons.children.length;
  lesson.div.id = deck.div.id + 'l' + lesson.index;
  lesson.id = deck.id + 'l' + lesson.index;
  yaf.db.on(lesson);
  deck.lessons.appendChild(lesson.div);
  lesson.deck = deck;

  lesson.label = $(lesson.div.id + ' .label');
  set_text(lesson.label, title || ('Lesson ' + (1 + lesson.index)));
  lesson.enable = $(lesson.div.id + ' .enable');
  lesson.label.htmlFor = lesson.enable.id = lesson.div.id + 'enable';
  // lessons default false
  lesson.enable.checked = (yaf.db.get(lesson.id) === '1');
  lesson.enable.addEventListener('click', function() {
    lesson.set_enabled(lesson.enable.checked);
  });
}

yaf.Lesson.onEnable = function(cb) {
  addEventListener(yaf.Lesson.onEnable.type, cb);
};
yaf.Lesson.onEnable.type = 'yaf.Lesson.onEnable';

yaf.Lesson.prototype.is_enabled = function() {
  return this.enable.checked;
}

yaf.Lesson.prototype.set_enabled = function(en) {
  var lesson = this;
  lesson.enable.checked = en;
  yaf.db.set(lesson.id, en ? '1' : '');
  dispatchEvent(new CustomEvent(yaf.Lesson.onEnable.type, {detail: lesson}));
}

yaf.Lesson.prototype.merge = function(s) {
  var lesson = this;
  lesson.set_enabled(s === '1');
};

yaf.Lesson.forEach = function(deck, cb) {
  toArray(deck.lessons.children).forEach(function(lesson_div) {
    cb(lesson_div.lesson);
  });
};

yaf.Deck = function(src) {
  var deck = this;
  var csv = parse_csv(src.innerHTML);
  deck.cards = [];
  deck.div = $('deck-template').cloneNode(true);
  deck.id = parseInt(src.getAttribute('shortid'));
  deck.longid = parseInt(src.getAttribute('longid'));
  deck.div.id = 'd' + deck.id;
  deck.div.deck = deck;
  $('decks').appendChild(deck.div);
  deck.title = src.title;
  set_text($(deck.div.id + ' .title'), deck.title);
  src.parentNode.removeChild(src);
  deck.lessons = $(deck.div.id + ' .lessons');

  function setup_enable(direction) {
    var enable = deck[direction + '_enable'] = $(deck.div.id + ' .' + direction + ' .enable');
    enable.id = $(deck.div.id + ' .' + direction + ' .label').htmlFor = deck.div.id + direction[0] + 'e';
    enable.db = {id: deck.id + direction[0] + 'e', merge: function(s) {
      deck.set_enabled(direction, (s !== '0'));
    }};
    yaf.db.on(enable.db);
    // directions default true
    deck.set_enabled(direction, (yaf.db.get(enable.db.id) !== '0'));
    enable.addEventListener('click', function() {
      deck.set_enabled(direction, enable.checked);
    });
  }
  setup_enable('forward');
  setup_enable('backward');

  var lesson = null;
  csv.forEach(function(row) {
    if (row[1]) {
      if (!lesson) {
        lesson = new yaf.Lesson(deck);
      }
      new yaf.Card(deck, row[0], row[1], false);
      new yaf.Card(deck, row[1], row[0], true);
      // TODO if column duplicate, disable direction unless it was explicitly enabled
    } else {
      if (lesson && (lesson.label.childNodes.length === 0)) {
        set_text(lesson.label, 'Lesson ' + (lesson.index + 1));
      }
      lesson = new yaf.Lesson(deck, row[0]);
    }
  });
  if (lesson.cards.length === 0) {
    lesson.div.parentNode.removeChild(lesson.div);
    lesson = deck.lessons.lastChild.lesson;
  }
  var any_enabled = false;
  toArray(deck.lessons.children).forEach(function(lesson_div) {
    any_enabled = any_enabled || lesson_div.lesson.enable.checked;
  });
  if (deck.lessons.children.length === 1) {
    deck.lessons.hidden = true;
    $(deck.div.id + ' .lessons-head').hidden = true;
    if (!lesson.enable.checked) {
      lesson.set_enabled(true);
    }
  }
};

yaf.Deck.prototype.set_enabled = function(direction, en) {
  var deck = this;
  var checkbox = deck[direction + '_enable'];
  checkbox.checked = en;
  yaf.db.set(checkbox.db.id, en ? '' : '0');
  toArray(document.querySelectorAll('#' + deck.div.id + ' .' + direction + ' .options .enable')).forEach(function(option_enable) {
    option_enable.disabled = !enable.checked;
  });
  toArray(document.querySelectorAll('#' + deck.div.id + ' .' + direction + ' .options .label')).forEach(function(option_label) {
    option_label.style.color = enable.checked ? '' : 'gray';
  });
  dispatchEvent(new CustomEvent(yaf.Deck.onDirectionEnable.type,
                                {detail: {deck: deck, direction: direction}}));
};

yaf.Deck.prototype.is_enabled = function(direction) {
  if (direction === 'forward') {
    return this.forward_enable.checked;
  } else if (direction === 'backward') {
    return this.backward_enable.checked;
  } else {
    return this.is_enabled('forward') || this.is_enabled('backward');
  }
}

yaf.Deck.onDirectionEnable = function(cb) {
  addEventListener(yaf.Deck.onDirectionEnable.type, cb);
};
yaf.Deck.onDirectionEnable.type = 'yaf.Deck.onDirectionEnable';

yaf.Deck.prototype.get_option = function(plugin_id, name, direction) {
  return $(this.div.id + 'p' + plugin_id + direction[0] + name.replace(' ', '_') + ' .enable').checked;
};

yaf.Deck.forEach = function(cb) {
  toArray($('decks').children).forEach(function(deck_div) {
    cb(deck_div.deck);
  });
};

yaf.Deck.onDirectionEnable(function(evt) {
  yaf.study.due.update();
});
yaf.Lesson.onEnable(function(evt) {
  yaf.study.due.update();
});
yaf.onDone(function() {
  yaf.study.due.update();
});

$('study').addEventListener('click', function() {
  yaf.study(yaf.study.due);
});
$('flip').addEventListener('click', function() {
  $('flip').style.display = 'none';
  $('postflip').style.display = 'block';
});
$('good').addEventListener('click', function() {
  yaf.studying.mark(true);
  yaf.study();
});
$('next').addEventListener('click', function() {
  yaf.studying.mark(false);
  yaf.study();
});

// hint ok default false
$('done-hint-ok').addEventListener('click', function() {
  yaf.db.set('hok', '1');
  $('done-hint').style.display = 'none';
});
if (yaf.db.get('hok') === '1') {
  $('done-hint').style.display = 'none';
}

$('manage a').onclick = function() {
  return navigator.onLine;
};

addEventListener('offline', function() {
  $('manage a').style.background = '#ddd';
});
addEventListener('online', function() {
  $('manage a').style.background = '#008';
});

if (navigator.mozApps) {
  // TODO test https://developer.mozilla.org/en-US/docs/Tools/Firefox_OS_Simulator
  var manifest = location.origin + '/manifest.webapp';
  var check = navigator.mozApps.checkInstalled(manifest);
  check.onsuccess = function(r) {
    if (r.result) {
      $('install').hidden = true;
    }
  };
  $('install').addEventListener('click', function(e) {
    e.preventDefault();
    var app = navigator.mozApps.install(manifest);
    app.onsuccess = function(data) {
      $('install').parentNode.removeChild($('install'));
    };
    app.onerror = function() {
      console.error('install error', this.error.name);
    };
  });
  $('install').style.display = 'block';
}

applicationCache.addEventListener('updateready', function() {
  if (applicationCache.status === applicationCache.UPDATEREADY) {
    location.reload();
  }
});
applicationCache.addEventListener('obsolete', function () {
  location.reload();
});

toArray(document.querySelectorAll('div.csv')).forEach(function(div) {
  var zero = $('zero-decks');
  if (zero) zero.parentNode.removeChild(zero);
  new yaf.Deck(div);
});

yaf.db.sync();

if (location.hash === '#study') {
  // The user bookmarked #study, but the back button is the only way to get to
  // settings.
  if (history.replaceState && history.pushState) {
    var orig = location.href;
    history.replaceState(null, null, location.origin + location.pathname);
    history.pushState(null, null, orig);
  }
  // Plugins may listen for onStudy, so wait for them to load.
  addEventListener('load', function() {
    yaf.study();
  });
} else if (location.hash === '') {
  yaf.study.done();
}
