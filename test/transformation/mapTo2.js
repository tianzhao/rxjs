
//emit every click on document
const source = fromEvent(document, 'click');
//map all emissions to one value
const example = source.pipe(mapTo('GOODBYE WORLD!'));
//output: (click)'GOODBYE WORLD!'...
const subscribe = example.subscribe(val => console.log(val));

