const source$ = of('Hello', 'Friend', 'Goodbye');

source$
  // emit on completion
  .pipe(endWith('Friend'))
  // 'Hello', 'Friend', 'Goodbye', 'Friend'
  .subscribe(console.log);

