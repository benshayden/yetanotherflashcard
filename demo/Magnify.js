var option = 'magnify';
yaf.define_option(PLUGIN_ID, option, 'both');
addEventListener(yaf.onStudy.type, function() {
  var magnify_front = yaf.onStudy.card.get_option(PLUGIN_ID, option);
  var magnify_back = yaf.onStudy.card.deck.get_option(PLUGIN_ID, option, (yaf.onStudy.card.direction === 'forward') ? 'backward' : 'forward');
  $('front').style.fontSize = magnify_front ? '100px' : '';
  $('front').style.padding = magnify_front ? '0' : '8px';
  $('back').style.fontSize = magnify_back ? '100px' : '';
  $('back').style.padding = magnify_back ? '0' : '8px';
  toArray(document.querySelectorAll('#card button.multiple_choice')).forEach(function(button) {
    button.style.fontSize = magnify_back ? '100px' : '';
  });
});
