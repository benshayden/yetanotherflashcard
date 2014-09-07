var FORTUNES = [
  'In times of change, learners inherit the earth. — Eric Hoffer',
  'Much learning does not teach understanding. — Heraclitus',
  'It is paradoxical that many educators and parents still differentiate between a time for learning and a time for play without seeing the vital connection between them. — Leo Buscaglia',
];
var fortune = document.createElement('div');
fortune.style.color = '#666';
fortune.style.display = 'inline-block';
fortune.style.marginTop = '1em';
$('card').appendChild(fortune);
var deck = null;
addEventListener(yaf.onStudy.type, function() {
  if (yaf.onStudy.card.deck !== deck) {
    set_text(fortune, FORTUNES[Math.floor(Math.random() * FORTUNES.length)]);
    deck = yaf.onStudy.card.deck;
  }
});