document.cookie.split(';').forEach(function(a){
  var i = a.indexOf('=');
  var name = a.substr(0, i).trim();
  if (name.substr(0, 5) !== 'CSRFp') return;
  var csrf = document.getElementById('csrf');
  csrf.name = name;
  csrf.value = a.substr(i+1).trim();
});
