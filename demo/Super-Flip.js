var enabled = false;
$('front').addEventListener('click', function() {
  if (enabled) $('flip').click();
});
// TODO vertically center front
addEventListener(yaf.onStudy.type, function() {
  // setTimeout(..., 0) to wait for all other plugins to handle yaf.onStudy in case one of them also hides flip.
  setTimeout(function() {
    enabled = $('flip').style.display != 'none';
    if (enabled) $('flip').style.display = 'none';
    var f = $('front');
    f.className = f.className.replace(/ button/g, '');
    if (enabled) f.className += ' button';
    f.style.color = 'black';
    f.style.background = 'white';
    f.style.border = enabled ? '3px solid #080' : '';
  }, 0);
});
