
// elem ref
const searchBox = document.getElementById('search');

// streams
const keyup$ = fromEvent(searchBox, 'keyup')

// wait .5s between keyups to emit current value
keyup$.pipe(
  map(i => i.currentTarget.value),
  debounceTime(500)
)
.subscribe(console.log);

