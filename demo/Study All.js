var btn = document.createElement('button')
set_text(btn, 'study all cards');
btn.style.background = '#088';
btn.style.width = '100%';
btn.style.margin = '0';
$('study-disabled').parentNode.insertBefore(btn, $('study-disabled'));

var study_all = {
  _q: [],

  any: function() {
    return study_all._q.length > 0;
  },
  card: function() { return study_all._q[0]; },
  mark: function(good) {
    console.assert(study_all === yaf.studying);
    if (yaf.studying.any()) {
      rotate(yaf.studying._q);
    }
  },
  update: function() {
    study_all._q.splice(0, study_all._q.length);
    yaf.Deck.forEach(function(deck) {
      var deck_enabled_cards = [];
      yaf.Lesson.forEach(deck, function(lesson) {
        if (!lesson.enable.checked) return;
        lesson.cards.forEach(function(card) {
          if (card.is_enabled()) {
            deck_enabled_cards.push(card);
          }
        });
      });
      if (deck_enabled_cards.length > 0) {
        shuffle(deck_enabled_cards);
        study_all._q.push.apply(study_all._q, deck_enabled_cards);
      }
    });
    var show = (!yaf.onStudy.card &&
                study_all.any() &&
                ($('study-disabled').style.display !== 'none'));
    btn.style.display = show ? 'block' : 'none';
    if (show) {
      $('study-disabled').style.display = 'none';
    }
  },
};

btn.addEventListener('click', function() {
  yaf.study(study_all);
});

yaf.Deck.onDirectionEnable(function(deEvent) {
  study_all.update();
});
yaf.Lesson.onEnable(function(leEvent) {
  study_all.update();
});
yaf.onDone(function() {
  study_all.update();
});
