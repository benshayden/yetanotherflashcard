var $ = function(i) { return document.querySelector('#' + i); }
var toArray = function(a) { return Array.prototype.slice.apply(a); }
document.cookie.split(';').forEach(function(a){
  var i = a.indexOf('=');
  var name = a.substr(0, i).trim();
  if (name.substr(0, 5) !== 'CSRFe') return;
  var csrf = document.getElementById('csrf');
  csrf.name = name;
  csrf.value = a.substr(i+1).trim();
});
$('text').focus();
function disableSave() {
  // TODO also disable save if title and text are unchanged
  console.debug($('title').value);
  $('save').disabled = !$('title').value;
}
// TODO disable share if text is changed
$('title').addEventListener('keyup', disableSave);
$('title').addEventListener('change', disableSave);
if (window.CodeMirror) {
  CodeMirror.defaults.lineNumbers = true;
  CodeMirror.defaults.viewportMargin = Infinity;
  CodeMirror.fromTextArea($('text'));
  function resize() {
    var maxh = innerHeight - $('controls').offsetHeight - $('title').offsetHeight - 44;
    document.querySelector('.CodeMirror-scroll').style.maxHeight = maxh + 'px';
  }
  addEventListener('load', resize);
  addEventListener('resize', resize);
}
$('share').addEventListener('click', function(e) {
  $('share').style.display = 'none';
  var i = $('sharelink');
  i.style.display = 'block';
  i.focus();
  i.select();
  (i.createTextRange ? i.createTextRange() : document).execCommand('copy');
});
$('history').addEventListener('click', function() {
  console.log('TODO');
});
