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
$('cancel').addEventListener('click', function() {
  location.href = '/';
});

function disableSave() {
  console.debug($('title').value);
  $('save').disabled = !$('title').value;
}
$('title').addEventListener('keyup', disableSave);
$('title').addEventListener('change', disableSave);
if (window.CodeMirror) {
  CodeMirror.defaults.lineNumbers = true;
  CodeMirror.defaults.viewportMargin = Infinity;
  CodeMirror.fromTextArea($('text'));
  function resize() {
    var maxh = innerHeight - (4.5 * parseInt(getComputedStyle(document.body)['margin-top'])) - $('user').offsetHeight - $('title').offsetHeight - $('save').offsetHeight;
    document.querySelector('.CodeMirror-scroll').style.maxHeight = maxh + 'px';
  }
  addEventListener('load', resize);
  addEventListener('resize', resize);
}
