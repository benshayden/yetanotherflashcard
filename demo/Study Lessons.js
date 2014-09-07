function createButton(text, onclick) {
  var btn = document.createElement('button');
  btn.style.background = '#088';
  set_text(btn, text);
  btn.addEventListener('click', onclick);
  return btn;
}

function study(cards) {
  cards = cards.slice();
  shuffle(cards);
  yaf.study({
    update: function() {},
    any: function() { return cards.length > 0; },
    card: function() { return cards[0]; },
    mark: function(good) {
      if (good) {
        cards.splice(0, 1);
      } else {
        rotate(cards);
      }
    },
  });
}

yaf.Deck.forEach(function(deck) {
  var study_deck = createButton('review', function() {
    study(deck.cards);
  });
  var lessons_head = $(deck.div.id + ' .lessons-head');
  deck.div.insertBefore(study_deck, lessons_head);
  // In case this plugin loads after Shrink Settings:
  study_deck.style.display = lessons_head.style.display;

  yaf.Lesson.forEach(deck, function(lesson) {
    var study_lesson = createButton('review', function() {
      study(lesson.cards);
    });
    lesson.div.appendChild(study_lesson);
  });
});
