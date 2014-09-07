var $ = function(i) { return document.querySelector('#' + i); }
var toArray = function(a) { return Array.prototype.slice.apply(a); }

var MIN_WIDTH = 300;  // TODO tune to fit screenshots
var colpad = 32;
var numcols = 1;

function resize() {
  // innerWidth - body.margin = numcols * colw + colpad * (numcols - 1)
  // innerWidth - body.margin + colpad = numcols * (colw + colpad)
  var colsw = innerWidth - 32/*body margin*/;
  var newnumcols = Math.max(1, Math.floor((colsw + colpad) / MIN_WIDTH));
  var examples = toArray(document.querySelectorAll('.example'));
  var colw = (colsw / newnumcols) - colpad;
  examples.forEach(function(example) {
    example.style.maxWidth = colw + 'px';
  });
  if (newnumcols === numcols) {
    return;
  }
  numcols = newnumcols;

  examples.forEach(function(example) {
    example.parentNode.removeChild(example);
  });
  toArray(document.querySelectorAll('.column')).forEach(function(col) {
    col.parentNode.removeChild(col);
  });
  var colheights = [];
  for (var i = 0; i < numcols; ++i) {
    var col = document.createElement('div');
    col.className = 'column';
    if (i != 0) {
      col.style.marginLeft = '1em';
    }
    colheights.push([0, i, col]);  // include i to help sort()
    document.body.appendChild(col);
  }
  examples.forEach(function(example) {
    colheights[0][2].appendChild(example);
    colheights[0][0] += example.offsetHeight;
    colheights.sort();
  });
}
addEventListener('resize', resize);
addEventListener('load', resize);
