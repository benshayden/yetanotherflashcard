if (history.replaceState && history.pushState) {
  history.replaceState(null, null, location.origin + location.pathname);
  history.pushState(null, null, location.href + '#study');
}
// Plugins may listen for onStudy, so wait for them to load.
addEventListener('load', function() {
  yaf.study();
});
