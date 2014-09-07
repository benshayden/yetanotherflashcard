function heatmapDueDates() {
  var heatmap = {};
  yaf.Deck.forEach(function(deck) {
    yaf.Lesson.forEach(deck, function(lesson) {
      lesson.cards.forEach(function(card) {
        if (card.due in heatmap) {
          heatmap[card.due] += 1;
        } else {
          heatmap[card.due] = 1;
        }
      });
    });
  });
  return heatmap;
}

var dueDateHeatmap = heatmapDueDates();

var originalSchedule = yaf.Card.schedule;

function balancedSchedule(card) {
  var due = originalSchedule(card);
  if (yaf.Card.schedule !== balancedSchedule) {
    dueDateHeatmap = heatmapDueDates();
  }
  var dueFrame = due;
  if ((card.score > 2) && (card.get_other().due == due)) {
    due += ((Math.random() > 0.5) ? 1 : -1);
  }
  if (card.score > 6) {
    // if significantly more cards are due on |due| than on 2 days on either
    // side of dueFrame, then schedule |card| for the date with the fewest other
    // cards due on that day, if the card's other side is not also due on that
    // date.
    var possibleDueDate = due;
    for (var delta = -2; delta <= 2; ++delta) {
      var framedDue = dueFrame + delta;
      if ((card.get_other().due !== framedDue) &&
          ((dueDateHeatmap[possibleDueDate] - dueDateHeatmap[framedDue]) >
           ((possibleDueDate == due) ?
            (0.1 * dueDateHeatmap[due]) : 0))) {
        possibleDueDate = framedDue;
      }
    }
    due = possibleDueDate;
  }
  if (yaf.Card.schedule === balancedSchedule) {
    dueDateHeatmap[card.due] -= 1;
    dueDateHeatmap[due] += 1;
  }
  return due;
};

yaf.Card.schedule = balancedSchedule;

function rebalanceNow() {
  dueDateHeatmap = heatmapDueDates();
  // TODO
}
window.rebalanceDueDates = rebalanceNow;

// TODO buttons to rebalance everything now or decline, with message about
// calling rebalanceDueDates() on the command line if you disable and re-enable the
// plugin.
