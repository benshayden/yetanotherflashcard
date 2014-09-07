var div = document.createElement('div');
div.style.textAlign = 'center';
div.style.marginTop = '0.5em';
$('settings').insertBefore(div, $('decks'));
addEventListener(yaf.onDone.type, function() {
  var score = 0;
  var cards = 0;
  yaf.Deck.forEach(function(deck) {
    yaf.Lesson.forEach(deck, function(lesson) {
      lesson.cards.forEach(function(card) {
        score += card.score;
        if (card.score) ++cards;
      });
    });
  });
  var level = 1 + Math.floor(Math.pow(score, 0.5)/2);
  set_text(div, 'Level ' + level + ' --- ' + score + ' points --- ' + cards + ' cards');
});
