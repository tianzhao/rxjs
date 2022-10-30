
// Create observable that emits click events
const source = fromEvent(document, 'click');
// Emit clicks at a rate of at most one click per second
const example = source.pipe(auditTime(1000))
// Output (example): '(1s) --- Clicked --- (1s) --- Clicked' 
const subscribe = example.subscribe(val => console.log('Clicked'));

