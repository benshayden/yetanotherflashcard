var total_div = document.createElement('div');
var deck_div = document.createElement('div');
total_div.style.height = deck_div.style.height = '0.2em';
total_div.style.width = deck_div.style.width = '0%';
total_div.style.position = deck_div.style.position = 'fixed';
total_div.style.top = 0;
deck_div.style.top = '0.2em';
total_div.style.left = deck_div.style.left = 0;
total_div.style.backgroundColor = '#0a0';
deck_div.style.backgroundColor = '#00a';
$('card').insertBefore(total_div, $('deck'));
$('card').insertBefore(deck_div, $('deck'));
var total_due = 0;
var deck_due = 0;
var prev_deck = null;
addEventListener(yaf.onStudy.type, function() {
  if (!yaf.study.due_only) {
    total_div.style.display = 'none';
    deck_div.style.display = 'none';
    return;
  }
  total_div.style.display = 'block';
  deck_div.style.display = 'block';
  var total_remaining = 0;
  yaf.study.due_cards.forEach(function(deck_due_cards) {
    total_remaining += deck_due_cards.length;
  });
  var deck_remaining = yaf.study.due_cards[0].length;
  if (!total_due) {
    total_due = total_remaining;
  }
  if (prev_deck != yaf.onStudy.card.deck) {
    deck_due = deck_remaining;
    prev_deck = yaf.onStudy.card.deck;
  }
  var this_deck = yaf.onStudy.card.deck;
  if (!total_due || !deck_due) {
    total_div.style.display = 'none';
    deck_div.style.display = 'none';
    return;
  }
  total_div.style.width = (100 * (total_due - total_remaining) / total_due) + '%';
  deck_div.style.width = (100 * (deck_due - deck_remaining) / deck_due) + '%';
});