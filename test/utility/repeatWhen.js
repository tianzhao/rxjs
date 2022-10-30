
const source = of('Repeat message');
const documentClick$ = fromEvent(document, 'click');

source.pipe(repeatWhen(() => documentClick$)
).subscribe(data => console.log(data))

