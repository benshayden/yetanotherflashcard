var option = 'magnify';
yaf.define_option(PLUGIN_SHORT_ID, option, 'both');
addEventListener(yaf.onStudy.type, function() {
  var magnify_front = yaf.onStudy.card.get_option(PLUGIN_SHORT_ID, option);
  var magnify_back = yaf.onStudy.card.deck.get_option(PLUGIN_SHORT_ID, option, (yaf.onStudy.card.direction === 'forward') ? 'backward' : 'forward');
  $('front').style.fontSize = magnify_front ? '100px' : '';
  $('front').style.height = $('front').style.lineHeight = magnify_front ? '1em' : '2em';
  $('back').style.fontSize = magnify_back ? '100px' : '';
  $('back').style.height = $('back').style.lineHeight = magnify_back ? '1em' : '2em';
  toArray(document.querySelectorAll('#card button.multiple_choice')).forEach(function(button) {
    button.style.fontSize = magnify_back ? '100px' : '';
    button.style.paddingRight = button.style.paddingLeft = button.style.margin = magnify_back ? '.1em' : '.3em';
    button.style.height = button.style.lineHeight = magnify_back ? '1em' : '2em';
  });
});
