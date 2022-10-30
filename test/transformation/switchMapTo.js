
const COUNTDOWN_TIME = 10;

// reference
const countdownElem = document.getElementById('countdown');

// streams
const click$ = fromEvent(document, 'click');
const countdown$ = interval(1000).pipe(
  scan((acc, _) => --acc, COUNTDOWN_TIME),
  startWith(COUNTDOWN_TIME)
);

click$.pipe(
  switchMapTo(countdown$),
  takeWhile(val => val >= 0),
  finalize(() => countdownElem.innerHTML = "We're done here!")
)
.subscribe(val => countdownElem.innerHTML = val);


