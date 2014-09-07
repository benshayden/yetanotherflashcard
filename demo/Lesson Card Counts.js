yaf.Deck.forEach(function(deck) {
  yaf.Lesson.forEach(deck, function(lesson) {
    set_text(lesson.label, (lesson.label.innerText || lesson.label.textContent) + ' --- ' + (lesson.cards.length / 2));
  });
});
