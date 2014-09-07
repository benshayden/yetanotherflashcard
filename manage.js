var $ = function(i) { return document.querySelector('#' + i); }
var toArray = function(a) { return Array.prototype.slice.apply(a); }

function remove_childNodes(elem) {
  toArray(elem.childNodes).forEach(function(c) {
    elem.removeChild(c);
  });
  try {elem.innerText = '';}catch(e){}
  try {elem.textContent = '';}catch(e){}
}

function set_text(elem, text) {
  remove_childNodes(elem);
  elem.appendChild(document.createTextNode(text));
}

$('upload').onclick = function() {
  $('upload-files').click();
};
$('upload-files').onchange = function() {
  $('upload-form').submit();
};
document.cookie.split(';').forEach(function(a){
  var i = a.indexOf('=');
  var name = a.substr(0, i).trim();
  if (name != 'CSRFm') return;
  var value = a.substr(i+1).trim();
  toArray(document.querySelectorAll('input[type=hidden][name='+name+']')).forEach(function(i) {
    i.value = value;
  });
});

var hash = location.hash;
location.hash = '';
if (hash.substr(0, 3) == '#e=') {
  $('error' + parseInt(hash.substr(3))).style.display = 'block';
}

toArray(document.querySelectorAll('a.share')).forEach(function(a) {
  a.onclick = function() {
    var url = $('share-url-' + a.id.substr(6));
    url.value = a.href;
    var max_width = url.parentNode.offsetWidth;
    url.hidden = false;
    while (url.offsetWidth > max_width) {
      --url.size;
    }
    --url.size;
    url.select();
    url.focus();
    return false;
  };
});

var MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

function formatDateTime(dt) {
  // AppEngine datetimes are UTC and naive.
  dt = new Date(dt.nodeValue + '+00:00');
  var now = new Date();
  var formatted = '';
  if (dt.getFullYear() != now.getFullYear()) {
    formatted += dt.getFullYear() + ' ';
  }
  console.log(dt.getMonth());
  if ((dt.getMonth() + ' ' + dt.getDate()) != (now.getMonth() + ' ' + now.getDate())) {
    formatted += MONTHS[dt.getMonth()] + ' ' + dt.getDate() + ' ';
  }
  var hour = dt.getHours() % 12;
  if (hour === 0) hour = 12;
  var minute = dt.getMinutes();
  if (minute < 10) minute = '0' + minute;
  formatted += hour + ':' + minute;
  formatted += (dt.getHours() >= 12) ? 'pm' : 'am';
  return formatted;
}

toArray(document.querySelectorAll('.datetime')).forEach(function(elem) {
  set_text(elem, formatDateTime(elem.childNodes[0]));
});
