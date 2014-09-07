yaf.define_option(PLUGIN_SHORT_ID, 'type', 'both');
var text_form = document.createElement('form');
var text = document.createElement('input');
text_form.appendChild(text);
$('front').parentNode.insertBefore(text_form, $('front').nextSibling);
text.style.margin = 'auto';
text.style.display = 'block';
text.style.border = '1px solid black';
text_form.onsubmit = function() {
  text.disabled = true;
  if (text.value == yaf.onStudy.card.back) {
    $('good').click();
  } else {
    $('flip').click();
    $('good').style.display = 'none';
  }
  return false;
};
yaf.onStudy(function() {
  if (!yaf.onStudy.card.get_option(PLUGIN_SHORT_ID, 'type')) {
    text.style.display = 'none';
    return;
  }
  $('flip').style.display = 'none'
  text.value = '';
  text.disabled = false;
  text.style.display = 'block';
  text.focus();
});
