var CHOICES = 4;
var option = 'multiple choice';
yaf.define_option(PLUGIN_ID, option, 'both');
var multichoice = document.createElement('div');
$('front').parentNode.insertBefore(multichoice, $('front').nextSibling);
var buttons = [];
var tr = null;
var cols = Math.floor(Math.sqrt(CHOICES));
for (var i = 0; i < CHOICES; ++i) {
  if (i % cols == 0) {
    tr = document.createElement('div');
    multichoice.appendChild(tr);
  }
  var td = document.createElement('span');
  tr.appendChild(td);
  td.style.width = Math.floor(100 / cols) + '%';
  td.style.display = 'inline-block';
  var button = document.createElement('button');
  td.appendChild(button);
  buttons.push(button);
  button.style.color = 'black';
  button.style.background = 'white';
  button.style.border = '3px solid #888';
  button.style.paddingLeft = '.3em';
  button.style.paddingRight = '.3em';
  button.className = option.replace(' ', '_');
}
var next = document.createElement('button');
multichoice.appendChild(next);
set_text(next, 'next');
next.style.marginLeft = '0';
next.style.marginRight = '0';
next.style.width = '100%';
next.style.background = '#080';
addEventListener(yaf.onStudy.type, function() {
  if (!yaf.onStudy.card.get_option(PLUGIN_ID, option)) {
    multichoice.style.display = 'none';
    return;
  }
  multichoice.style.display = 'block';
  next.style.display = 'none';
  $('flip').style.display = 'none'
  var multi_correct = Math.floor(buttons.length * Math.random());
  var wrongs = [];
  yaf.Lesson.forEach(yaf.onStudy.card.deck, function(lesson) {
    if (!lesson.enable.checked) return;
    lesson.cards.forEach(function(other) {
      if ((other.direction === yaf.onStudy.card.direction) &&
          (other !== yaf.onStudy.card)) {
        wrongs.push(other);
      }
    });
  });
  buttons.forEach(function(button, buttoni) {
    button.disabled = false;
    button.style.border = '3px solid #888';
    if (buttoni === multi_correct) {
      set_text(button, yaf.onStudy.card.back);
    } else {
      var wrongi = Math.floor(wrongs.length * Math.random());
      set_text(button, wrongs[wrongi].back);
      wrongs.splice(wrongi, 1);
    }
    button.onclick = function() {
      buttons[multi_correct].style.border = '3px solid #080';
      if (buttoni === multi_correct) {
        yaf.study.good();
      } else {
        button.style.border = '3px solid #d00';
        yaf.study.bad();
      }
      buttons.forEach(function(b) {
        b.disabled = true;
      });
      next.style.display = 'block';
      next.focus();
    };
  });
});
next.addEventListener('click', function() {
  yaf.study();
});
