yaf.define_option(PLUGIN_SHORT_ID, 'draw', 'both');
var clear = document.createElement('button');
$('front').parentNode.insertBefore(clear, $('front').nextSibling);
set_text(clear, 'clear');
var canvas = document.createElement('canvas');
$('front').parentNode.insertBefore(canvas, $('front').nextSibling);
function resize_canvas() {
  if (canvas.dirty) return;
  var h = innerHeight * 0.5, w = innerWidth * 0.9;
  canvas.height = h * devicePixelRatio;
  canvas.width = w * devicePixelRatio;
  canvas.style.height = h + 'px';
  canvas.style.width = w + 'px';
}
canvas.style.border = '1px solid #000';
clear.style.background = '#aaa';
clear.style.width = '100%';
clear.style.marginLeft = 0;
clear.style.marginRight = 0;
clear.addEventListener('click', function() {
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  canvas.dirty = false;
  resize_canvas();
});
function draw_touch() {
  var context = canvas.getContext('2d');
  context.lineWidth = devicePixelRatio;
  var drawer = {
    isDrawing: false,
    touchstart: function (coors) {
      context.beginPath();
      context.moveTo(coors.x * devicePixelRatio, coors.y * devicePixelRatio);
      this.isDrawing = true;
    },
    touchmove: function (coors) {
      if (!this.isDrawing) return;
      canvas.dirty = true;
      context.lineTo(coors.x * devicePixelRatio, coors.y * devicePixelRatio);
      context.stroke();
    },
    touchend: function (coors) {
      if (!this.isDrawing) return;
      this.touchmove(coors);
      this.isDrawing = false;
    },
  };
  function draw(touchevent) {
    if (touchevent.type === 'touchmove') {
      touchevent.preventDefault();
    }
    if (!(touchevent && touchevent.targetTouches && touchevent.targetTouches[0]))
      return;
    var coors = {
      x: touchevent.targetTouches[0].pageX,
      y: touchevent.targetTouches[0].pageY,
    };
    var obj = canvas;
    if (obj.offsetParent) {
      do {
          coors.x -= obj.offsetLeft;
          coors.y -= obj.offsetTop;
      }
      while ((obj = obj.offsetParent) != null);
    }
    drawer[touchevent.type](coors);
  }
  canvas.addEventListener('touchstart', draw, false);
  canvas.addEventListener('touchmove', draw, false);
  canvas.addEventListener('touchend', draw, false);
}
function draw_mouse() {
  var context = canvas.getContext('2d');
  context.lineWidth = devicePixelRatio;
  function getPosition(mouseEvent) {
    var x, y;
    if (mouseEvent.pageX != undefined && mouseEvent.pageY != undefined) {
      x = mouseEvent.pageX;
      y = mouseEvent.pageY;
    } else {
      x = mouseEvent.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
      y = mouseEvent.clientY + document.body.scrollTop + document.documentElement.scrollTop;
    }
    return {X: x - canvas.offsetLeft, Y: y - canvas.offsetTop};
  }
  function drawLine(mouseEvent) {
    canvas.dirty = true;
    var position = getPosition(mouseEvent);
    context.lineTo(position.X * devicePixelRatio, position.Y * devicePixelRatio);
    context.stroke();
  }
  var mousemove = function(evt) {
    drawLine(evt);
  };
  var finishDrawing = function(mouseEvent) {
    drawLine(mouseEvent);
    context.closePath();
    canvas.removeEventListener('mousemove', mousemove, false);
    canvas.removeEventListener('mouseup', finishDrawing, false);
    canvas.removeEventListener('mouseout', finishDrawing, false);
  };
  canvas.addEventListener('mousedown', function (mouseEvent) {
    var position = getPosition(mouseEvent);
    context.moveTo(position.X * devicePixelRatio, position.Y * devicePixelRatio);
    context.beginPath();
    canvas.addEventListener('mousemove', mousemove, false);
    canvas.addEventListener('mouseup', finishDrawing, false);
    canvas.addEventListener('mouseout', finishDrawing, false);
  }, false);
}
if ('ontouchstart' in document.documentElement) {
  draw_touch();
} else {
  draw_mouse();
}
yaf.onStudy(function() {
  clear.click();
  canvas.style.display = clear.style.display = yaf.onStudy.card.get_option(PLUGIN_SHORT_ID, 'draw') ? 'block' : 'none';
});
addEventListener('load', resize_canvas);
addEventListener('resize', resize_canvas);
