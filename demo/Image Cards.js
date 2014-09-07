var option = 'image';
yaf.define_option(PLUGIN_SHORT_ID, option);
function replace_text_image(elem) {
  if (elem.childNodes[0].nodeName !== '#text') return;
  var i = document.createElement('img');
  i.src = elem.childNodes[0].nodeValue;
  remove_childNodes(elem);
  elem.appendChild(i);
}
yaf.onStudy(function() {
  if (yaf.onStudy.card.get_option(PLUGIN_SHORT_ID, option)) {
    replace_text_image($('front'));
  }
  if (yaf.onStudy.card.deck.get_option(PLUGIN_SHORT_ID, option, (yaf.onStudy.card.direction === 'forward') ? 'backward' : 'forward')) {
    replace_text_image($('back'));
    toArray(document.querySelectorAll('#card button.multiple_choice')).forEach(function(button) {
      replace_text_image(button);
    });
  }
});
