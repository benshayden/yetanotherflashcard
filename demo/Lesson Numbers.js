yaf.Deck.forEach(function(deck) {
  yaf.Lesson.forEach(deck, function(lesson) {
    set_text(lesson.label, '' + (1 + lesson.index) + ' --- ' + (lesson.label.innerText || lesson.label.textContent));
  });
});
