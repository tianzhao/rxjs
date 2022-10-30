
const fakeKeyPressesPost = keypresses =>
  of(201).pipe(
    tap(_ => {
      console.log(`received key presses are: ${keypresses}`);
    })
  );

fromEvent(document, 'keydown')
  .pipe(
    map(e => e.key),
    bufferCount(5),
    mergeMap(fakeKeyPressesPost)
  )
  .subscribe();

