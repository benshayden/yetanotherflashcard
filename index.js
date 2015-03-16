'use strict';

var qs = function(q) { return document.querySelector(q); }
var qsa = function(q) { return document.querySelectorAll(q); }
var $ = function(i) { return qs('#' + i); }
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
  var len = a.length;
  var i = len;
  while (i--) {
    var p = parseInt(Math.random() * len);
    var t = a[i];
    a[i] = a[p];
    a[p] = t;
  }
}

function rotate(a) {
  a.push(a[0]);
  a.splice(0, 1);
}

var yaf = {};
// Milliseconds since unix epoch.
yaf.EPOCH = 1389254400000;
// Number of days since yaf.EPOCH.
yaf.TODAY = Math.floor((new Date().getTime() - yaf.EPOCH) / MS_PER_DAY);

// Return the card's new score.
yaf.good = function(card) { return card.score + 1; };
yaf.bad = function(card) { return 0; }

// Return the card's new due date as a number of days from now.
yaf.schedule = function(card) { return card.score; }

yaf.db = {};
(function() {
var _t = ('t' in localStorage) ? parseInt(localStorage.t) : 0;
var _synced = ('synced' in localStorage) ? JSON.parse(localStorage.synced) : {};
var _journal = ('journal' in localStorage) ? JSON.parse(localStorage.journal) : {};
var _timer = null;
var _listeners = {};

// Values are coerced to strings and the default value is '', so store booleans
// like this:
// yaf.db.set(key, bool ? '1' : '') // default false
// bool = (yaf.db.get(key) === '1');
// yaf.db.set(key, bool ? '' : '0') // default true
// bool = (yaf.db.get(key) !== '0');

yaf.db.get = function(k) {
  if (k in _journal) return _journal[k];
  if (k in _synced) return _synced[k];
  return '';
};

yaf.db.set = function(k, v) {
  v = '' + v;
  if (_synced[k] == v) {
    delete _journal[k];
    return;
  }
  _journal[k] = v;
  localStorage.journal = JSON.stringify(_journal);
  if (!_timer) {
    _timer = setTimeout(yaf.db.sync, 60 * 1000);
  }
};

yaf.db.on = function(listener) {
  console.assert(!_listeners[listener.id], listener.id, _listeners[listener.id], listener);
  console.assert(listener.id != 't', listener);
  _listeners[listener.id] = listener;
};

yaf.db.sync = function() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  var sent = {};
  for (var k in _journal) {
    sent[k] = _journal[k];
  }
  sent.t = _t;
  document.cookie.split(';').forEach(function(a){
    var i = a.indexOf('='), name = a.substr(0, i).trim();
    if (name != 'CSRFs') return;
    sent.c = a.substr(i+1).trim();
  });
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState != 4) return;
    if (xhr.status === 204) {
      var login = xhr.getResponseHeader('X-Login-Required');
      if (login) {
        location.href = login;
      }
    }
    if (xhr.status != 200) {
      return;
    }
    var r = JSON.parse(xhr.responseText);
    if (!r || !r.t) return;
    _t = r.t;
    delete r.t;
    localStorage.t = _t;

    // _t is the number of seconds since yaf.EPOCH, which is the number of
    // milliseconds since unix epoch for the local client.
    var server_now = _t * 1000 + yaf.EPOCH, client_now = new Date().getTime(), skew_ms = client_now - server_now, skew_days = Math.round(skew_ms / MS_PER_DAY);
    if (skew_days != 0) {
      console.debug('server-client clock skew days', skew_days, server_now, client_now, skew_ms);
      // TODO adjust yaf.TODAY, recalculate due cards
    }

    for (var k in r) {
      _synced[k] = r[k];
      var l = _listeners[k];
      // merge may call yaf.db.set, which may make journal[k] either == or !=
      // sent[k] and/or == or != synced[k]
      if (l) l.merge(r[k]);
    }
    for (var k in sent) {
      // if (r[k] && (r[k] != sent[k])) then the server will have kept sent[k],
      // and we will have passed r[k] to a listener
      _synced[k] = sent[k];
      if (_journal[k] && (_journal[k] == sent[k])) {
        delete _journal[k];
      }
    }
    localStorage.journal = JSON.stringify(_journal);
    localStorage.synced = JSON.stringify(_synced);
    // If yaf.db.set was called between yaf.db.sync and now, then the timer is
    // already set.
  };
  xhr.open('POST', '/sync', true);
  xhr.send(JSON.stringify(sent));
};
addEventListener('online', yaf.db.sync);
})();

yaf.onStudy = new CustomEvent('study');
yaf.onDone = new CustomEvent('done');

(function() {

var total_due = localStorage.totaldue;
if (total_due) {
  total_due = JSON.parse(total_due);
  if (total_due[0] === yaf.TODAY) {
    total_due = total_due[1];
  } else {
    total_due = 0;
  }
} else {
  total_due = 0;
}

yaf.study = function() {
  if (yaf.study.due_cards.length === 0) {
    yaf.study.update();
  }
  if (yaf.study.due_cards.length === 0) {
    yaf.study.done();
    return;
  }
  $('settings').style.display = 'none';
  $('card').style.display = 'flex';
  $('front').style.display = 'block';
  $('good').style.display = 'block';
  $('back').style.visibility = 'hidden';
  $('goodnext').style.visibility = 'hidden';
  var card = yaf.study.due_cards[0][0];
  $('deck').style.background = (!yaf.onStudy.card || (card.deck !== yaf.onStudy.card.deck)) ? '#8f8' : '';
  yaf.onStudy.card = card;
  if (location.hash !== '#study') location.hash = '#study';
  set_text($('deck'), card.deck.title);
  set_text($('front'), card.front);
  set_text($('back'), card.back);

  if (yaf.onStudy.card.get_feature('image')) {
    // TODO images requires using navigator.serviceWorker instead of appcache
  }

  if (yaf.onStudy.card.get_feature('type')) {
    $('type').value = '';
    $('type').disabled = false;
    $('type').style.display = 'block';
    $('type').focus();
    $('back').style.flexGrow = 1;
    $('draw').style.display = 'none';
    $('clear').style.display = 'none';
  } else if (yaf.onStudy.card.get_feature('draw')) {
    $('type').style.display = 'none';
    $('draw').style.display = 'block';
    $('clear').style.display = 'block';
    $('back').style.flexGrow = 0;
    $('clear').click();
  } else {
    $('type').style.display = 'none';
    $('draw').style.display = 'none';
    $('clear').style.display = 'none';
  }

  var total_remaining = 0;
  yaf.study.due_cards.forEach(function(deck_due_cards) {
    total_remaining += deck_due_cards.length;
  });
  if (total_remaining > total_due) {
    total_due = total_remaining;
    localStorage.totaldue = JSON.stringify([yaf.TODAY, total_due]);
  }
  $('progress').style.width = (100 * (total_due - total_remaining) / total_due) + '%';

  dispatchEvent(yaf.onStudy);
};

})();

yaf.study.due_cards = [];  // array of arrays of cards
yaf.study.enabled_cards = [];  // array of cards

function show_study() {
  $('study-loading').style.display = 'none';
  $('study').style.display = (yaf.study.due_cards.length === 0) ? 'none' : 'block';
  $('study-done').style.display = (yaf.study.due_cards.length !== 0) ? 'none' : 'block';
}

// Call whenever any card.is_due() might have changed.
yaf.study.update = function() {
  yaf.study.due_cards.splice(0, yaf.study.due_cards.length);
  yaf.study.enabled_cards.splice(0, yaf.study.enabled_cards.length);
  yaf.Deck.forEach(function(deck) {
    var deck_due_cards = [], deck_enabled_cards = [];
    yaf.Lesson.forEach(deck, function(lesson) {
      if (!lesson.is_enabled()) return;
      lesson.cards.forEach(function(card) {
        if (card.is_enabled()) {
          deck_enabled_cards.push(card);
          if (card.is_due()) {
            deck_due_cards.push(card);
          }
        }
      });
    });
    if (deck_due_cards.length > 0) {
      shuffle(deck_due_cards);
      yaf.study.due_cards.push(deck_due_cards);
    }
    if (deck_enabled_cards.length > 0) {
      shuffle(deck_enabled_cards);
      yaf.study.enabled_cards.push.apply(yaf.study.enabled_cards, deck_enabled_cards);
    }
  });
  if (!yaf.onStudy.card) {
    show_study();
  }
}

yaf.study.done = function() {
  yaf.onStudy.card = null;
  $('card').style.display = 'none';
  $('settings').style.display = 'block';
  yaf.study.update();
  if (location.hash !== '') location.hash = '';
  dispatchEvent(yaf.onDone);
};

yaf.study.good = function() {
  yaf.onStudy.card.mark(true);
  yaf.study.due_cards[0].splice(0, 1);
  while ((yaf.study.due_cards.length > 0) &&
          (yaf.study.due_cards[0].length === 0)) {
    yaf.study.due_cards.splice(0, 1);
  }
};

yaf.study.bad = function() {
  yaf.onStudy.card.mark(false);
  rotate(yaf.study.due_cards[0]);
};

addEventListener('hashchange', function() {
  if (location.hash === '#study') {
    if (!yaf.onStudy.card) yaf.study();
  } else if (location.hash === '') {
    if (yaf.onStudy.card) yaf.study.done();
  }
}, false);

function setup_toggle(button, dbid, dflt, on_set) {
  button.is = function() {
    return button.className === 'on';
  };
  button.set = function(e) {
    if (button.is() === e) return;
    button.className = e ? 'on' : 'off';
    yaf.db.set(dbid, e ? (dflt ? '' : '1') : (dflt ? '0' : ''));
    if (on_set) {
      on_set();
    }
  };
  button.db = {id: dbid, merge: function(s) {
    if ((s == 1) && !button.is()) {
      button.set(true);
    }
  }};
  yaf.db.on(button.db);
  var dbv = yaf.db.get(dbid);
  button.className = (dflt ? (dbv !== '0') : (dbv === '1')) ? 'on' : 'off';
  button.addEventListener('click', function() {
    button.blur();
    button.set(!button.is());
  });
}

yaf.define_option = function(plugin_id, name, direction, deck_filter) {
  var safe_name = name.replace(' ', '_');
  if (!direction || (direction === 'both')) {
    yaf.define_option(plugin_id, name, 'forward');
    yaf.define_option(plugin_id, name, 'backward');
    return;
  }
  yaf.Deck.forEach(function(deck) {
    if (deck_filter && !deck_filter(deck, direction)) return;
    var button = document.createElement('button');
    button.id = 'd' + deck.id + 'p' + plugin_id + direction[0] + safe_name;
    set_text(button, name);
    deck.option('[data-direction="' + direction + '"]').appendChild(button);
    setup_toggle(button, button.id, false);
  });
};

yaf.Card = function(deck, front, back, backward) {
  var card = this;
  card.deck = deck;
  card.front = front;
  card.back = back;
  card.backward = backward;
  card.direction = backward ? 'backward' : 'forward';
  card.score = 0;
  card.due = 0;
  card.id = deck.id + 'c' + deck.cards.length;
  deck.cards.push(card);
  card.lesson = deck.lessons.lastChild.lesson;
  card.lesson.cards.push(card);
  yaf.db.on(card);

  var s = yaf.db.get(card.id);
  if (s) {
    s = s.split(',');
    card.score = parseInt(s[0]);
    card.due = parseInt(s[1]);
  }
}

yaf.Card.prototype.get_option = function(plugin_id, name) {
  return this.deck.get_option(plugin_id, name, this.direction);
};
yaf.Card.prototype.get_feature = function(name) {
  return this.deck.get_feature(name, this.direction);
};

yaf.Card.prototype.is_enabled = function() {
  return this.lesson.is_enabled() && (this.backward ? this.deck.backward_enable : this.deck.forward_enable).is();
}

yaf.Card.prototype.is_due = function() {
  return this.is_enabled() && (this.due <= yaf.TODAY);
};

yaf.Card.prototype.merge = function(s) {
  var card = this;
  s = s.split(',');
  card.score = Math.max(card.score, parseInt(s[0]));
  card.due = Math.max(card.due, parseInt(s[1]));
  yaf.db.set(card.id, card.score + ',' + card.due);
  yaf.study.update();
};

yaf.Card.prototype.mark = function(good) {
  var card = this;
  card.score = (good ? yaf.good : yaf.bad)(card);
  card.due = yaf.TODAY + yaf.schedule(card);
  yaf.db.set(card.id, card.score + ',' + card.due);
};

yaf.Lesson = function(deck, title) {
  var lesson = this;
  lesson.cards = [];
  lesson.button = document.createElement('button');
  lesson.button.lesson = lesson;
  lesson.index = deck.lessons.children.length;
  lesson.id = deck.id + 'l' + lesson.index;
  lesson.deck = deck;
  deck.lessons.appendChild(lesson.button);
  setup_toggle(lesson.button, lesson.id, false, function() {
    yaf.study.update();
  });
  lesson.is_enabled = function() {
    return lesson.button.is();
  };
  lesson.set_enabled = function(e) {
    lesson.button.set(e);
  };
  set_text(lesson.button, title || ('Lesson ' + (1 + lesson.index)));
}

yaf.Lesson.forEach = function(deck, cb) {
  toArray(deck.lessons.children).forEach(function(button) {
    cb(button.lesson);
  });
};

yaf.Deck = function(src) {
  var deck = this;
  var csv = parse_csv(src.innerHTML);
  deck.cards = [];
  deck.id = parseInt(src.dataset.id);
  deck.option = function(s) {
    return qs('#decks .options[data-id="' + deck.id + '"] ' + s);
  };
  deck.feature = function(name, direction) {
    return deck.option('[data-direction="' + direction + '"] button[data-feature="' + name + '"]');
  };
  var edit_button = qs('#decks .head[data-id="' + deck.id + '"] .edit');
  deck.title_button = qs('#decks .head[data-id="' + deck.id + '"] .title');
  var options = deck.option('');
  options.deck = deck;
  deck.title_button.addEventListener('click', function() {
    deck.title_button.blur();
    options.style.display = edit_button.style.display = options.style.display ? '' : 'block';
  });
  deck.title = deck.title_button.innerText;
  src.parentNode.removeChild(src);
  deck.lessons = deck.option('.lessons');

  function setup_enable(direction) {
    var enable = deck[direction + '_enable'] = deck.option('[data-direction="' + direction + '"] button:not([data-feature])');
    setup_toggle(enable, deck.id + direction[0] + 'e', true, function() {
      yaf.study.update();
    });
  }
  setup_enable('forward');
  setup_enable('backward');
  'type draw image'.split(' ').forEach(function(name) {
    setup_toggle(deck.feature(name, 'forward'), deck.id + 'f' + name, false);
    setup_toggle(deck.feature(name, 'backward'), deck.id + 'b' + name, false);
  });

  var lesson = null;
  csv.forEach(function(row) {
    if (row[1]) {
      if (!lesson) {
        lesson = new yaf.Lesson(deck);
      }
      new yaf.Card(deck, row[0], row[1], false);
      new yaf.Card(deck, row[1], row[0], true);
      // TODO if column duplicate, disable direction unless db.get(...) == '1'
    } else {
      lesson = new yaf.Lesson(deck, row[0]);
    }
  });
  if (lesson.cards.length === 0) {
    lesson.button.parentNode.removeChild(lesson.button);
    lesson = deck.lessons.lastChild.lesson;
  }
  var any_enabled = false;
  toArray(deck.lessons.children).forEach(function(button) {
    any_enabled = any_enabled || button.lesson.is_enabled();
  });
  if (deck.lessons.children.length === 1) {
    deck.lessons.hidden = true;
    if (!lesson.is_enabled()) {
      lesson.set_enabled(true);
    }
  }
}

yaf.Deck.prototype.get_option = function(plugin_id, name, direction) {
  return $('d' + this.id + 'p' + plugin_id + direction[0] + name.replace(' ', '_')).is();
};
yaf.Deck.prototype.get_feature = function(name, direction) {
  return this.feature(name, direction).is();
};

yaf.Deck.forEach = function(cb) {
  [].forEach.call(qsa('#decks .options'), function(options) {
    cb(options.deck);
  });
};

(function() {
var clear = $('clear');
var canvas = $('draw');
var context = canvas.getContext('2d');
context.lineWidth = 2 * devicePixelRatio;
function resize_canvas() {
  if (canvas.dirty) return;
  var r = canvas.getBoundingClientRect();
  canvas.height = r.height * devicePixelRatio;
  canvas.width = r.width * devicePixelRatio;
}
clear.addEventListener('click', function() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  canvas.dirty = false;
  resize_canvas();
});
function draw_touch() {
  var drawer = {
    isDrawing: false,
    touchstart: function (coors) {
      context.beginPath();
      context.moveTo(coors.x, coors.y);
      this.isDrawing = true;
    },
    touchmove: function (coors) {
      if (!this.isDrawing) return;
      canvas.dirty = true;
      context.lineTo(coors.x, coors.y);
      context.stroke();
    },
    touchend: function (coors) {
      if (!this.isDrawing) return;
      this.touchmove(coors);
      this.isDrawing = false;
    },
  };
  function draw(touchevent) {
    if (touchevent.type === 'touchmove') {
      touchevent.preventDefault();
    }
    if (!(touchevent && touchevent.targetTouches && touchevent.targetTouches[0]))
      return;
    var coors = {
      x: touchevent.targetTouches[0].pageX,
      y: touchevent.targetTouches[0].pageY,
    };
    var obj = canvas;
    if (obj.offsetParent) {
      do {
          coors.x -= obj.offsetLeft;
          coors.y -= obj.offsetTop;
      }
      while ((obj = obj.offsetParent) != null);
    }
    coors.x *= devicePixelRatio;
    coors.y *= devicePixelRatio;
    drawer[touchevent.type](coors);
  }
  canvas.addEventListener('touchstart', draw, false);
  canvas.addEventListener('touchmove', draw, false);
  canvas.addEventListener('touchend', draw, false);
}
function draw_mouse() {
  function getPosition(mouseEvent) {
    var x, y;
    if (mouseEvent.pageX != undefined && mouseEvent.pageY != undefined) {
      x = mouseEvent.pageX;
      y = mouseEvent.pageY;
    } else {
      x = mouseEvent.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
      y = mouseEvent.clientY + document.body.scrollTop + document.documentElement.scrollTop;
    }
    x -= canvas.offsetLeft;
    x *= devicePixelRatio;
    y -= canvas.offsetTop;
    y *= devicePixelRatio;
    return {X: x, Y: y};
  }
  function drawLine(mouseEvent) {
    canvas.dirty = true;
    var position = getPosition(mouseEvent);
    context.lineTo(position.X, position.Y);
    context.stroke();
  }
  var mousemove = function(evt) {
    drawLine(evt);
  };
  var finishDrawing = function(mouseEvent) {
    drawLine(mouseEvent);
    context.closePath();
    canvas.removeEventListener('mousemove', mousemove, false);
    canvas.removeEventListener('mouseup', finishDrawing, false);
    canvas.removeEventListener('mouseout', finishDrawing, false);
  };
  canvas.addEventListener('mousedown', function (mouseEvent) {
    var position = getPosition(mouseEvent);
    context.moveTo(position.X, position.Y);
    context.beginPath();
    canvas.addEventListener('mousemove', mousemove, false);
    canvas.addEventListener('mouseup', finishDrawing, false);
    canvas.addEventListener('mouseout', finishDrawing, false);
  }, false);
}
if ('ontouchstart' in document.documentElement) {
  draw_touch();
} else {
  draw_mouse();
}
addEventListener('load', resize_canvas);
addEventListener('resize', resize_canvas);
})();

$('study').addEventListener('click', function() {
  yaf.study();
});
$('front').addEventListener('click', function() {
  if (yaf.onStudy.card.get_feature('type')) {
    $('type').focus();
    return;
  }
  $('back').style.visibility = 'visible';
  $('goodnext').style.visibility = 'visible';
});
$('good').addEventListener('click', function() {
  yaf.study.good();
  yaf.study();
});
$('next').addEventListener('click', function() {
  yaf.study.bad();
  yaf.study();
});
$('typeform').onsubmit = function() {
  $('type').disabled = true;
  if ($('type').value === yaf.onStudy.card.back) {
    $('good').click();
  } else {
    yaf.study.bad();
    $('good').style.display = 'none';
    $('back').style.visibility = 'visible';
    $('goodnext').style.visibility = 'visible';
  }
  return false;
};

[].forEach.call(qsa('button[data-href]'), function(button) {
  button.onclick = function() {
    location.href = button.dataset.href;
  };
});

// hint ok default false
$('done-hint-ok').addEventListener('click', function() {
  yaf.db.set('hok', '1');
  $('done-hint').style.display = 'none';
});
if (yaf.db.get('hok') === '1') {
  $('done-hint').style.display = 'none';
}

if (false && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(function(reg) {
    console.log(reg);
  }, function(err) {
    console.log(err);
  });
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
  addEventListener('load', yaf.study);
} else if (location.hash === '') {
  yaf.study.done();
}
