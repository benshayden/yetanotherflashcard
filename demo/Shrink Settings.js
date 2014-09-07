yaf.Deck.forEach(function(deck) {
  var title = $(deck.div.id + ' .title');
  title.className += ' button';
  title.style.background = '#066';
  title.style.paddingLeft = '0.5em';
  var dbk = 'p' + PLUGIN_SHORT_ID + 'd' + deck.id;
  function setVisible(vis) {
    toArray(deck.div.children).forEach(function(elem) {
      if (elem === title) return;
      if (!vis) elem[' ' + PLUGIN_SHORT_ID] = elem.style.display;
      elem.style.display = vis ? elem[' ' + PLUGIN_SHORT_ID] : 'none';
    });
    yaf.db.set(dbk, vis ? '' : '0');
  }
  setVisible(yaf.db.get(dbk) !== '0');
  title.addEventListener('click', function() {
    setVisible(yaf.db.get(dbk) === '0');
  });
});
